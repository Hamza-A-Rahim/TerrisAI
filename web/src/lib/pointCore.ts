// Point query shared by the local dev route (reads files from disk) and the
// Cloudflare Worker (reads the same COGs from R2). Only the way a GeoTIFF is
// opened differs between the two.
import type { GeoTIFF } from "geotiff";
import type { Manifest, PointResult, PointValue } from "./types";

export const CUBES = ["lst", "anom", "ndvi", "unc", "count"] as const;
export type OpenTiff = (name: string) => Promise<GeoTIFF>;

const R = 6378137;
const toMerc = (lon: number, lat: number) => [
  (R * lon * Math.PI) / 180,
  R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
];
const toLonLat = (x: number, y: number) => [
  ((x / R) * 180) / Math.PI,
  ((2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180) / Math.PI,
];

export interface PointResponse {
  status: number;
  body: unknown;
}

export function parsePointParams(url: URL): { city: string; lon: number; lat: number } | null {
  const city = url.searchParams.get("city") ?? "lahore";
  const lon = Number(url.searchParams.get("lon"));
  const lat = Number(url.searchParams.get("lat"));
  if (!/^[a-z-]+$/.test(city) || !Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return { city, lon, lat };
}

export async function pointQuery(m: Manifest, open: OpenTiff, lon: number, lat: number): Promise<PointResponse> {
  const [a, , c, , e, f] = m.grid.transform; // affine: x = c + a*col, y = f + e*row
  const [x, y] = toMerc(lon, lat);
  const col = Math.floor((x - c) / a);
  const row = Math.floor((y - f) / e);
  if (col < 0 || row < 0 || col >= m.grid.width || row >= m.grid.height) {
    return { status: 422, body: { error: "outside study area" } };
  }

  const window = [col, row, col + 1, row + 1];
  const read = async (name: string) => {
    const img = await (await open(name)).getImage();
    return Array.from((await img.readRasters({ window, interleave: true })) as unknown as ArrayLike<number>);
  };

  const [cubeVals, lc] = await Promise.all([
    Promise.all(CUBES.map(read)),
    read("landcover")
      .then((v) => v[0])
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
  const body: PointResult = { lon, lat, pixel: { row, col, center }, values, landcover: lc };
  return { status: 200, body };
}
