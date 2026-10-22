"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MLMap, Marker } from "maplibre-gl";
import { dataUrl, overlayUrl } from "@/lib/data";
import { isChangeLayer, keyLabel } from "@/lib/format";
import { buildStyle } from "@/lib/mapStyle";
import { installDataLayers, maplibregl, preload, pulseMarker, setAux, setBasemap, showOverlay } from "@/lib/mapLayers";
import { useApp } from "@/lib/store";
import type { Manifest } from "@/lib/types";

/** Landsat true-colour is only built for the two periods; pick the nearest. */
function tcKeyFor(key: string): string {
  if (key.startsWith("p")) return key;
  return Number(key) <= 2019 ? "p2014_2016" : "p2023_2025";
}

/** Superseded image loads are cancelled on purpose; don't report those. */
function onMapError(e: { error?: Error }) {
  const msg = String(e.error?.message ?? e.error ?? "");
  if (e.error?.name === "AbortError" || /could not be decoded|aborted/i.test(msg)) return;
  console.warn("map:", msg);
}

function createMap(el: HTMLElement, m: Manifest, interactive = true): MLMap {
  const map = new maplibregl.Map({
    container: el,
    style: buildStyle(),
    center: m.center,
    zoom: 10.6,
    minZoom: 8.5,
    maxZoom: 17,
    maxBounds: [
      [m.bbox[0] - 0.6, m.bbox[1] - 0.5],
      [m.bbox[2] + 0.6, m.bbox[3] + 0.5],
    ],
    attributionControl: false,
    interactive,
    fadeDuration: 150,
  });
  map.on("error", onMapError);
  return map;
}

export default function MapView({ manifest }: { manifest: Manifest }) {
  const s = useApp();
  const set = useApp((x) => x.set);
  const wrap = useRef<HTMLDivElement>(null);
  const elA = useRef<HTMLDivElement>(null);
  const elB = useRef<HTMLDivElement>(null);
  const mapA = useRef<MLMap | null>(null);
  const mapB = useRef<MLMap | null>(null);
  const marker = useRef<Marker[]>([]);
  const [readyA, setReadyA] = useState(false);
  const [readyB, setReadyB] = useState(false);
  const [split, setSplit] = useState(0.5);
  const [overlayError, setOverlayError] = useState<string | null>(null);

  const comparing = s.compare && !isChangeLayer(s.layer);
  const keyA = isChangeLayer(s.layer) ? "change" : comparing ? s.keyA : s.timeKey;
  const keyB = s.keyB;

  const onClick = useCallback(
    (e: maplibregl.MapMouseEvent) => {
      set({ selected: { lon: e.lngLat.lng, lat: e.lngLat.lat }, rightOpen: true });
    },
    [set],
  );

  // ---- map A (always present)
  useEffect(() => {
    if (!elA.current) return;
    const map = createMap(elA.current, manifest);
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.FullscreenControl({ container: wrap.current! }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 90 }), "bottom-left");
    map.on("load", () => {
      installDataLayers(map, manifest);
      setReadyA(true);
    });
    map.on("click", onClick);
    map.getCanvas().style.cursor = "crosshair";
    mapA.current = map;
    return () => {
      map.remove();
      mapA.current = null;
      setReadyA(false);
    };
  }, [manifest, onClick]);

  // ---- map B (compare only)
  useEffect(() => {
    if (!comparing || !readyA || !elB.current) return;
    const a = mapA.current!;
    const map = createMap(elB.current, manifest);
    map.jumpTo({ center: a.getCenter(), zoom: a.getZoom(), bearing: a.getBearing(), pitch: a.getPitch() });
    map.on("load", () => {
      installDataLayers(map, manifest);
      setReadyB(true);
    });
    map.on("click", onClick);
    map.getCanvas().style.cursor = "crosshair";
    mapB.current = map;

    let syncing = false;
    const sync = (from: MLMap, to: MLMap) => () => {
      if (syncing) return;
      syncing = true;
      to.jumpTo({ center: from.getCenter(), zoom: from.getZoom(), bearing: from.getBearing(), pitch: from.getPitch() });
      syncing = false;
    };
    const ab = sync(a, map);
    const ba = sync(map, a);
    a.on("move", ab);
    map.on("move", ba);
    return () => {
      a.off("move", ab);
      map.remove();
      mapB.current = null;
      setReadyB(false);
    };
  }, [comparing, readyA, manifest, onClick]);

  // ---- overlays
  useEffect(() => {
    if (!readyA) return;
    setOverlayError(null);
    showOverlay(mapA.current!, overlayUrl(s.layer, keyA), s.opacity).catch((e) => setOverlayError(String(e.message)));
  }, [readyA, s.layer, keyA, s.opacity]);

  useEffect(() => {
    if (!readyB || !comparing) return;
    showOverlay(mapB.current!, overlayUrl(s.layer, keyB), s.opacity).catch((e) => setOverlayError(String(e.message)));
  }, [readyB, comparing, s.layer, keyB, s.opacity]);

  // Preload neighbouring years so the timeline animates smoothly
  useEffect(() => {
    if (isChangeLayer(s.layer)) return;
    const keys = manifest.layers[s.layer].keys;
    const i = keys.indexOf(s.timeKey);
    for (const k of [keys[i + 1], keys[i + 2], keys[i - 1]]) if (k) preload(overlayUrl(s.layer, k)).catch(() => {});
  }, [s.layer, s.timeKey, manifest]);

  // ---- basemap and auxiliary layers
  useEffect(() => {
    const apply = (map: MLMap | null, key: string) => {
      if (!map) return;
      setBasemap(map, s.basemap, dataUrl(`overlays/${manifest.truecolour[tcKeyFor(key)]}`));
      setAux(map, s.showZones, dataUrl("overlays/zones.webp"), s.showHoods);
    };
    if (readyA) apply(mapA.current, keyA === "change" ? "p2023_2025" : keyA);
    if (readyB) apply(mapB.current, keyB);
  }, [readyA, readyB, s.basemap, s.showZones, s.showHoods, keyA, keyB, manifest]);

  // ---- selection marker
  useEffect(() => {
    marker.current.forEach((mk) => mk.remove());
    marker.current = [];
    if (!s.selected) return;
    for (const map of [mapA.current, readyB ? mapB.current : null]) {
      if (map) marker.current.push(new maplibregl.Marker({ element: pulseMarker() }).setLngLat([s.selected.lon, s.selected.lat]).addTo(map));
    }
  }, [s.selected, readyA, readyB]);

  // ---- fly-to requests (search, neighbourhood list)
  useEffect(() => {
    if (!s.flyTo || !mapA.current) return;
    mapA.current.flyTo({ center: [s.flyTo.lon, s.flyTo.lat], zoom: s.flyTo.zoom, speed: 1.2, curve: 1.4, essential: true });
  }, [s.flyTo]);

  // Resize when side panels animate open/closed
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      mapA.current?.resize();
      mapB.current?.resize();
    });
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  // ---- split handle
  const dragging = useRef(false);
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !wrap.current) return;
    const r = wrap.current.getBoundingClientRect();
    setSplit(Math.min(0.97, Math.max(0.03, (e.clientX - r.left) / r.width)));
  };

  return (
    <div
      ref={wrap}
      className="absolute inset-0 bg-ink"
      onPointerMove={onPointerMove}
      onPointerUp={() => (dragging.current = false)}
      onPointerLeave={() => (dragging.current = false)}
    >
      {/* inline position: maplibre-gl.css forces .maplibregl-map to position:relative */}
      <div ref={elA} style={{ position: "absolute", inset: 0 }} />
      {comparing && (
        <>
          <div
            ref={elB}
            style={{ position: "absolute", inset: 0, clipPath: `inset(0 0 0 ${split * 100}%)` }}
          />
          <div
            className="absolute top-0 bottom-0 z-10 w-8 -ml-4 cursor-ew-resize flex items-center justify-center group touch-none"
            style={{ left: `${split * 100}%` }}
            onPointerDown={(e) => {
              dragging.current = true;
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            }}
            role="slider"
            aria-label="Comparison divider"
            aria-valuenow={Math.round(split * 100)}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setSplit((v) => Math.max(0.03, v - 0.03));
              if (e.key === "ArrowRight") setSplit((v) => Math.min(0.97, v + 0.03));
            }}
          >
            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/80 shadow-[0_0_8px_rgba(0,0,0,0.6)]" />
            <div className="relative h-9 w-5 rounded-full bg-white text-ink flex items-center justify-center shadow-lg text-[10px] font-semibold group-hover:scale-105 transition">
              ⇔
            </div>
          </div>
          <SideTag style={{ right: `calc(${(1 - split) * 100}% + 14px)` }} text={keyLabel(keyA)} />
          <SideTag style={{ left: `calc(${split * 100}% + 14px)` }} text={keyLabel(keyB)} />
        </>
      )}
      {!readyA && <div className="absolute inset-0 skeleton opacity-40" />}
      {overlayError && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 glass rounded px-3 py-1.5 text-xs text-amber-300">
          Overlay unavailable — run the data pipeline. ({overlayError})
        </div>
      )}
    </div>
  );
}

function SideTag({ style, text }: { style: React.CSSProperties; text: string }) {
  return (
    <div
      className="absolute top-[42%] z-10 pointer-events-none glass rounded-sm px-2.5 py-1 font-mono text-[12px] tracking-wide text-fg"
      style={style}
    >
      {text}
    </div>
  );
}
