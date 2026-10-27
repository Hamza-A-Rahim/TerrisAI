// Stage pipeline outputs into the static export for the Cloudflare Worker.
//
// `next build` already copies public/data (manifest, summary, overlays) into
// out/data. The analysis cubes in data/<city>/*.tif are larger than the
// 25 MiB static-asset limit, so they are split into fixed-size chunks under
// out/_cubes/<city>/ with an index.json the Worker uses to read byte ranges.
// The Worker never serves /_cubes/* to the public.
import { closeSync, mkdirSync, openSync, readdirSync, readSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CHUNK = 16 * 1024 * 1024;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = path.join(root, "data");
const outRoot = path.join(root, "out", "_cubes");

rmSync(outRoot, { recursive: true, force: true });
for (const city of readdirSync(dataRoot)) {
  const src = path.join(dataRoot, city);
  if (!statSync(src).isDirectory()) continue;
  const dst = path.join(outRoot, city);
  mkdirSync(dst, { recursive: true });
  const sizes = {};
  const buf = Buffer.alloc(CHUNK);
  for (const f of readdirSync(src).filter((f) => f.endsWith(".tif"))) {
    const name = f.slice(0, -4);
    const fd = openSync(path.join(src, f), "r");
    let c = 0;
    let n;
    while ((n = readSync(fd, buf, 0, CHUNK, null)) > 0) {
      writeFileSync(path.join(dst, `${name}.${String(c++).padStart(3, "0")}.bin`), buf.subarray(0, n));
    }
    closeSync(fd);
    sizes[name] = statSync(path.join(src, f)).size;
    console.log(`${city}/${name}: ${c} chunk(s)`);
  }
  writeFileSync(path.join(dst, "index.json"), JSON.stringify({ chunkSize: CHUNK, sizes }));
}
