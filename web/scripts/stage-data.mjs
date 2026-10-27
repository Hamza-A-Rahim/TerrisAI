// Stage pipeline outputs into the static export for the Cloudflare Worker.
//
// `next build` already copies public/data (manifest, summary, overlays) into
// out/data. For /api/point the Worker can't afford to decompress GeoTIFF tiles
// (Workers Free allows ~10 ms of CPU per request), so the cubes are rewritten
// as uncompressed fixed-size pixel records: one int16 per cube band, then the
// land-cover class, little-endian, in row-major order. A lookup is then a
// single small byte-range read. Records are split across chunk files below
// the 25 MiB static-asset limit, under out/_points/<city>/, with an index.json.
// The Worker never serves /_points/* to the public.
import { closeSync, mkdirSync, openSync, readdirSync, rmSync, statSync, writeFileSync, writeSync } from "node:fs";
import { endianness } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fromFile } from "geotiff";

const CUBES = ["lst", "anom", "ndvi", "unc", "count"]; // keep in step with src/lib/pointCore.ts
const CHUNK_BYTES = 16 * 1024 * 1024;
const STRIP_ROWS = 64;

if (endianness() !== "LE") throw new Error("pixel records are written little-endian");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = path.join(root, "data");
const outRoot = path.join(root, "out", "_points");

rmSync(outRoot, { recursive: true, force: true });
for (const city of readdirSync(dataRoot)) {
  const src = path.join(dataRoot, city);
  if (!statSync(src).isDirectory()) continue;
  const dst = path.join(outRoot, city);
  mkdirSync(dst, { recursive: true });

  const images = await Promise.all(
    [...CUBES, "landcover"].map(async (n) => (await fromFile(path.join(src, `${n}.tif`))).getImage()),
  );
  const width = images[0].getWidth();
  const height = images[0].getHeight();
  const bands = images[0].getSamplesPerPixel();
  for (const img of images.slice(0, CUBES.length)) {
    if (img.getWidth() !== width || img.getHeight() !== height || img.getSamplesPerPixel() !== bands) {
      throw new Error(`${city}: cubes differ in shape`);
    }
  }
  const recordValues = CUBES.length * bands + 1;
  const recordBytes = recordValues * 2;
  const perChunk = Math.floor(CHUNK_BYTES / recordBytes);

  let chunk = -1;
  let fd = -1;
  let inChunk = perChunk;
  const write = (rec, count) => {
    // rec: Int16Array of `count` records; split across chunk boundaries
    let done = 0;
    while (done < count) {
      if (inChunk === perChunk) {
        if (fd >= 0) closeSync(fd);
        fd = openSync(path.join(dst, `${String(++chunk).padStart(3, "0")}.bin`), "w");
        inChunk = 0;
      }
      const n = Math.min(count - done, perChunk - inChunk);
      writeSync(fd, new Uint8Array(rec.buffer, done * recordBytes, n * recordBytes));
      done += n;
      inChunk += n;
    }
  };

  for (let y = 0; y < height; y += STRIP_ROWS) {
    const rows = Math.min(STRIP_ROWS, height - y);
    const window = [0, y, width, y + rows];
    const strips = await Promise.all(images.map((img) => img.readRasters({ window, interleave: true })));
    const px = rows * width;
    const rec = new Int16Array(px * recordValues);
    for (let p = 0; p < px; p++) {
      const o = p * recordValues;
      for (let c = 0; c < CUBES.length; c++) {
        const s = strips[c];
        for (let b = 0; b < bands; b++) rec[o + c * bands + b] = s[p * bands + b];
      }
      rec[o + recordValues - 1] = strips[CUBES.length][p];
    }
    write(rec, px);
  }
  if (fd >= 0) closeSync(fd);

  writeFileSync(
    path.join(dst, "index.json"),
    JSON.stringify({ width, height, cubes: CUBES, bands, recordBytes, perChunk, chunks: chunk + 1 }),
  );
  console.log(`${city}: ${width}x${height} px, ${recordBytes} B/px, ${chunk + 1} chunk(s)`);
}
