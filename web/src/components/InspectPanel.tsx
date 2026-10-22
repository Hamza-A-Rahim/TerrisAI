"use client";
import { useEffect, useMemo, useState } from "react";
import { CITY } from "@/lib/data";
import { fmt, fmtLayer, fmtP, isChangeLayer, keyLabel, WORLDCOVER } from "@/lib/format";
import { useApp } from "@/lib/store";
import type { Manifest, PointResult, Summary } from "@/lib/types";
import EChart, { axis, base, CHART, type EOption } from "./EChart";

export default function InspectPanel({ manifest, summary }: { manifest: Manifest; summary: Summary | null }) {
  const s = useApp();
  const set = s.set;
  if (!s.rightOpen) {
    return (
      <button
        onClick={() => set({ rightOpen: true })}
        className="absolute right-14 top-3 z-20 glass rounded-md h-9 px-3 text-xs text-fg hover:bg-panel-2 transition"
      >
        Overview →
      </button>
    );
  }
  return (
    <aside className="absolute right-14 top-3 bottom-3 z-20 w-[344px] glass rounded-lg flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 h-10 border-b border-line shrink-0">
        <span className="text-[11px] uppercase tracking-[0.14em] text-muted">
          {s.selected ? "Location" : "Lahore overview"}
        </span>
        <div className="flex items-center gap-3">
          {s.selected && (
            <button onClick={() => set({ selected: null, point: null })} className="text-[11px] text-dim hover:text-fg">
              Clear
            </button>
          )}
          <button onClick={() => set({ rightOpen: false })} className="text-dim hover:text-fg text-xs" aria-label="Collapse">→</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin">
        {s.selected ? <LocationView manifest={manifest} summary={summary} /> : <Overview summary={summary} />}
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ location */

function LocationView({ manifest, summary }: { manifest: Manifest; summary: Summary | null }) {
  const s = useApp();
  const sel = s.selected!;
  const [data, setData] = useState<PointResult | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "outside" | "error">("loading");
  const [place, setPlace] = useState<string | null>(sel.label ?? null);

  useEffect(() => {
    const ac = new AbortController();
    setState("loading");
    fetch(`/api/point?city=${CITY}&lon=${sel.lon.toFixed(6)}&lat=${sel.lat.toFixed(6)}`, { signal: ac.signal })
      .then(async (r) => {
        if (r.status === 422) return setState("outside");
        if (!r.ok) throw new Error(String(r.status));
        setData(await r.json());
        setState("ok");
      })
      .catch((e) => e.name !== "AbortError" && setState("error"));
    if (!sel.label) {
      setPlace(null);
      fetch(`https://photon.komoot.io/reverse?lon=${sel.lon}&lat=${sel.lat}&lang=en`, { signal: ac.signal })
        .then((r) => r.json())
        .then((j) => {
          const p = j.features?.[0]?.properties;
          if (p) setPlace([p.name, p.district ?? p.locality, p.city].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).slice(0, 2).join(", "));
        })
        .catch(() => {});
    }
    return () => ac.abort();
  }, [sel.lon, sel.lat, sel.label]);

  const layer = s.layer;
  const comparing = s.compare && !isChangeLayer(layer);
  const key = isChangeLayer(layer) ? "p2023_2025" : comparing ? s.keyB : s.timeKey;
  const v = data?.values[key];

  return (
    <div className="px-4 py-3 space-y-4">
      <div>
        <div className="text-[15px] text-fg leading-tight">{place ?? "Unnamed location"}</div>
        <div className="font-mono text-[10px] text-dim mt-0.5 tabular">
          {sel.lat.toFixed(5)}°N {sel.lon.toFixed(5)}°E
          {data && <> · land cover: <span className="text-muted">{WORLDCOVER[data.landcover ?? 0] ?? "—"}</span></>}
        </div>
      </div>

      {state === "loading" && <div className="h-28 rounded skeleton" />}
      {state === "outside" && <Notice>This point is outside the Lahore study area, so there is no data for it.</Notice>}
      {state === "error" && <Notice>The measurements couldn’t be loaded. Check that the data pipeline has run.</Notice>}

      {state === "ok" && data && (
        <>
          {isChangeLayer(layer) ? (
            <ChangeBlock data={data} layer={layer} />
          ) : (
            <ValueBlock data={data} k={key} other={comparing ? s.keyA : null} />
          )}
          {v && v.count === 0 && !isChangeLayer(layer) && (
            <Notice>No clear observation of this pixel in {keyLabel(key)}: clouds or masking removed every scene.</Notice>
          )}
          <PixelHistory data={data} manifest={manifest} summary={summary} />
          <p className="text-[10px] text-dim leading-relaxed">
            Values come from the 30 m pixel centred at {data.pixel.center[1].toFixed(5)}, {data.pixel.center[0].toFixed(5)}.
            They are medians of clear-sky May–June Landsat 8/9 Collection 2 Level-2 observations (overpass about 10:40 local time),
            so they describe the ground surface, not air temperature. A single pixel’s year-to-year series is noisy.
            Trend tests are reported for neighbourhoods and the city in Analysis.
          </p>
        </>
      )}
    </div>
  );
}

function ValueBlock({ data, k, other }: { data: PointResult; k: string; other: string | null }) {
  const v = data.values[k];
  const o = other ? data.values[other] : null;
  const rows: { label: string; val: string; prev?: string; delta?: string }[] = [
    { label: "Surface temperature", val: fmtLayer("lst", v.lst), prev: o ? fmtLayer("lst", o.lst) : undefined,
      delta: o && v.lst != null && o.lst != null ? `${fmt(v.lst - o.lst, 1, true)}` : undefined },
    { label: "Anomaly vs rural", val: fmtLayer("anom", v.anom), prev: o ? fmtLayer("anom", o.anom) : undefined,
      delta: o && v.anom != null && o.anom != null ? `${fmt(v.anom - o.anom, 1, true)}` : undefined },
    { label: "NDVI", val: fmt(v.ndvi, 2), prev: o ? fmt(o.ndvi, 2) : undefined,
      delta: o && v.ndvi != null && o.ndvi != null ? `${fmt(v.ndvi - o.ndvi, 2, true)}` : undefined },
  ];
  return (
    <div className="rounded-md border border-line overflow-hidden">
      <div className="grid grid-cols-[1fr_auto_auto_auto] text-[10px] uppercase tracking-[0.1em] text-dim bg-ink/40 px-3 py-1.5 gap-x-3">
        <span />
        {o && <span className="text-right">{keyLabel(other!)}</span>}
        <span className="text-right">{keyLabel(k)}</span>
        {o && <span className="text-right">Δ</span>}
      </div>
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[1fr_auto_auto_auto] items-baseline px-3 py-2 gap-x-3 border-t border-line">
          <span className="text-[12px] text-muted">{r.label}</span>
          {o && <span className="font-mono text-[12px] text-muted tabular text-right">{r.prev}</span>}
          <span className="font-mono text-[14px] text-fg tabular text-right">{r.val}</span>
          {o && <span className="font-mono text-[11px] tabular text-right text-accent">{r.delta ?? "—"}</span>}
        </div>
      ))}
      <div className="px-3 py-1.5 border-t border-line text-[10px] text-dim font-mono tabular flex justify-between">
        <span>clear obs: {o ? `${o.count} / ${v.count}` : v.count}</span>
        <span>LST uncertainty ±{fmt(v.unc, 1)} K</span>
      </div>
    </div>
  );
}

function ChangeBlock({ data, layer }: { data: PointResult; layer: string }) {
  const a = data.values.p2014_2016;
  const b = data.values.p2023_2025;
  const isT = layer === "d_anom";
  const va = isT ? a.anom : a.ndvi;
  const vb = isT ? b.anom : b.ndvi;
  const d = va != null && vb != null ? vb - va : null;
  const noise = isT && a.unc != null && b.unc != null ? Math.hypot(a.unc / Math.sqrt(Math.max(a.count, 1)), b.unc / Math.sqrt(Math.max(b.count, 1))) : null;
  return (
    <div className="rounded-md border border-line p-3">
      <div className="text-[10px] uppercase tracking-[0.1em] text-dim">{isT ? "Change in LST anomaly" : "Change in NDVI"}</div>
      <div className="font-mono text-2xl text-fg tabular mt-1">{isT ? `${fmt(d, 1, true)} °C` : fmt(d, 2, true)}</div>
      <div className="font-mono text-[11px] text-muted tabular mt-1">
        {isT ? `${fmt(va, 1, true)} → ${fmt(vb, 1, true)} °C` : `${fmt(va, 2)} → ${fmt(vb, 2)}`} · obs {a.count} → {b.count}
      </div>
      {noise != null && d != null && (
        <div className="text-[10px] text-dim mt-2 leading-snug">
          Rough measurement noise for this pixel: ±{fmt(1.96 * noise, 1)} °C (from the Landsat ST_QA band).
          {Math.abs(d) < 1.96 * noise ? " The change is within that noise." : " The change is larger than that noise."}
        </div>
      )}
    </div>
  );
}

function PixelHistory({ data, manifest, summary }: { data: PointResult; manifest: Manifest; summary: Summary | null }) {
  const years = manifest.years.map(String);
  const option = useMemo<EOption>(() => {
    const anom = years.map((y) => data.values[y]?.anom ?? null);
    const ndvi = years.map((y) => data.values[y]?.ndvi ?? null);
    const cityUhi = summary ? summary.city_series.uhi : [];
    return {
      ...base(),
      grid: { left: 34, right: 34, top: 26, bottom: 22 },
      legend: { top: 0, left: 0, itemWidth: 10, itemHeight: 2, itemGap: 8, textStyle: { color: CHART.text, fontSize: 10 } },
      xAxis: { type: "category", data: years.map((y) => `’${y.slice(2)}`), ...axis({ splitLine: { show: false } }) },
      yAxis: [
        { type: "value", ...axis() },
        { type: "value", min: 0, max: 0.8, ...axis({ splitLine: { show: false } }) },
      ],
      series: [
        { name: "Pixel anomaly °C", type: "line", data: anom, symbolSize: 5, connectNulls: false,
          lineStyle: { color: CHART.heat, width: 1.6 }, itemStyle: { color: CHART.heat } },
        { name: "Urban core avg", type: "line", data: cityUhi, symbol: "none",
          lineStyle: { color: CHART.muted, width: 1, type: "dashed" }, itemStyle: { color: CHART.muted } },
        { name: "NDVI (right)", type: "line", yAxisIndex: 1, data: ndvi, symbolSize: 4,
          lineStyle: { color: CHART.veg, width: 1.2 }, itemStyle: { color: CHART.veg } },
      ],
    };
  }, [data, years, summary]);
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.1em] text-dim mb-1">History · May–June each year</div>
      <EChart option={option} height={170} />
    </div>
  );
}

/* ------------------------------------------------------------------ overview */

function Overview({ summary }: { summary: Summary | null }) {
  const set = useApp((x) => x.set);
  if (!summary) return <div className="m-4 h-40 rounded skeleton" />;
  const t = summary.city_trends.uhi;
  const p = summary.city_periods.uhi;
  const nd = summary.city_trends.urban_ndvi;
  const cs = summary.city_series;
  const option: EOption = {
    ...base(),
    grid: { left: 30, right: 8, top: 10, bottom: 20 },
    xAxis: { type: "category", data: cs.years.map((y) => `’${String(y).slice(2)}`), ...axis({ splitLine: { show: false } }) },
    yAxis: { type: "value", ...axis() },
    series: [
      { type: "bar", data: cs.uhi, barWidth: "55%",
        itemStyle: { color: (d: { value: number }) => (d.value >= 0 ? CHART.heat : CHART.cool), borderRadius: 1 } },
      ...(t ? [{ type: "line", symbol: "none", lineStyle: { color: CHART.fg, width: 1, type: "dashed" },
        data: cs.years.map((y) => t.intercept + (t.slope_per_decade / 10) * y) }] : []),
    ],
    tooltip: { ...(base().tooltip as object), valueFormatter: (v: number) => `${fmt(v, 2, true)} °C` },
  };

  return (
    <div className="px-4 py-3 space-y-5">
      <div>
        <div className="text-[12px] text-muted leading-snug">
          Daytime <b className="text-fg font-medium">surface</b> heat island: the urban core minus rural cropland, same overpass, May–June.
        </div>
        <EChart option={option} height={140} />
        <div className="grid grid-cols-2 gap-2 mt-1">
          <Stat label="Trend per decade" value={t ? `${fmt(t.slope_per_decade, 2, true)} °C` : "—"}
            sub={t ? `${fmtP(t.p_value)} · ${t.significant ? "significant" : "not significant"}` : "too few years"} strong={t?.significant} />
          <Stat label="2023–25 vs 2014–16" value={p ? `${fmt(p.difference, 2, true)} °C` : "—"}
            sub={p ? `${fmtP(p.p_value)} · n=${p.n_a}/${p.n_b} scenes` : ""} strong={p?.significant} />
          <Stat label="Urban NDVI trend" value={nd ? `${fmt(nd.slope_per_decade, 3, true)}/dec` : "—"}
            sub={nd ? `${fmtP(nd.p_value)}` : ""} strong={nd?.significant} />
          <Stat label="Scenes used" value={`${summary.scenes.filter((x) => x.accepted).length}`}
            sub={`of ${summary.scenes.length} candidates`} />
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.1em] text-dim mb-1.5">Neighbourhoods · 2023–25</div>
        <div className="rounded-md border border-line divide-y divide-line">
          {summary.neighbourhoods.map((h) => {
            const pa = h.periods.anom;
            return (
              <button key={h.id}
                onClick={() => set({ selected: { lon: h.lon, lat: h.lat, label: `${h.name}, Lahore` }, flyTo: { lon: h.lon, lat: h.lat, zoom: 13.4, t: Date.now() } })}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-panel-2/70 text-left transition">
                <span className="text-[12px] text-fg/90">{h.name}</span>
                <span className="font-mono text-[11px] tabular text-muted">
                  {pa ? `${fmt(pa.mean_b, 1, true)} °C` : "—"}
                  <span className={`ml-2 ${pa?.significant ? "text-accent" : "text-dim"}`}>
                    {pa ? `Δ${fmt(pa.difference, 1, true)}${pa.significant ? "*" : ""}` : ""}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-dim mt-1.5 leading-snug">
          Mean anomaly vs rural in a 1 km circle. Δ = change since 2014–16; * = permutation test p &lt; 0.05.
          These are associations, not proof of what caused them.
        </p>
      </div>

      <div className="text-[11px] text-muted leading-snug border-t border-line pt-3">
        Click anywhere on the map to inspect a 30 m pixel.
      </div>
    </div>
  );
}

function Stat({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className="rounded-md border border-line px-2.5 py-2">
      <div className="text-[10px] text-dim">{label}</div>
      <div className={`font-mono text-[15px] tabular ${strong ? "text-accent" : "text-fg"}`}>{value}</div>
      {sub && <div className="text-[10px] text-dim font-mono">{sub}</div>}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-line bg-ink/40 px-3 py-2 text-[11px] text-muted leading-snug">{children}</div>;
}
