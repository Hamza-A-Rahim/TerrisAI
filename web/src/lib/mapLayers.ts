import maplibregl, { type ImageSource, type Map as MLMap } from "maplibre-gl";
import { LABEL_ANCHOR, STREET_LAYERS } from "./mapStyle";
import type { Basemap, Manifest } from "./types";

const FADE_MS = 450;
const BLANK =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==";

const preloaded = new Map<string, Promise<void>>();

/** Maps whose style has loaded and whose data layers are installed */
const installed = new WeakSet<MLMap>();
export const isReady = (map: MLMap | null): map is MLMap =>
  !!map && installed.has(map) && (map as unknown as { style?: { _loaded?: boolean } }).style?._loaded === true;

/** Fetch and decode an image once so swapping it in is instant. */
export function preload(url: string): Promise<void> {
  if (!preloaded.has(url)) {
    const img = new Image();
    img.src = url;
    preloaded.set(
      url,
      img.decode().catch(() => {
        preloaded.delete(url);
        throw new Error(`overlay failed to load: ${url}`);
      }),
    );
  }
  return preloaded.get(url)!;
}

export function installDataLayers(map: MLMap, m: Manifest) {
  const coordinates = m.corners;
  for (const id of ["tc", "ov-a", "ov-b", "zones"]) {
    map.addSource(id, { type: "image", url: BLANK, coordinates });
  }
  // Landsat true colour sits just above the satellite basemap
  map.addLayer({ id: "tc", type: "raster", source: "tc", layout: { visibility: "none" },
    paint: { "raster-fade-duration": 0 } }, "st-landuse");
  for (const id of ["ov-a", "ov-b"]) {
    map.addLayer(
      { id, type: "raster", source: id,
        paint: { "raster-opacity": 0, "raster-opacity-transition": { duration: FADE_MS, delay: 0 },
          "raster-fade-duration": 0, "raster-resampling": "linear" } },
      LABEL_ANCHOR,
    );
  }
  map.addLayer({ id: "zones", type: "raster", source: "zones", layout: { visibility: "none" },
    paint: { "raster-opacity": 0.55 } }, LABEL_ANCHOR);

  map.addSource("hoods", { type: "geojson", data: hoodsGeoJSON(m) });
  map.addLayer({ id: "hoods-fill", type: "fill", source: "hoods",
    paint: { "fill-color": "#ffffff", "fill-opacity": 0.03 } }, LABEL_ANCHOR);
  map.addLayer({ id: "hoods-line", type: "line", source: "hoods",
    paint: { "line-color": "#ffffff", "line-opacity": 0.75, "line-width": 1, "line-dasharray": [2, 2] } });
  map.addLayer({ id: "hoods-label", type: "symbol", source: "hoods",
    layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": 11,
      "text-offset": [0, 0], "text-letter-spacing": 0.04, "symbol-placement": "point" },
    paint: { "text-color": "#ffffff", "text-halo-color": "rgba(0,0,0,0.75)", "text-halo-width": 1.4 } });

  installed.add(map);
  map.once("remove", () => installed.delete(map));
  map.on("zoom", () => {
    const mode = map.getZoom() >= 13 ? "nearest" : "linear";
    for (const id of ["ov-a", "ov-b"]) {
      if (map.getPaintProperty(id, "raster-resampling") !== mode) map.setPaintProperty(id, "raster-resampling", mode);
    }
  });
}

function hoodsGeoJSON(m: Manifest): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: m.neighbourhoods.map((h) => {
      const ring: [number, number][] = [];
      const k = Math.cos((h.lat * Math.PI) / 180);
      for (let i = 0; i <= 64; i++) {
        const t = (i / 64) * 2 * Math.PI;
        ring.push([h.lon + (h.radius_m / (111320 * k)) * Math.cos(t), h.lat + (h.radius_m / 110570) * Math.sin(t)]);
      }
      return { type: "Feature", properties: { id: h.id, name: h.name },
        geometry: { type: "Polygon", coordinates: [ring] } };
    }),
  };
}

/** Per-map state for the A/B crossfade */
const front = new WeakMap<MLMap, { id: "ov-a" | "ov-b"; url: string | null; seq: number }>();

export async function showOverlay(map: MLMap, url: string | null, opacity: number) {
  if (!isReady(map)) return;
  const st = front.get(map) ?? { id: "ov-a" as const, url: null, seq: 0 };
  front.set(map, st);
  const seq = ++st.seq;
  if (url === null) {
    map.setPaintProperty(st.id, "raster-opacity", 0);
    st.url = null;
    return;
  }
  if (url === st.url) {
    map.setPaintProperty(st.id, "raster-opacity", opacity);
    return;
  }
  await preload(url);
  if (seq !== st.seq || !isReady(map) || !map.getSource("ov-a")) return; // superseded or map gone
  const back = st.id === "ov-a" ? "ov-b" : "ov-a";
  // Swap as soon as the new image source has loaded (or after a short
  // fallback), so the old frame stays up instead of flashing blank.
  let done = false;
  const swap = () => {
    if (done) return;
    done = true;
    map.off("sourcedata", onData);
    if (seq !== st.seq || !isReady(map)) return;
    map.setPaintProperty(back, "raster-opacity", opacity);
    map.setPaintProperty(st.id, "raster-opacity", 0);
    st.id = back;
    st.url = url;
  };
  const onData = (e: maplibregl.MapSourceDataEvent) => {
    if (e.sourceId === back && map.isSourceLoaded(back)) swap();
  };
  map.on("sourcedata", onData);
  (map.getSource(back) as ImageSource).updateImage({ url });
  setTimeout(swap, 400);
}

export function setBasemap(map: MLMap, basemap: Basemap, tcUrl: string | null) {
  if (!isReady(map)) return;
  const vis = (id: string, on: boolean) => map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  vis("sat", basemap === "satellite");
  for (const id of STREET_LAYERS) vis(id, basemap === "streets");
  vis("tc", basemap === "landsat");
  if (basemap === "landsat" && tcUrl) (map.getSource("tc") as ImageSource).updateImage({ url: tcUrl });
  map.setPaintProperty("bg", "background-color", basemap === "streets" ? "#0d1014" : "#06080a");
}

export function setAux(map: MLMap, showZones: boolean, zonesUrl: string, showHoods: boolean) {
  if (!isReady(map)) return;
  const src = map.getSource("zones") as ImageSource | undefined;
  if (showZones && src) src.updateImage({ url: zonesUrl });
  map.setLayoutProperty("zones", "visibility", showZones ? "visible" : "none");
  for (const id of ["hoods-fill", "hoods-line", "hoods-label"]) {
    map.setLayoutProperty(id, "visibility", showHoods ? "visible" : "none");
  }
}

export function pulseMarker(): HTMLElement {
  const el = document.createElement("div");
  el.className = "relative w-3 h-3";
  el.innerHTML =
    '<span class="absolute inset-0 rounded-full border-2 border-white marker-ring"></span>' +
    '<span class="absolute inset-[3px] rounded-full bg-white shadow"></span>';
  return el;
}

export { maplibregl };
