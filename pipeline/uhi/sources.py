"""Data access: Landsat C2 L2 and ESA WorldCover via the Planetary Computer
STAC API (a public mirror of the USGS archive), Natural Earth borders, and
Nominatim geocoding. Every download is cached under data/cache.
"""
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import planetary_computer as pc
import pystac_client
import rasterio
import requests
from rasterio import features
from rasterio.enums import Resampling
from rasterio.vrt import WarpedVRT
from shapely.geometry import shape
from shapely.ops import transform as shp_transform
from pyproj import Transformer

from .config import MAX_SCENE_CLOUD, SEASON_MONTHS, CityConfig
from .grid import Grid

STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
NE_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/"
    "geojson/ne_10m_admin_0_countries.geojson"
)
USER_AGENT = "lahore-uhi-research/0.1 (open-source research prototype)"

os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("GDAL_HTTP_MAX_RETRY", "5")
os.environ.setdefault("GDAL_HTTP_RETRY_DELAY", "2")
os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif,.TIF")

# asset key -> (source nodata, resampling)
BANDS = {
    "qa_pixel": (1, Resampling.nearest),   # bit 0 = fill
    "lwir11": (0, Resampling.bilinear),    # ST_B10
    "qa": (-9999, Resampling.bilinear),    # ST_QA, uncertainty in 0.01 K
    "red": (0, Resampling.bilinear),
    "nir08": (0, Resampling.bilinear),
    "green": (0, Resampling.bilinear),
    "blue": (0, Resampling.bilinear),
}
CORE_BANDS = ("qa_pixel", "lwir11", "qa", "red", "nir08")
RGB_BANDS = ("red", "green", "blue")


@dataclass
class Scene:
    id: str
    date: str
    year: int
    platform: str
    cloud: float
    item: object  # pystac.Item


def _catalog():
    return pystac_client.Client.open(STAC_URL)


def search_scenes(city: CityConfig, years: list[int]) -> list[Scene]:
    out: list[Scene] = []
    cat = _catalog()
    m0, m1 = SEASON_MONTHS
    for y in years:
        search = cat.search(
            collections=["landsat-c2-l2"],
            bbox=city.bbox,
            datetime=f"{y}-{m0:02d}-01/{y}-{m1:02d}-30",
            query={
                "platform": {"in": ["landsat-8", "landsat-9"]},
                "landsat:wrs_path": {"eq": city.wrs_path},
                "landsat:wrs_row": {"eq": city.wrs_row},
                "eo:cloud_cover": {"lte": MAX_SCENE_CLOUD},
            },
        )
        for it in search.items():
            p = it.properties
            out.append(Scene(it.id, p["datetime"][:10], y, p["platform"], float(p["eo:cloud_cover"]), it))
    out.sort(key=lambda s: s.date)
    return out


def _read_band(href: str, grid: Grid, nodata, resampling) -> np.ndarray:
    with rasterio.open(href) as src:
        with WarpedVRT(
            src,
            crs=grid.crs,
            transform=grid.transform,
            width=grid.width,
            height=grid.height,
            resampling=resampling,
            src_nodata=nodata,
            nodata=nodata,
        ) as vrt:
            return vrt.read(1)


def read_scene(scene: Scene, grid: Grid, bands: tuple[str, ...], cache_dir: Path) -> dict[str, np.ndarray]:
    """Read the requested bands resampled onto the grid, using a per-band cache."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    result: dict[str, np.ndarray] = {}
    missing = []
    for b in bands:
        f = cache_dir / f"{scene.id}_{b}.npy"
        if f.exists():
            result[b] = np.load(f)
        else:
            missing.append(b)
    if missing:
        signed = pc.sign(scene.item)

        def fetch(b):
            nodata, rs = BANDS[b]
            arr = _read_band(signed.assets[b].href, grid, nodata, rs)
            np.save(cache_dir / f"{scene.id}_{b}.npy", arr)
            return b, arr

        with ThreadPoolExecutor(max_workers=len(missing)) as ex:
            for b, arr in ex.map(fetch, missing):
                result[b] = arr
    return result


def read_worldcover(city: CityConfig, grid: Grid, cache_dir: Path) -> np.ndarray:
    f = cache_dir / "worldcover_2021.npy"
    if f.exists():
        return np.load(f)
    cat = _catalog()
    items = list(cat.search(collections=["esa-worldcover"], bbox=city.bbox,
                            query={"esa_worldcover:product_version": {"eq": "2.0.0"}}).items())
    if not items:
        raise RuntimeError("No WorldCover v200 tiles found for the study area")
    out = np.zeros(grid.shape, dtype=np.uint8)
    for it in items:
        arr = _read_band(pc.sign(it).assets["map"].href, grid, 0, Resampling.mode)
        out = np.where(out == 0, arr, out)
    cache_dir.mkdir(parents=True, exist_ok=True)
    np.save(f, out)
    return out


def country_mask(city: CityConfig, grid: Grid, cache_dir: Path) -> np.ndarray:
    """Boolean mask of pixels inside the city's country (Natural Earth 1:10m)."""
    f = cache_dir / "ne_10m_admin_0_countries.geojson"
    if not f.exists():
        cache_dir.mkdir(parents=True, exist_ok=True)
        r = requests.get(NE_URL, timeout=300, headers={"User-Agent": USER_AGENT})
        r.raise_for_status()
        f.write_bytes(r.content)
    fc = json.loads(f.read_text(encoding="utf-8"))
    feat = next(ft for ft in fc["features"] if ft["properties"].get("ADM0_A3") == city.country_iso3)
    tr = Transformer.from_crs("EPSG:4326", grid.crs, always_xy=True)
    geom = shp_transform(tr.transform, shape(feat["geometry"]))
    return features.rasterize([(geom, 1)], out_shape=grid.shape, transform=grid.transform, fill=0).astype(bool)


def geocode(query: str, cache_dir: Path) -> tuple[float, float, str] | None:
    """Nominatim lookup (1 request/s per the usage policy), cached."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    f = cache_dir / "geocode.json"
    cache = json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}
    if query not in cache:
        time.sleep(1.1)
        r = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": query, "format": "jsonv2", "limit": 1},
            headers={"User-Agent": USER_AGENT},
            timeout=30,
        )
        r.raise_for_status()
        hits = r.json()
        cache[query] = (
            {"lon": float(hits[0]["lon"]), "lat": float(hits[0]["lat"]), "label": hits[0]["display_name"]}
            if hits else None
        )
        f.write_text(json.dumps(cache, indent=1, ensure_ascii=False), encoding="utf-8")
    hit = cache[query]
    return (hit["lon"], hit["lat"], hit["label"]) if hit else None
