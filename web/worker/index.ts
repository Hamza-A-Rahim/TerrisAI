// Cloudflare Worker: serves the static Next.js export (ASSETS), the
// pipeline's display files under /data/*, and point queries under /api/point.
//
// Everything ships as static assets (scripts/stage-data.mjs):
//   /data/<city>/manifest.json, summary.json, overlays/*.webp   public
//   /_points/<city>/index.json, <nnn>.bin                       private
// The .bin chunks hold one uncompressed fixed-size record per pixel, so a
// point query is a single small range read with almost no CPU (Workers Free
// can't afford to decompress GeoTIFF tiles per request).
import { parsePointParams, pointQuery, type PixelData } from "../src/lib/pointCore";
import type { Manifest } from "../src/lib/types";

interface Env {
  ASSETS: Fetcher;
}

interface PointIndex {
  width: number;
  height: number;
  cubes: string[];
  bands: number;
  recordBytes: number;
  perChunk: number;
}

async function readRecord(env: Env, base: string, idx: PointIndex, row: number, col: number): Promise<PixelData> {
  const p = row * idx.width + col;
  const chunk = Math.floor(p / idx.perChunk);
  const start = (p % idx.perChunk) * idx.recordBytes;
  const r = await env.ASSETS.fetch(`${base}/${String(chunk).padStart(3, "0")}.bin`, {
    headers: { range: `bytes=${start}-${start + idx.recordBytes - 1}` },
  });
  if (!r.ok) throw new Error(`chunk ${chunk}: HTTP ${r.status}`);
  let buf = await r.arrayBuffer();
  // Fall back to slicing if the range header was not honoured
  if (r.status !== 206) buf = buf.slice(start, start + idx.recordBytes);
  if (buf.byteLength !== idx.recordBytes) throw new Error(`short record (${buf.byteLength} B)`);
  const v = new DataView(buf);
  const at = (i: number) => v.getInt16(i * 2, true);
  const cubes = idx.cubes.map((_, c) => Array.from({ length: idx.bands }, (_, b) => at(c * idx.bands + b)));
  return { cubes, landcover: at(idx.cubes.length * idx.bands) };
}

/* -------------------------------- per-isolate caches (assets are immutable) */

const jsons = new Map<string, Promise<unknown>>();

function assetJson<T>(env: Env, url: string): Promise<T | null> {
  let v = jsons.get(url);
  if (!v) {
    v = env.ASSETS.fetch(url).then((r) => (r.ok ? r.json() : null));
    v.catch(() => jsons.delete(url));
    jsons.set(url, v);
  }
  return v as Promise<T | null>;
}

/* ------------------------------------------------------------------ handlers */

const json = (body: unknown, status = 200, cache = "no-store") =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache },
  });

async function handlePoint(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const p = parsePointParams(url);
  if (!p) return json({ error: "bad request" }, 400);
  const [m, idx] = await Promise.all([
    assetJson<Manifest>(env, `${url.origin}/data/${p.city}/manifest.json`),
    assetJson<PointIndex>(env, `${url.origin}/_points/${p.city}/index.json`),
  ]);
  if (!m || !idx) return json({ error: "city data not published" }, 404);
  const base = `${url.origin}/_points/${p.city}`;

  try {
    const r = await pointQuery(m, (row, col) => readRecord(env, base, idx, row, col), p.lon, p.lat);
    return json(r.body, r.status, r.status === 200 ? "public, max-age=3600" : "no-store");
  } catch (err) {
    console.error("point query failed", err);
    return json({ error: "data read failed" }, 500);
  }
}

async function handleData(req: Request, env: Env, path: string): Promise<Response> {
  // Only published display files
  if (!/^\/data\/[a-z-]+\/(manifest\.json|summary\.json|overlays\/[\w-]+\.webp)$/.test(path)) {
    return new Response("Not found", { status: 404 });
  }
  const r = await env.ASSETS.fetch(req);
  if (r.status !== 200 && r.status !== 304) return r;
  const res = new Response(r.body, r);
  res.headers.set(
    "cache-control",
    path.endsWith(".json") ? "public, no-cache" : "public, max-age=3600, stale-while-revalidate=86400",
  );
  return res;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    if (pathname === "/api/point") return handlePoint(req, env);
    if (pathname.startsWith("/data/")) return handleData(req, env, pathname);
    if (pathname.startsWith("/_points/")) return new Response("Not found", { status: 404 });
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
