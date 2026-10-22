# Terris: Lahore urban heat

An interactive map for investigating how land surface temperature and vegetation have changed across
Lahore, Pakistan, from 2014 to 2025, using Landsat 8/9 Collection 2 Level-2 observations.

> Independent research prototype. Not affiliated with or endorsed by NASA, USGS or ESA.

## What it does

- **Map:** full-screen MapLibre map with real Landsat-derived layers: surface temperature (°C), temperature
  anomaly relative to rural cropland, NDVI, and 2014–16 → 2023–25 change.
- **Before/after split:** drag a divider to compare any two years or 3-season periods side by side, with
  Landsat true-colour basemaps from the same scenes.
- **Timeline:** step through or animate the yearly May–June composites.
- **Location inspection:** click any 30 m pixel to read its values, uncertainty, observation count,
  land cover and 12-year history (read directly from Cloud-Optimized GeoTIFFs).
- **Analysis:** city heat-island trend (Theil–Sen + Mann–Kendall) with sensitivity checks,
  scene-level diagnostics, vegetation–temperature relationship, neighbourhood comparison with
  permutation tests, and a per-scene data-quality log.

## Repository layout

```
pipeline/            Python data pipeline (Landsat → composites → COGs, overlays, statistics)
  uhi/config.py      every scientific parameter, one block per city
  build.py           entry point
web/                 Next.js app (TypeScript, Tailwind, MapLibre, ECharts)
  src/app/api/point  point query against the COG cubes
docs/                methodology, data sources, roadmap
```

## Setup

Requirements: Python 3.11+, Node 20+.

```bash
# 1. Data pipeline (~15 min on first run; downloads are cached in data/cache)
cd pipeline
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # Windows
# .venv/bin/python -m pip install -r requirements.txt     # macOS/Linux
.venv/Scripts/python build.py --city lahore

# 2. Web app
cd ../web
npm install
npm run dev        # http://localhost:3000
```

The pipeline writes `web/data/lahore/*.tif` (point-query cubes) and `web/public/data/lahore/`
(overlays, `manifest.json`, `summary.json`). Generated data isn’t committed. Rebuild it with the commands above.

No API keys are needed. See `.env.example` for the planned production storage settings.

## Testing

```bash
# statistics unit tests
cd pipeline && .venv/Scripts/python -m unittest discover -s tests

# types + production build
cd web && npm run typecheck && npm run build
```

Data checks: the Analysis → *Data quality* table lists every candidate scene, why it was accepted or rejected,
and its uncertainty. To spot-check the point API against the source rasters:

```bash
curl "http://localhost:3000/api/point?lon=74.3436&lat=31.5204"
```

## Docs

- [Methodology](docs/METHODOLOGY.md)
- [Data sources and licences](docs/DATA_SOURCES.md)
- [Roadmap](docs/ROADMAP.md)

## Licence

Code: MIT (see `LICENSE`). Data products derived from Landsat are public domain. See
`docs/DATA_SOURCES.md` for third-party licences and required attributions.
