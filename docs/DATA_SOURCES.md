# Data sources and licences

| Dataset | Used for | Access | Licence / terms | Attribution |
|---|---|---|---|---|
| Landsat 8 & 9 Collection 2 Level-2 (ST_B10, ST_QA, SR_B2–B5, QA_PIXEL), WRS-2 149/038 | Surface temperature, uncertainty, NDVI, cloud masks, true colour | Microsoft Planetary Computer STAC `landsat-c2-l2` (mirror of the USGS archive) | Public domain (USGS) | “Landsat data courtesy of the U.S. Geological Survey” |
| ESA WorldCover 2021 v200 (10 m) | Urban-core and rural-reference masks, land-cover label at inspected points | Planetary Computer `esa-worldcover` | CC BY 4.0 | © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium |
| Natural Earth 1:10m admin-0 countries | Keeps the rural reference inside Pakistan | github.com/nvkelso/natural-earth-vector | Public domain | Natural Earth |
| OpenStreetMap via Nominatim | Neighbourhood centroids (geocoded once, cached) | nominatim.openstreetmap.org (≤ 1 req/s) | ODbL | © OpenStreetMap contributors |
| OpenStreetMap via Photon | Place search and reverse geocoding in the app | photon.komoot.io | ODbL | © OpenStreetMap contributors |
| OpenFreeMap vector tiles | Streets basemap and labels | tiles.openfreemap.org | OSM data ODbL; OpenMapTiles schema | OpenFreeMap © OpenMapTiles © OpenStreetMap contributors |
| Sentinel-2 cloudless 2024 (EOX) | Satellite basemap | tiles.maps.eox.at | CC BY-NC-SA 4.0 (non-commercial) | Sentinel-2 cloudless – https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024) |

## Notes

- **Licence caveat:** EOX Sentinel-2 cloudless 2024 is licensed for non-commercial use only. For commercial use,
  replace the satellite basemap with the project’s own Landsat true-colour composites (public domain) or a
  self-built Sentinel-2 mosaic (Copernicus open licence).
- **Scale factors** (USGS Landsat C2 L2 Science Product Guide): ST = DN × 0.00341802 + 149.0 (K);
  ST_QA = DN × 0.01 (K); SR = DN × 2.75e-5 − 0.2.
- **Not used yet:** MODIS MOD11A2/MYD11A2 (for a nighttime and 1 km cross-check), Harmonized Landsat Sentinel-2,
  and the ECOSTRESS LST products.
