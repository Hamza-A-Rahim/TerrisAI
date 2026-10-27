import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

// Production is a static export served by a Cloudflare Worker (see
// wrangler.jsonc): the Worker answers /api/point and /data/* from R2.
// Local `next dev` serves both from disk instead, via the dev-only
// route.dev.ts and public/data.
export default function config(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    return {
      pageExtensions: ["tsx", "ts", "dev.ts"],
      async headers() {
        return [
          // Statistics change whenever the pipeline re-runs: always revalidate
          { source: "/data/:city/:file.json", headers: [{ key: "Cache-Control", value: "public, no-cache" }] },
        ];
      },
    };
  }
  return {
    output: "export",
    pageExtensions: ["tsx", "ts"],
    images: { unoptimized: true },
  };
}
