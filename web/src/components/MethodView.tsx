"use client";
import type { Summary } from "@/lib/types";

export default function MethodView({ summary }: { summary: Summary | null }) {
  const used = summary?.scenes.filter((s) => s.accepted).length;
  return (
    <div className="h-full overflow-y-auto scroll-thin">
      <article className="max-w-[760px] mx-auto px-6 py-10 text-[14px] leading-[1.7] text-fg/90 space-y-8">
        <header>
          <h1 className="text-[24px] font-semibold tracking-tight text-fg">Method and data</h1>
          <p className="text-muted mt-2">
            How the maps and numbers in this prototype are produced, what they mean, and where they fall short.
          </p>
        </header>

        <S title="The question">
          <p>
            How do urban expansion and vegetation loss relate to land surface temperature across Lahore? Built surfaces
            absorb and re-emit more heat than vegetated or moist ground. The result is an <i>urban heat island</i>, which
            raises heat stress, energy demand and health risk in a city that already reaches 45 °C+ air temperatures in
            pre-monsoon heatwaves.
          </p>
        </S>

        <S title="What is measured, and what isn’t">
          <p>
            Landsat measures <b>land surface temperature</b> (LST): the radiative temperature of roofs, roads, soil and
            canopy at about <b>10:40 local time</b>. That is <b>not air temperature</b>. Surface heat islands are strongest
            in the daytime, while air-temperature heat islands usually peak at night, which Landsat doesn’t observe.
          </p>
        </S>

        <S title="Data">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <b>Landsat 8 OLI/TIRS and Landsat 9 OLI-2/TIRS-2, Collection 2 Level-2</b> (NASA/USGS). Surface temperature
              band ST_B10, its uncertainty band ST_QA, surface reflectance bands 4 and 5 for NDVI, and QA_PIXEL for cloud
              masking. All scenes come from WRS-2 path 149 / row 38, so every observation shares one orbit and overpass
              time. They were accessed through the Microsoft Planetary Computer mirror of the USGS archive.
            </li>
            <li><b>ESA WorldCover 2021 v200</b> (10 m, CC BY 4.0): defines the urban core and rural cropland reference.</li>
            <li><b>Natural Earth</b> admin-0 boundaries (public domain): keeps the rural reference inside Pakistan.</li>
            <li><b>OpenStreetMap / Nominatim / Photon</b> (ODbL): neighbourhood centroids and place search.</li>
            <li>Basemaps: <b>Sentinel-2 cloudless 2024</b> by EOX (CC BY-NC-SA 4.0), <b>OpenFreeMap</b> (OSM, ODbL), and our own Landsat true-colour composites.</li>
          </ul>
        </S>

        <S title="Processing">
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>Select every Landsat 8/9 scene from May 1 to June 30, 2014–2025, with scene cloud cover ≤ 60%.</li>
            <li>Mask fill, cloud, dilated cloud, cirrus, cloud shadow and snow with QA_PIXEL. Reproject to a 35 m Web-Mercator grid (≈ 30 m on the ground).</li>
            <li>Convert ST_B10 to °C (DN × 0.00341802 + 149.0 − 273.15). Compute NDVI from reflectance (DN × 2.75e-5 − 0.2).</li>
            <li>Keep a scene only if ≥ 60% of the urban core and ≥ 50% of the rural reference are clear{used ? ` (${used} scenes used)` : ""}.</li>
            <li>
              <b>Anomaly:</b> subtract the same-scene median LST of the rural reference from every pixel. This removes
              most of the day-to-day weather signal, so different dates can be compared.
            </li>
            <li>Composite each year, and each 3-season period (2014–16, 2023–25), as the per-pixel median of the scene values.</li>
          </ol>
        </S>

        <S title="Reference areas">
          <p>
            <b>Urban core:</b> WorldCover built-up pixels within {summary?.masks.urban_radius_km ?? 18} km of central Lahore.
            <br />
            <b>Rural reference:</b> homogeneous cropland (≥ 80% cropland in a ~210 m window) {summary ? `${summary.masks.rural_ring_km[0]}–${summary.masks.rural_ring_km[1]}` : "25–40"} km
            from the centre, ≥ 1 km from water and ≥ 2 km inside the national border. A second ring
            ({summary ? `${summary.masks.rural_ring_alt_km[0]}–${summary.masks.rural_ring_alt_km[1]}` : "20–30"} km) is a sensitivity check.
            In May–June many fields are bare after the wheat harvest and can be hotter than the city. So a negative or small
            surface heat island at this time of day is a real result, not an error.
          </p>
        </S>

        <S title="Statistics">
          <ul className="list-disc pl-5 space-y-1.5">
            <li><b>Trends:</b> Theil–Sen slope with a 95% interval, and a Mann–Kendall (Kendall τ) test, on annual medians.</li>
            <li><b>Period change:</b> two-sided permutation test (20,000 permutations) on scene-level values. Each date counts once. Bootstrap 95% interval.</li>
            <li><b>Vegetation–temperature relationship:</b> Pearson and Spearman correlation across pixels, with no p-value because of spatial autocorrelation.</li>
            <li><b>Robustness:</b> results are recomputed with the alternative rural ring and with Landsat 8 alone, because Landsat 9 doubles the scene count from 2022.</li>
            <li>Statistical significance doesn’t prove a cause. Many factors move together: construction, irrigation, harvest timing, aerosols and emissivity.</li>
          </ul>
        </S>

        <S title="Limitations">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>The emissivity used in Collection 2 surface temperature comes from ASTER GED (circa 2000–2008) adjusted with NDVI. It can bias absolute rooftop LST by a few kelvin. Urban-minus-rural differences are less affected.</li>
            <li>The TIRS thermal band is natively 100 m and resampled to 30 m, so fine detail is softer than the grid suggests.</li>
            <li>Each year has 2–7 usable scenes, so single-year maps are noisy. The 3-season periods are more robust.</li>
            <li>Neighbourhood circles are approximations around geocoded centroids, not administrative boundaries.</li>
            <li>The urban core uses one land-cover snapshot (2021). It doesn’t yet track expansion year by year.</li>
          </ul>
        </S>

        <S title="Extending to other cities">
          <p>
            The pipeline is driven by one configuration block per city: bounding box, Landsat path/row, centre, ring radii
            and neighbourhood list. Any city inside a single Landsat footprint can be processed the same way.
          </p>
        </S>

        <S title="Status and attribution">
          <p className="text-muted">
            An independent research prototype. Not affiliated with or endorsed by NASA, USGS or ESA. Landsat data courtesy of
            the U.S. Geological Survey. All data
            processing is deterministic and reproducible from the pipeline in the repository.
          </p>
        </S>
      </article>
    </div>
  );
}

function S({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[11px] uppercase tracking-[0.14em] text-accent">{title}</h2>
      {children}
    </section>
  );
}
