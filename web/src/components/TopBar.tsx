"use client";
import { useEffect, useRef, useState } from "react";
import { useApp, type View } from "@/lib/store";
import type { Manifest } from "@/lib/types";

interface Hit {
  label: string;
  sub: string;
  lon: number;
  lat: number;
  local?: boolean;
}

export default function TopBar({ manifest }: { manifest: Manifest | null }) {
  const view = useApp((x) => x.view);
  const set = useApp((x) => x.set);
  return (
    <header className="h-12 shrink-0 flex items-center gap-4 px-4 border-b border-line bg-ink relative z-30">
      <div className="flex items-baseline gap-2.5 shrink-0">
        <Mark />
        <span className="text-[14px] font-semibold tracking-[0.02em]">Terris</span>
        <span className="hidden sm:inline text-[12px] text-dim">Urban heat · Lahore</span>
      </div>

      <nav className="flex items-center gap-0.5 ml-2">
        {(["map", "analysis", "method"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => set({ view: v })}
            aria-label={v === "method" ? "Method & data" : v}
            className={`h-8 px-3 rounded text-[12px] capitalize transition ${
              view === v ? "text-fg bg-panel-2" : "text-muted hover:text-fg"
            }`}
          >
            {v === "method" ? (
              <>
                <span className="sm:hidden">Method</span>
                <span className="hidden sm:inline">Method & data</span>
              </>
            ) : (
              v
            )}
          </button>
        ))}
      </nav>

      <div className="flex-1" />
      {manifest && <Search manifest={manifest} />}
      <span className="hidden lg:block text-[10px] text-dim max-w-[180px] leading-tight">
        Independent prototype. Not affiliated with or endorsed by NASA.
      </span>
    </header>
  );
}

function Search({ manifest }: { manifest: Manifest }) {
  const set = useApp((x) => x.set);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const local: Hit[] = manifest.neighbourhoods
      .filter((h) => h.name.toLowerCase().includes(term))
      .map((h) => ({ label: h.name, sub: "Neighbourhood sample area", lon: h.lon, lat: h.lat, local: true }));
    setHits(local);
    const ac = new AbortController();
    // Debounced, biased to Lahore, restricted to the study area
    const t = setTimeout(() => {
      const [w, s, e, n] = manifest.bbox;
      fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${manifest.center[1]}&lon=${manifest.center[0]}&limit=6&lang=en&bbox=${w},${s},${e},${n}`,
        { signal: ac.signal })
        .then((r) => r.json())
        .then((j) => {
          const remote: Hit[] = (j.features ?? []).map((f: { geometry: { coordinates: [number, number] }; properties: Record<string, string> }) => ({
            label: f.properties.name ?? f.properties.street ?? "Unnamed",
            sub: [f.properties.district, f.properties.city, f.properties.osm_value].filter(Boolean).join(" · "),
            lon: f.geometry.coordinates[0],
            lat: f.geometry.coordinates[1],
          }));
          setHits([...local, ...remote]);
        })
        .catch(() => {});
    }, 280);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [q, manifest]);

  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const go = (h: Hit) => {
    set({
      view: "map",
      selected: { lon: h.lon, lat: h.lat, label: h.label },
      rightOpen: true,
      flyTo: { lon: h.lon, lat: h.lat, zoom: h.local ? 13.4 : 14, t: Date.now() },
    });
    setOpen(false);
    setQ(h.label);
  };

  return (
    <div ref={box} className="relative w-[300px] max-w-[45vw]">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, hits.length - 1));
          if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
          if (e.key === "Enter" && hits[active]) go(hits[active]);
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search Lahore: Gulberg, Mall Road, Jallo Park…"
        className="w-full h-8 rounded-md bg-panel border border-line px-3 pl-8 text-[12px] text-fg placeholder:text-dim outline-none focus:border-line-2"
        aria-label="Search places"
      />
      <svg className="absolute left-2.5 top-2.5 text-dim" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      {open && hits.length > 0 && (
        <ul className="absolute top-9 left-0 right-0 glass rounded-md py-1 shadow-xl max-h-80 overflow-auto scroll-thin">
          {hits.map((h, i) => (
            <li key={`${h.label}-${i}`}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => go(h)}
                className={`w-full text-left px-3 py-1.5 ${i === active ? "bg-panel-2" : ""}`}
              >
                <div className="text-[12px] text-fg">{h.label}</div>
                <div className="text-[10px] text-dim truncate">{h.sub}</div>
              </button>
            </li>
          ))}
          <li className="px-3 pt-1 text-[9px] text-dim">Search by Photon · © OpenStreetMap contributors</li>
        </ul>
      )}
    </div>
  );
}

function Mark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="7" fill="none" stroke="#f0a04b" strokeWidth="1.4" />
      <circle cx="8" cy="8" r="3.2" fill="#f0a04b" />
    </svg>
  );
}
