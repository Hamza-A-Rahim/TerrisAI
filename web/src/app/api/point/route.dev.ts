// Local development only (picked up via pageExtensions in next.config.ts).
// In production the Cloudflare Worker (worker/index.ts) serves /api/point from R2.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fromFile, type GeoTIFF } from "geotiff";
import { NextResponse } from "next/server";
import { parsePointParams, pointQuery } from "@/lib/pointCore";
import type { Manifest } from "@/lib/types";

export const runtime = "nodejs";

const DATA_DIR = path.join(process.cwd(), "data");
const PUBLIC_DIR = path.join(process.cwd(), "public", "data");

const tiffs = new Map<string, Promise<GeoTIFF>>();
const manifests = new Map<string, Promise<Manifest>>();

export async function GET(req: Request) {
  const p = parsePointParams(new URL(req.url));
  if (!p) return NextResponse.json({ error: "bad request" }, { status: 400 });

  if (!manifests.has(p.city)) {
    manifests.set(
      p.city,
      readFile(path.join(PUBLIC_DIR, p.city, "manifest.json"), "utf-8").then((s) => JSON.parse(s) as Manifest),
    );
  }
  let m: Manifest;
  try {
    m = await manifests.get(p.city)!;
  } catch {
    manifests.delete(p.city);
    return NextResponse.json({ error: "city data not built" }, { status: 404 });
  }

  const open = (name: string) => {
    const key = `${p.city}/${name}`;
    if (!tiffs.has(key)) tiffs.set(key, fromFile(path.join(DATA_DIR, p.city, `${name}.tif`)));
    return tiffs.get(key)!;
  };

  try {
    const r = await pointQuery(m, open, p.lon, p.lat);
    return NextResponse.json(r.body, { status: r.status, headers: { "Cache-Control": "public, max-age=3600" } });
  } catch (err) {
    console.error("point query failed", err);
    return NextResponse.json({ error: "data read failed" }, { status: 500 });
  }
}
