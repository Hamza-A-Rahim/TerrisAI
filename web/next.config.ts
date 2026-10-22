import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The point-query route reads the GeoTIFF cubes from web/data at runtime
  outputFileTracingIncludes: { "/api/point": ["./data/**/*.tif"] },
  async headers() {
    return [
      // Statistics change whenever the pipeline re-runs: always revalidate
      {
        source: "/data/:city/:file.json",
        headers: [{ key: "Cache-Control", value: "public, no-cache" }],
      },
      {
        source: "/data/:city/overlays/:file",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }],
      },
    ];
  },
};

export default nextConfig;
