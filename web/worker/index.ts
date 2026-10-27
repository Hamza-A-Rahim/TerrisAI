// Cloudflare Worker: serves the static Next.js export (ASSETS), the
// pipeline's display files under /data/*, and point queries under /api/point.
//
// Everything ships as static assets (scripts/stage-data.mjs):
//   /data/<city>/manifest.json, summary.json, overlays/*.webp   public
//   /_cubes/<city>/index.json, <cube>.<nnn>.bin                 private
// The Cloud-Optimized GeoTIFF cubes exceed the 25 MiB asset limit, so they
// are split into fixed-size chunks; the Worker reassembles byte ranges and
// never serves them to the public.
import { BaseClient, BaseResponse, fromCustomClient, type GeoTIFF } from "geotiff";
import { parsePointParams, pointQuery } from "../src/lib/pointCore";
import type { Manifest } from "../src/lib/types";

interface Env {
  ASSETS: Fetcher;
}

interface CubeIndex {
  chunkSize: number;
  sizes: Record<string, number>;
}

/* ----------------------------------------------- chunked assets for geotiff */

// geotiff's generated .d.ts mistypes these base classes (status: void,
// synchronous getData), so extend them at runtime with neutral types.
const ResponseBase = BaseResponse as unknown as new () => object;
const ClientBase = BaseClient as unknown as new (url: string) => object;

class RangeResponse extends ResponseBase {
  constructor(
    private readonly data: ArrayBuffer,
    private readonly start: number,
    private readonly total: number,
  ) {
    super();
  }
  get status() {
    return 206;
  }
  getHeader(name: string) {
    const n = name.toLowerCase();
    if (n === "content-range") return `bytes ${this.start}-${this.start + this.data.byteLength - 1}/${this.total}`;
    if (n === "content-type") return "image/tiff";
    return undefined;
  }
  async getData() {
    return this.data;
  }
}

/** Answers geotiff's single-range requests from the chunk files of one cube. */
class ChunkedClient extends ClientBase {
  constructor(
    private readonly env: Env,
    private readonly base: string, // e.g. https://host/_cubes/lahore/lst
    private readonly total: number,
    private readonly chunkSize: number,
  ) {
    super(base);
  }

  async request({ headers }: { headers?: HeadersInit } = {}) {
    const m = /bytes=(\d+)-(\d+)/.exec(new Headers(headers).get("range") ?? "");
    if (!m) throw new Error("only ranged reads are supported");
    const start = Number(m[1]);
    const end = Math.min(Number(m[2]), this.total - 1);
    const parts: Uint8Array[] = [];
    for (let c = Math.floor(start / this.chunkSize); c <= Math.floor(end / this.chunkSize); c++) {
      const s = Math.max(start, c * this.chunkSize) - c * this.chunkSize;
      const e = Math.min(end, (c + 1) * this.chunkSize - 1) - c * this.chunkSize;
      const r = await this.env.ASSETS.fetch(`${this.base}.${String(c).padStart(3, "0")}.bin`, {
        headers: { range: `bytes=${s}-${e}` },
      });
      if (!r.ok) throw new Error(`chunk ${c} of ${this.base}: HTTP ${r.status}`);
      const buf = await r.arrayBuffer();
      // Fall back to slicing if the range header was not honoured
      parts.push(new Uint8Array(r.status === 206 ? buf : buf.slice(s, e + 1)));
    }
    const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.byteLength;
    }
    return new RangeResponse(out.buffer, start, this.total);
  }
}

/* -------------------------------- per-isolate caches (assets are immutable) */

const tiffs = new Map<string, Promise<GeoTIFF>>();
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
    assetJson<CubeIndex>(env, `${url.origin}/_cubes/${p.city}/index.json`),
  ]);
  if (!m || !idx) return json({ error: "city data not published" }, 404);

  const open = (name: string) => {
    const key = `${p.city}/${name}`;
    let t = tiffs.get(key);
    if (!t) {
      const size = idx.sizes[name];
      if (size === undefined) return Promise.reject(new Error(`missing cube ${key}`));
      const client = new ChunkedClient(env, `${url.origin}/_cubes/${key}`, size, idx.chunkSize);
      t = fromCustomClient(client as unknown as BaseClient, { allowFullFile: false });
      t.catch(() => tiffs.delete(key));
      tiffs.set(key, t);
    }
    return t;
  };

  try {
    const r = await pointQuery(m, open, p.lon, p.lat);
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
    if (pathname.startsWith("/_cubes/")) return new Response("Not found", { status: 404 });
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
