import { readFile } from "node:fs/promises";
import path from "node:path";
import { fromFile, type GeoTIFF } from "geotiff";
import { NextResponse } from "next/server";
import type { Manifest, PointResult, PointValue } from "@/lib/types";

export const runtime = "nodejs";

const DATA_DIR = path.join(process.cwd(), "data");
const PUBLIC_DIR = path.join(process.cwd(), "public", "data");
const CUBES = ["lst", "anom", "ndvi", "unc", "count"] as const;

const tiffs = new Map<string, Promise<GeoTIFF>>();
const manifests = new Map<string, Promise<Manifest>>();

function tiff(city: string, name: string) {
  const key = `${city}/${name}`;
  if (!tiffs.has(key)) tiffs.set(key, fromFile(path.join(DATA_DIR, city, `${name}.tif`)));
  return tiffs.get(key)!;
}

function manifest(city: string) {
  if (!manifests.has(city)) {
    manifests.set(
      city,
      readFile(path.join(PUBLIC_DIR, city, "manifest.json"), "utf-8").then((s) => JSON.parse(s) as Manifest),
    );
  }
  return manifests.get(city)!;
}

const R = 6378137;
const toMerc = (lon: number, lat: number) => [
  (R * lon * Math.PI) / 180,
  R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
];
const toLonLat = (x: number, y: number) => [
  ((x / R) * 180) / Math.PI,
  ((2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180) / Math.PI,
];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const city = url.searchParams.get("city") ?? "lahore";
  const lon = Number(url.searchParams.get("lon"));
  const lat = Number(url.searchParams.get("lat"));
  if (!/^[a-z-]+$/.test(city) || !Number.isFinite(lon) || !Number.isFinite(lat)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  let m: Manifest;
  try {
    m = await manifest(city);
  } catch {
    return NextResponse.json({ error: "city data not built" }, { status: 404 });
  }

  const [a, , c, , e, f] = m.grid.transform; // affine: x = c + a*col, y = f + e*row
  const [x, y] = toMerc(lon, lat);
  const col = Math.floor((x - c) / a);
  const row = Math.floor((y - f) / e);
  if (col < 0 || row < 0 || col >= m.grid.width || row >= m.grid.height) {
    return NextResponse.json({ error: "outside study area" }, { status: 422 });
  }

  const window = [col, row, col + 1, row + 1];
  try {
    const [cubeVals, lc] = await Promise.all([
      Promise.all(
        CUBES.map(async (name) => {
          const img = await (await tiff(city, name)).getImage();
          const ras = (await img.readRasters({ window, interleave: true })) as unknown as ArrayLike<number>;
          return Array.from(ras);
        }),
      ),
      tiff(city, "landcover")
        .then((t) => t.getImage())
        .then((img) => img.readRasters({ window, interleave: true }) as unknown as Promise<ArrayLike<number>>)
        .then((r) => r[0])
        .catch(() => null),
    ]);

    const values: Record<string, PointValue> = {};
    for (const [key, band] of Object.entries(m.bands)) {
      const i = band - 1;
      const get = (ci: number, name: string) => {
        const raw = cubeVals[ci][i];
        return raw === m.nodata ? null : raw / m.cube_scales[name];
      };
      values[key] = {
        lst: get(0, "lst"),
        anom: get(1, "anom"),
        ndvi: get(2, "ndvi"),
        unc: get(3, "unc"),
        count: cubeVals[4][i] === m.nodata ? 0 : cubeVals[4][i],
      };
    }

    const center = toLonLat(c + (col + 0.5) * a, f + (row + 0.5) * e) as [number, number];
    const body: PointResult & { landcover: number | null } = {
      lon,
      lat,
      pixel: { row, col, center },
      values,
      landcover: lc,
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch (err) {
    console.error("point query failed", err);
    return NextResponse.json({ error: "data read failed" }, { status: 500 });
  }
}
