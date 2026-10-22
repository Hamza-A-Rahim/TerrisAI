# Methodology

All parameters live in [`pipeline/uhi/config.py`](../pipeline/uhi/config.py).

## Question

How do urban expansion and vegetation change relate to land surface temperature (LST) across Lahore, 2014–2025?

## Measurement

- **LST** is the radiative skin temperature from Landsat TIRS band 10 (Collection 2 Level-2 ST_B10), observed at
  about 10:40 local time. It is **not air temperature**.
- **NDVI** = (NIR − Red)/(NIR + Red), from Collection 2 surface reflectance (bands 5 and 4) of the same scenes.
- **Uncertainty**: the per-pixel ST_QA band (K), carried through as the median across scenes.

## Study area and sampling

- Bounding box 73.95–74.75°E, 31.15–31.85°N. It lies entirely within WRS-2 path 149 / row 38 (verified against the
  catalogue), so all scenes share one orbit and overpass time.
- Season: **May 1 – June 30** (hot, pre-monsoon, mostly cloud-free). 54 candidate Landsat 8/9 scenes over 2014–2025,
  with scene cloud ≤ 60%.
- Grid: EPSG:3857 at 35 m (≈ 29.8 m on the ground), so overlays map exactly onto the web map. Thermal data is natively
  100 m, resampled by USGS to 30 m.

## Screening

1. QA_PIXEL bits 0–5 (fill, dilated cloud, cirrus, cloud, cloud shadow, snow) are masked.
2. A scene is accepted only if ≥ 60% of urban-core pixels and ≥ 50% of rural-reference pixels remain clear.
   Every decision is logged in `summary.json` and shown in the app’s data-quality table.

## Reference areas

- **Urban core**: ESA WorldCover 2021 built-up within 18 km of central Lahore.
- **Rural reference**: WorldCover cropland, ≥ 80% cropland in a 7 × 7 window, 25–40 km from the centre,
  ≥ 1 km from water, ≥ 2 km inside Pakistan.
- **Sensitivity ring**: the same rules at 20–30 km.

## Anomaly and composites

For each scene, anomaly = LST − median(LST over the rural reference, same scene). Same-day differencing removes
most weather and seasonal variation. Annual and 3-season period composites are per-pixel medians across accepted scenes.

## Statistics

| Output | Method |
|---|---|
| City heat island per year | median across scenes of (mean urban LST − median rural LST) |
| Trend | Theil–Sen slope (95% CI) + Mann–Kendall test (Kendall τ vs year); requires ≥ 6 years |
| Period change (2014–16 → 2023–25) | two-sided permutation test, 20,000 permutations, on scene-level values; bootstrap 95% CI |
| Neighbourhoods | same tests on 1 km circle means around Nominatim centroids |
| Vegetation vs LST | Pearson and Spearman r across pixels; no p-value (spatial autocorrelation) |
| Robustness | alternative rural ring; Landsat 8-only series |

## Key finding about the method itself

Scene-level urban-minus-rural values correlate negatively with the rural reference temperature
(r ≈ −0.52 across 44 scenes) and positively with rural NDVI (r ≈ +0.49).
When fields are green or wet, the city is several degrees warmer. When they are bare after the wheat harvest, the
daytime surface heat island disappears or reverses. This crop-calendar effect dominates year-to-year variability,
so the annual heat-island series has low power for detecting trends. The app shows this explicitly instead of
presenting a single headline trend.

## Limitations

- Collection 2 ST emissivity comes from ASTER GED (circa 2000–2008) adjusted with NDVI. Absolute rooftop LST may be
  biased by a few kelvin. Urban-minus-rural differences are less affected.
- Only 2–7 usable scenes per season.
- Landsat 9 doubles the scene count from 2022 (checked with the Landsat 8-only series).
- Land cover is a single 2021 snapshot. Year-by-year urban expansion is planned (see roadmap).
- Correlation and significance do not establish causation.
