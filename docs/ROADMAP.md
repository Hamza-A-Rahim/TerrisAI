# Roadmap

## Done (v0.1)

- Reproducible pipeline: Landsat 8/9 C2 L2 → QA masking → per-scene anomaly → annual and period composites
- COG cubes for point queries; WebP overlays for display
- Map: LST, anomaly, NDVI, change layers; legend, opacity, before/after split, timeline animation,
  Landsat true-colour basemap per period, search, click inspection with 12-year history
- Analysis: city trend with sensitivity checks, scene-level rural-dependence diagnostic, NDVI trends,
  NDVI–LST scatter, distributions, neighbourhood tests, data-quality log
- Methodology and data-source docs

## Next

1. **Urban expansion mapping:** random-forest land-cover classifier on Landsat bands and indices,
   applied to every year. Labels sampled from WorldCover/Dynamic World; accuracy assessed on hand-labelled
   2015 and 2024 points with spatially blocked cross-validation and area-adjusted estimates.
2. **A reference that doesn’t depend on the crop calendar:** condition on rural NDVI, or use the urban core’s
   own spatial contrast (e.g. built-up vs green space within the city).
3. **Polygon drawing** with area statistics (server-side read of the COG window).
4. **Deployment:** upload the COGs and overlays to Cloudflare R2; point the app at `NEXT_PUBLIC_DATA_BASE_URL`;
   host on Vercel.
5. **Cross-checks:** MODIS MOD11A2/MYD11A2 day/night at 1 km; ECOSTRESS where available.
6. **More cities:** add a `CityConfig`; check that it fits in one WRS-2 footprint.
