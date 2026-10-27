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
  src/lib/pointCore  point query against the COG cubes (shared by dev route and Worker)
  worker/            Cloudflare Worker for production hosting
docs/                methodology, data sources, roadmap
```

## Setup

Requirements: Node 20+. Python 3.11+ only if you rebuild the data.

### Option A: download the pre-built data (fastest)

The generated outputs (~660 MB) are published as a GitHub Release instead of being committed, because the data
cubes exceed GitHub’s 100 MB file limit and every rebuild would bloat the history.

```bash
# from the repository root
gh release download data-v1 --repo Hamza-A-Rahim/TerrisAI
sha256sum -c lahore-data-v1.zip.sha256
unzip lahore-data-v1.zip        # restores web/data/lahore and web/public/data/lahore
rm lahore-data-v1.zip*

cd web && npm install && npm run dev   # http://localhost:3000
```

### Option B: rebuild the data from Landsat

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
(overlays, `manifest.json`, `summary.json`). Generated data isn’t committed: download it (Option A) or rebuild it (Option B).
After a rebuild that changes results, publish a new release (`data-v2`, …) so the download stays in step with the code.

No API keys are needed.

## Hosting (Cloudflare Workers)

Production is a single Cloudflare Worker with static assets, which fits the Workers free plan:

- `npm run build` runs `next build` (static export to `web/out`), then `scripts/stage-data.mjs`.
  - That script rewrites the data cubes as uncompressed 142-byte pixel records (every cube band plus land cover).
  - The records are split into 57 chunks of 16 MiB under `out/_points/`, since static assets are limited to 25 MiB each.
- The Worker ([web/worker/index.ts](web/worker/index.ts)) serves:
  - the pages;
  - `/data/<city>/` display files (overlays, manifest, summary) with cache headers;
  - `/api/point`, which reads one pixel as a single range request, with no decompression.
- Avoiding decompression keeps each request within the free plan's 10 ms CPU limit; decoding GeoTIFF tiles exceeded it.
- `/_points/*` is never served publicly.
- Live: https://terris.terris-web.workers.dev

```bash
cd web
npx wrangler login     # once
npm run preview        # build + local Worker at http://localhost:8787
npm run deploy         # build + deploy to <name>.<subdomain>.workers.dev
```

The data must be present locally (Option A or B) before building. Assets are content-hashed, so redeploys upload
only changed files.

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

The deployed point API was checked against `rasterio` reads of the source cubes:
- 60 random locations, 4,200 values, all equal;
- the pixels on both sides of five chunk boundaries, with land cover, all equal.

## Docs

- [Methodology](docs/METHODOLOGY.md)
- [Data sources and licences](docs/DATA_SOURCES.md)
- [Roadmap](docs/ROADMAP.md)

## Licence

Code: MIT (see `LICENSE`). Data products derived from Landsat are public domain. See
`docs/DATA_SOURCES.md` for third-party licences and required attributions.
