"""Build all products for one city.

    python build.py --city lahore

Outputs
  web/data/<city>/*.tif          Cloud-Optimized GeoTIFF cubes (point queries)
  web/public/data/<city>/*.webp  colourised overlays (display only)
  web/public/data/<city>/manifest.json, summary.json
"""
import argparse
import json
import shutil
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import rasterio
from rasterio.shutil import copy as rio_copy

from uhi import config as C
from uhi.grid import make_grid
from uhi.masks import circle_mask, rural_mask, urban_mask
from uhi.render import colourise, ramp, truecolour
from uhi.sources import CORE_BANDS, RGB_BANDS, country_mask, geocode, read_scene, read_worldcover, search_scenes
from uhi.stats import correlation, period_difference, trend

warnings.filterwarnings("ignore", message="All-NaN slice")
warnings.filterwarnings("ignore", message="Mean of empty slice")

ROOT = Path(__file__).resolve().parent.parent
NODATA_I16 = -32768
# cube variable -> integer scale used when storing as int16
CUBES = {"lst": 100, "anom": 100, "ndvi": 10000, "unc": 100}


def r(v, nd=3):
    return None if v is None or not np.isfinite(v) else round(float(v), nd)


def physical(d: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    qa = d["qa_pixel"].astype(np.uint16)
    reject = np.zeros(qa.shape, bool)
    for bit in C.QA_REJECT_BITS:
        reject |= (qa >> bit) & 1 == 1
    st = d["lwir11"].astype("f4")
    lst = np.where((st > 0) & ~reject, st * C.ST_SCALE + C.ST_OFFSET - 273.15, np.nan)
    red = d["red"].astype("f4") * C.SR_SCALE + C.SR_OFFSET
    nir = d["nir08"].astype("f4") * C.SR_SCALE + C.SR_OFFSET
    ok = (d["red"] > 0) & (d["nir08"] > 0) & ~reject & (red >= 0) & (nir >= 0) & (red <= 1) & (nir <= 1)
    with np.errstate(divide="ignore", invalid="ignore"):
        ndvi = np.where(ok & ((nir + red) > 0), (nir - red) / (nir + red), np.nan)
    unc = np.where((d["qa"] > 0) & np.isfinite(lst), d["qa"].astype("f4") * C.ST_QA_SCALE, np.nan)
    return lst, ndvi, unc


def masked_mean(a, m):
    v = a[m]
    v = v[np.isfinite(v)]
    return float(v.mean()) if v.size else None


def valid_fraction(a, m):
    return float(np.isfinite(a[m]).mean()) if m.any() else 0.0


def open_cube(path: Path, grid, count: int):
    path.parent.mkdir(parents=True, exist_ok=True)
    return rasterio.open(
        path, "w", driver="GTiff", width=grid.width, height=grid.height, count=count,
        dtype="int16", nodata=NODATA_I16, crs=grid.crs, transform=grid.transform,
        tiled=True, blockxsize=256, blockysize=256, compress="deflate", predictor=2,
        interleave="pixel",
    )


def to_i16(a, scale):
    out = np.full(a.shape, NODATA_I16, np.int16)
    f = np.isfinite(a)
    out[f] = np.clip(np.round(a[f] * scale), -32767, 32767).astype(np.int16)
    return out


def write_landcover(wc: np.ndarray, grid, cube_dir: Path) -> None:
    """ESA WorldCover 2021 class per pixel, for point inspection."""
    cube_dir.mkdir(parents=True, exist_ok=True)
    tmp = cube_dir / "landcover.tmp.tif"
    with rasterio.open(tmp, "w", driver="GTiff", width=grid.width, height=grid.height, count=1,
                       dtype="uint8", nodata=0, crs=grid.crs, transform=grid.transform,
                       tiled=True, blockxsize=256, blockysize=256, compress="deflate") as ds:
        ds.write(wc, 1)
    rio_copy(tmp, cube_dir / "landcover.tif", driver="COG", compress="DEFLATE", blocksize=256,
             overview_resampling="mode")
    tmp.unlink()


def main(city_id: str) -> None:
    city = C.CITIES[city_id]
    cache = ROOT / "data" / "cache"
    cube_dir = ROOT / "web" / "data" / city.id
    pub = ROOT / "web" / "public" / "data" / city.id
    ov = pub / "overlays"
    grid = make_grid(city)
    print(f"grid {grid.width}x{grid.height}")

    # ---- static masks -------------------------------------------------------
    wc = read_worldcover(city, grid, cache)
    in_country = country_mask(city, grid, cache)
    dist = grid.ground_distance_km(*city.center)
    urban = urban_mask(city, grid, wc, dist)
    rural = rural_mask(city.rural_ring_km, wc, dist, in_country)
    rural_alt = rural_mask(city.rural_ring_alt_km, wc, dist, in_country)
    print(f"urban px {urban.sum()}, rural px {rural.sum()}, rural_alt px {rural_alt.sum()}")
    write_landcover(wc, grid, cube_dir)
    zones = np.full(grid.shape, np.nan, "f4")
    zones[rural] = 0.0
    zones[urban] = 1.0
    colourise(zones, 0, 1, "cool", ov / "zones.webp", nodata_rgba=(0, 0, 0, 0))

    hoods = []
    for nb in city.neighbourhoods:
        g = (*nb.fixed, nb.query) if nb.fixed else geocode(nb.query, cache)
        if g is None:
            print(f"  geocode failed: {nb.name}")
            continue
        hoods.append({"id": nb.id, "name": nb.name, "lon": g[0], "lat": g[1], "geocoded_as": g[2],
                      "radius_m": C.NEIGHBOURHOOD_RADIUS_M, "mask": circle_mask(grid, g[0], g[1])})

    # ---- scenes -------------------------------------------------------------
    scenes = search_scenes(city, C.YEARS)
    print(f"{len(scenes)} candidate scenes")
    keys = [str(y) for y in C.YEARS] + list(C.PERIODS)
    band_of = {k: i + 1 for i, k in enumerate(keys)}
    cubes = {v: open_cube(cube_dir / f"{v}.tmp.tif", grid, len(keys)) for v in CUBES}
    count_cube = open_cube(cube_dir / "count.tmp.tif", grid, len(keys))

    period_of_year = {y: p for p, (a, b) in C.PERIODS.items() for y in range(a, b + 1)}
    pools: dict[str, dict[str, list]] = {p: {"lst": [], "anom": [], "ndvi": [], "unc": [], "rgb": []} for p in C.PERIODS}
    scene_rows = []

    for year in C.YEARS:
        stacks = {"lst": [], "anom": [], "ndvi": [], "unc": []}
        for sc in [s for s in scenes if s.year == year]:
            want = CORE_BANDS + (RGB_BANDS if year in period_of_year else ())
            d = read_scene(sc, grid, tuple(dict.fromkeys(want)), cache / "scenes")
            lst, ndvi, unc = physical(d)
            row = {"id": sc.id, "date": sc.date, "platform": sc.platform, "scene_cloud_pct": sc.cloud,
                   "urban_valid": round(valid_fraction(lst, urban), 3),
                   "rural_valid": round(valid_fraction(lst, rural), 3)}
            if row["urban_valid"] < C.MIN_URBAN_VALID_FRACTION or row["rural_valid"] < C.MIN_RURAL_VALID_FRACTION:
                row["accepted"] = False
                row["reason"] = "insufficient clear pixels over city or rural reference"
                scene_rows.append(row)
                print(f"  {sc.date} rejected ({row['urban_valid']:.2f}/{row['rural_valid']:.2f})")
                continue
            rural_med = float(np.nanmedian(lst[rural]))
            rural_alt_med = float(np.nanmedian(lst[rural_alt]))
            anom = lst - rural_med
            urban_lst = masked_mean(lst, urban)
            row.update({
                "accepted": True,
                "rural_lst": r(rural_med), "rural_alt_lst": r(rural_alt_med),
                "urban_lst": r(urban_lst), "uhi": r(urban_lst - rural_med), "uhi_alt": r(urban_lst - rural_alt_med),
                "urban_ndvi": r(masked_mean(ndvi, urban)), "rural_ndvi": r(masked_mean(ndvi, rural)),
                "urban_unc_k": r(float(np.nanmedian(unc[urban]))),
                "hoods": {},
            })
            for h in hoods:
                vf = valid_fraction(lst, h["mask"])
                row["hoods"][h["id"]] = None if vf < 0.5 else {
                    "lst": r(masked_mean(lst, h["mask"])), "anom": r(masked_mean(anom, h["mask"])),
                    "ndvi": r(masked_mean(ndvi, h["mask"]))}
            scene_rows.append(row)
            print(f"  {sc.date} {sc.platform} uhi={row['uhi']:+.2f} rural={rural_med:.1f}")
            for k, a in (("lst", lst), ("anom", anom), ("ndvi", ndvi), ("unc", unc)):
                stacks[k].append(a)
            if year in period_of_year:
                p = pools[period_of_year[year]]
                for k, a in (("lst", lst), ("anom", anom), ("ndvi", ndvi), ("unc", unc)):
                    p[k].append(a.astype(np.float16))
                reject = ~np.isfinite(lst)
                rgb = [np.where(reject | (d[b] == 0), np.nan, d[b].astype("f4") * C.SR_SCALE + C.SR_OFFSET) for b in RGB_BANDS]
                p["rgb"].append(np.stack(rgb).astype(np.float16))

        n = len(stacks["lst"])
        band = band_of[str(year)]
        if n == 0:
            print(f"{year}: no accepted scenes")
            for v, ds in cubes.items():
                ds.write(np.full(grid.shape, NODATA_I16, np.int16), band)
            count_cube.write(np.zeros(grid.shape, np.int16), band)
            continue
        comp = {k: np.nanmedian(np.stack(v), axis=0) for k, v in stacks.items()}
        cnt = np.isfinite(np.stack(stacks["lst"])).sum(axis=0).astype(np.int16)
        for v, ds in cubes.items():
            ds.write(to_i16(comp[v], CUBES[v]), band)
        count_cube.write(cnt, band)
        for v in ("lst", "anom", "ndvi"):
            dsp = C.DISPLAY[v]
            colourise(comp[v], dsp["min"], dsp["max"], dsp["cmap"], ov / f"{v}_{year}.webp")
        print(f"{year}: {n} scenes composited")
        del stacks, comp

    # ---- periods ------------------------------------------------------------
    period_comp = {}
    for p, pool in pools.items():
        band = band_of[p]
        comp = {k: np.nanmedian(np.stack(pool[k]).astype("f4"), axis=0) for k in ("lst", "anom", "ndvi", "unc")}
        cnt = np.isfinite(np.stack(pool["lst"]).astype("f4")).sum(axis=0).astype(np.int16)
        for v, ds in cubes.items():
            ds.write(to_i16(comp[v], CUBES[v]), band)
        count_cube.write(cnt, band)
        for v in ("lst", "anom", "ndvi"):
            dsp = C.DISPLAY[v]
            colourise(comp[v], dsp["min"], dsp["max"], dsp["cmap"], ov / f"{v}_{p}.webp")
        rgb = np.nanmedian(np.stack(pool["rgb"]).astype("f4"), axis=0)
        truecolour(rgb[0], rgb[1], rgb[2], ov / f"truecolour_{p}.webp")
        period_comp[p] = comp
        print(f"{p}: {len(pool['lst'])} scenes")
        pools[p] = None

    p1, p2 = list(C.PERIODS)
    d_anom = period_comp[p2]["anom"] - period_comp[p1]["anom"]
    d_ndvi = period_comp[p2]["ndvi"] - period_comp[p1]["ndvi"]
    colourise(d_anom, C.DISPLAY["d_anom"]["min"], C.DISPLAY["d_anom"]["max"], C.DISPLAY["d_anom"]["cmap"], ov / "d_anom.webp")
    colourise(d_ndvi, C.DISPLAY["d_ndvi"]["min"], C.DISPLAY["d_ndvi"]["max"], C.DISPLAY["d_ndvi"]["cmap"], ov / "d_ndvi.webp")

    for v, ds in list(cubes.items()) + [("count", count_cube)]:
        ds.close()
        tmp = cube_dir / f"{v}.tmp.tif"
        rio_copy(tmp, cube_dir / f"{v}.tif", driver="COG", compress="DEFLATE", predictor="2",
                 blocksize=256, overview_resampling="nearest", interleave="PIXEL")
        tmp.unlink()

    # ---- statistics ---------------------------------------------------------
    acc = [s for s in scene_rows if s.get("accepted")]
    years = C.YEARS

    def annual(field, rows=acc, hood=None):
        out = []
        for y in years:
            vals = []
            for s in rows:
                if not s["date"].startswith(str(y)):
                    continue
                v = s["hoods"].get(hood, None) if hood else s
                v = v.get(field) if v else None
                if v is not None:
                    vals.append(v)
            out.append(r(float(np.median(vals))) if vals else None)
        return out

    def in_period(s, p):
        a, b = C.PERIODS[p]
        return a <= int(s["date"][:4]) <= b

    def period_test(field, hood=None):
        def vals(p):
            out = []
            for s in acc:
                if not in_period(s, p):
                    continue
                v = s["hoods"].get(hood) if hood else s
                if v and v.get(field) is not None:
                    out.append(v[field])
            return out
        return period_difference(vals(p1), vals(p2))

    l8 = [s for s in acc if s["platform"] == "landsat-8"]
    city_series = {
        "years": years,
        "n_scenes": [sum(1 for s in acc if s["date"].startswith(str(y))) for y in years],
        "uhi": annual("uhi"), "uhi_alt": annual("uhi_alt"), "uhi_l8_only": annual("uhi", l8),
        "urban_lst": annual("urban_lst"), "rural_lst": annual("rural_lst"),
        "urban_ndvi": annual("urban_ndvi"), "rural_ndvi": annual("rural_ndvi"),
        "urban_unc_k": annual("urban_unc_k"),
    }
    city_trends = {k: trend(years, city_series[k]) for k in
                   ("uhi", "uhi_alt", "uhi_l8_only", "urban_lst", "rural_lst", "urban_ndvi", "rural_ndvi")}
    city_periods = {k: period_test(k) for k in ("uhi", "urban_ndvi", "urban_lst", "rural_lst")}

    hood_out = []
    for h in hoods:
        s_anom, s_ndvi, s_lst = annual("anom", hood=h["id"]), annual("ndvi", hood=h["id"]), annual("lst", hood=h["id"])
        hood_out.append({k: h[k] for k in ("id", "name", "lon", "lat", "geocoded_as", "radius_m")} | {
            "series": {"anom": s_anom, "ndvi": s_ndvi, "lst": s_lst},
            "trends": {"anom": trend(years, s_anom), "ndvi": trend(years, s_ndvi)},
            "periods": {"anom": period_test("anom", h["id"]), "ndvi": period_test("ndvi", h["id"])},
        })

    # NDVI vs LST anomaly, sampled from each period composite
    rng = np.random.default_rng(42)
    scatter = {}
    for p, comp in period_comp.items():
        ok = np.isfinite(comp["ndvi"]) & np.isfinite(comp["anom"]) & in_country & (urban | rural)
        idx = np.flatnonzero(ok)
        pick = rng.choice(idx, size=min(2500, idx.size), replace=False)
        cls = np.where(urban.ravel()[pick], "urban", "rural")
        nd, an = comp["ndvi"].ravel()[pick], comp["anom"].ravel()[pick]
        all_ok = np.flatnonzero(ok)
        scatter[p] = {
            "points": [[r(a, 3), r(b, 2), c[0]] for a, b, c in zip(nd, an, cls)],
            "stats": correlation(comp["ndvi"].ravel()[all_ok], comp["anom"].ravel()[all_ok]),
        }

    # Distribution of urban-core anomaly per period
    bins = np.arange(-10, 12.5, 0.5)
    hist = {}
    for p, comp in period_comp.items():
        v = comp["anom"][urban]
        v = v[np.isfinite(v)]
        h, _ = np.histogram(v, bins=bins)
        hist[p] = {"bins": bins.tolist(), "counts": h.tolist(), "median": r(np.median(v)),
                   "p90": r(np.percentile(v, 90))}

    period_counts = {p: sum(1 for s in acc if in_period(s, p)) for p in C.PERIODS}

    summary = {
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "city": {"id": city.id, "name": city.name, "center": city.center, "bbox": city.bbox,
                 "wrs": f"{city.wrs_path}/{city.wrs_row}"},
        "season": {"months": C.SEASON_MONTHS, "label": "May–June"},
        "periods": {p: {"years": list(v), "n_scenes": period_counts[p]} for p, v in C.PERIODS.items()},
        "masks": {"urban_px": int(urban.sum()), "rural_px": int(rural.sum()), "rural_alt_px": int(rural_alt.sum()),
                  "urban_radius_km": city.urban_radius_km, "rural_ring_km": city.rural_ring_km,
                  "rural_ring_alt_km": city.rural_ring_alt_km},
        "scenes": [{k: v for k, v in s.items() if k != "hoods"} for s in scene_rows],
        "city_series": city_series,
        "city_trends": city_trends,
        "city_periods": city_periods,
        "neighbourhoods": hood_out,
        "scatter": scatter,
        "histogram": hist,
    }
    pub.mkdir(parents=True, exist_ok=True)
    (pub / "summary.json").write_text(json.dumps(summary, ensure_ascii=False), encoding="utf-8")

    layers = {
        "lst": {"label": "Land surface temperature", "unit": "°C", "keys": keys,
                "desc": "Median clear-sky Landsat surface temperature, ~10:40 local time."},
        "anom": {"label": "LST anomaly vs rural", "unit": "°C", "keys": keys,
                 "desc": "Surface temperature minus the same-day median of the rural cropland reference."},
        "ndvi": {"label": "Vegetation (NDVI)", "unit": "", "keys": keys,
                 "desc": "Normalized Difference Vegetation Index from Landsat surface reflectance."},
        "d_anom": {"label": "Change in LST anomaly", "unit": "°C", "keys": ["change"],
                   "desc": f"{C.PERIODS[p2][0]}–{C.PERIODS[p2][1]} minus {C.PERIODS[p1][0]}–{C.PERIODS[p1][1]}."},
        "d_ndvi": {"label": "Change in NDVI", "unit": "", "keys": ["change"],
                   "desc": f"{C.PERIODS[p2][0]}–{C.PERIODS[p2][1]} minus {C.PERIODS[p1][0]}–{C.PERIODS[p1][1]}."},
    }
    for k, v in layers.items():
        dsp = C.DISPLAY[k]
        v["legend"] = {"min": dsp["min"], "max": dsp["max"], "colors": ramp(dsp["cmap"])}

    manifest = {
        "city": city.id, "name": city.name, "center": city.center, "bbox": city.bbox,
        "corners": grid.corners_lonlat(),
        "grid": {"width": grid.width, "height": grid.height, "crs": grid.crs,
                 "transform": list(grid.transform)[:6], "res_m": C.GRID_RES_M},
        "years": years, "periods": {p: list(v) for p, v in C.PERIODS.items()},
        "bands": band_of, "cube_scales": CUBES | {"count": 1}, "nodata": NODATA_I16,
        "layers": layers,
        "truecolour": {p: f"truecolour_{p}.webp" for p in C.PERIODS},
        "neighbourhoods": [{k: h[k] for k in ("id", "name", "lon", "lat", "radius_m")} for h in hoods],
    }
    (pub / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print("done")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--city", default="lahore", choices=list(C.CITIES))
    main(ap.parse_args().city)
