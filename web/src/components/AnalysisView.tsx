"use client";
import { useMemo, useState } from "react";
import { fmt, fmtP, keyLabel } from "@/lib/format";
import type { Summary, Trend } from "@/lib/types";
import EChart, { axis, base, CHART, type EOption } from "./EChart";

const HOOD_COLORS = ["#f0a04b", "#5aa9e6", "#7cc68d", "#d77fa1", "#c9b458", "#9a8cf0", "#5fc4bd", "#e07a5f"];
const yearsShort = (ys: number[]) => ys.map((y) => `’${String(y).slice(2)}`);
const trendLine = (t: Trend | null, years: number[]) =>
  t ? years.map((y) => +(t.intercept + (t.slope_per_decade / 10) * y).toFixed(3)) : [];

export default function AnalysisView({ summary }: { summary: Summary | null }) {
  if (!summary) return <div className="p-8"><div className="h-64 rounded-lg skeleton" /></div>;
  return (
    <div className="h-full overflow-y-auto scroll-thin">
      <div className="max-w-[1180px] mx-auto px-6 py-8 space-y-10">
        <header className="space-y-2">
          <h1 className="text-[22px] font-semibold tracking-tight">Lahore’s surface heat island, 2014–2025</h1>
          <p className="text-[13px] text-muted max-w-3xl leading-relaxed">
            Every figure comes from cloud-masked Landsat 8/9 Collection 2 Level-2 scenes (WRS-2 149/038)
            acquired in May–June, around 10:40 local time. The heat-island measure is the urban core minus a rural
            cropland reference <i>on the same day</i>, which removes most of the weather difference between dates.
            The statistics show associations. They don’t establish causes.
          </p>
        </header>

        <CityTrend s={summary} />
        <RuralDependence s={summary} />
        <div className="grid lg:grid-cols-2 gap-8">
          <UrbanRural s={summary} />
          <Vegetation s={summary} />
        </div>
        <div className="grid lg:grid-cols-2 gap-8">
          <Scatter s={summary} />
          <Distribution s={summary} />
        </div>
        <Neighbourhoods s={summary} />
        <Quality s={summary} />
      </div>
    </div>
  );
}

function Card({ title, source, children, note }: { title: string; source: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-4 border-b border-line pb-1.5">
        <h2 className="text-[13px] font-medium text-fg">{title}</h2>
        <span className="text-[10px] text-dim text-right">{source}</span>
      </div>
      {children}
      {note && <div className="text-[11px] text-dim leading-relaxed">{note}</div>}
    </section>
  );
}

function TrendPill({ label, t, unit }: { label: string; t: Trend | null; unit: string }) {
  return (
    <div className="rounded-md border border-line px-3 py-2 min-w-[150px]">
      <div className="text-[10px] text-dim">{label}</div>
      {t ? (
        <>
          <div className={`font-mono text-[14px] tabular ${t.significant ? "text-accent" : "text-fg"}`}>
            {fmt(t.slope_per_decade, unit === "NDVI" ? 3 : 2, true)} {unit}/decade
          </div>
          <div className="font-mono text-[10px] text-dim tabular">
            95% CI [{fmt(t.slope_ci95_per_decade[0], 2, true)}, {fmt(t.slope_ci95_per_decade[1], 2, true)}] · {fmtP(t.p_value)}
          </div>
        </>
      ) : (
        <div className="text-[12px] text-dim">insufficient data</div>
      )}
    </div>
  );
}

function CityTrend({ s }: { s: Summary }) {
  const cs = s.city_series;
  const t = s.city_trends;
  const p = s.city_periods.uhi;
  const option = useMemo<EOption>(() => ({
    ...base(),
    grid: { left: 44, right: 16, top: 30, bottom: 26 },
    legend: { top: 0, right: 0, itemWidth: 14, itemHeight: 2, textStyle: { color: CHART.text, fontSize: 11 } },
    tooltip: { ...(base().tooltip as object), valueFormatter: (v: number) => (v == null ? "—" : `${fmt(v, 2, true)} °C`) },
    xAxis: { type: "category", data: cs.years.map(String), ...axis({ splitLine: { show: false } }) },
    yAxis: { type: "value", name: "°C (urban − rural)", ...axis(), nameGap: 10 },
    series: [
      { name: "Heat island (25–40 km ring)", type: "line", data: cs.uhi, symbolSize: 7, z: 5,
        lineStyle: { color: CHART.heat, width: 2 }, itemStyle: { color: CHART.heat },
        markLine: { silent: true, symbol: "none", data: [{ yAxis: 0 }], lineStyle: { color: CHART.axis, type: "solid" }, label: { show: false } } },
      { name: "Theil–Sen trend", type: "line", data: trendLine(t.uhi, cs.years), symbol: "none",
        lineStyle: { color: CHART.fg, width: 1, type: "dashed" }, itemStyle: { color: CHART.fg } },
      { name: "Alt. ring 20–30 km", type: "line", data: cs.uhi_alt, symbol: "none",
        lineStyle: { color: CHART.cool, width: 1, opacity: 0.8 }, itemStyle: { color: CHART.cool } },
      { name: "Landsat 8 only", type: "line", data: cs.uhi_l8_only, symbol: "none",
        lineStyle: { color: CHART.muted, width: 1, type: "dotted" }, itemStyle: { color: CHART.muted } },
    ],
  }), [cs, t]);
  return (
    <Card
      title="Urban core minus rural reference, by year"
      source="Landsat 8/9 C2 L2 ST_B10 · median of clear May–June scenes per year"
      note={<>The dashed line is a Theil–Sen slope, and significance comes from a Mann–Kendall test. With about 12 annual points the test has low power, so “not significant” means no trend could be detected. It doesn’t mean nothing changed. The blue and dotted lines are sensitivity checks. If they disagree with the main line, the result depends on how the rural reference or sensor mix is chosen.</>}
    >
      <div className="flex flex-wrap gap-2">
        <TrendPill label="Heat island trend" t={t.uhi} unit="°C" />
        <TrendPill label="Using alt. rural ring" t={t.uhi_alt} unit="°C" />
        <TrendPill label="Landsat 8 only" t={t.uhi_l8_only} unit="°C" />
        <div className="rounded-md border border-line px-3 py-2 min-w-[150px]">
          <div className="text-[10px] text-dim">2023–25 vs 2014–16 (scene-level)</div>
          {p ? (
            <>
              <div className={`font-mono text-[14px] tabular ${p.significant ? "text-accent" : "text-fg"}`}>{fmt(p.difference, 2, true)} °C</div>
              <div className="font-mono text-[10px] text-dim tabular">
                95% CI [{fmt(p.ci95[0], 2, true)}, {fmt(p.ci95[1], 2, true)}] · {fmtP(p.p_value)} · n={p.n_a}/{p.n_b}
              </div>
            </>
          ) : <div className="text-[12px] text-dim">insufficient data</div>}
        </div>
      </div>
      <EChart option={option} height={280} />
    </Card>
  );
}

function pearson(x: number[], y: number[]): number {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

/** Scene-level: how much the heat-island value depends on the state of the rural fields */
function RuralDependence({ s }: { s: Summary }) {
  const acc = s.scenes.filter((x) => x.accepted && x.uhi != null && x.rural_lst != null);
  const r = pearson(acc.map((x) => x.rural_lst!), acc.map((x) => x.uhi!));
  const early = acc.filter((x) => +x.date.slice(0, 4) <= 2016);
  const late = acc.filter((x) => +x.date.slice(0, 4) >= 2023);
  const mid = acc.filter((x) => !early.includes(x) && !late.includes(x));
  const pts = (rows: typeof acc) => rows.map((x) => ({ value: [x.rural_lst, x.uhi], date: x.date, rn: x.rural_ndvi }));
  const option: EOption = {
    ...base(),
    legend: { top: 0, right: 0, itemWidth: 8, itemHeight: 8, textStyle: { color: CHART.text, fontSize: 11 } },
    grid: { left: 44, right: 14, top: 30, bottom: 36 },
    tooltip: {
      trigger: "item", backgroundColor: "rgba(18,21,26,0.96)", borderColor: CHART.axis, textStyle: { color: CHART.fg, fontSize: 11 },
      formatter: (p: { data: { value: [number, number]; date: string; rn: number } }) =>
        `${p.data.date}<br/>rural ${fmt(p.data.value[0], 1)} °C · NDVI ${fmt(p.data.rn, 2)}<br/>urban − rural ${fmt(p.data.value[1], 2, true)} °C`,
    },
    xAxis: { type: "value", scale: true, name: "Rural reference LST (°C)", nameLocation: "middle", nameGap: 24, ...axis() },
    yAxis: { type: "value", name: "°C urban − rural", ...axis() },
    series: [
      { name: "2014–16", type: "scatter", symbolSize: 9, itemStyle: { color: CHART.cool }, data: pts(early),
        markLine: { silent: true, symbol: "none", data: [{ yAxis: 0 }], lineStyle: { color: CHART.axis }, label: { show: false } } },
      { name: "2017–22", type: "scatter", symbolSize: 7, itemStyle: { color: CHART.muted }, data: pts(mid) },
      { name: "2023–25", type: "scatter", symbolSize: 9, itemStyle: { color: CHART.heat }, data: pts(late) },
    ],
  };
  return (
    <Card
      title="Each scene: the heat island depends on the state of the fields"
      source={`${acc.length} accepted scenes · Pearson r = ${fmt(r, 2)}`}
      note="On dates when the rural cropland is cool (green crops, irrigation or recent rain), the city is clearly warmer than its surroundings. When the fields are bare and dry after harvest, they heat up more than the city, and the daytime surface heat island disappears or reverses. Most of the scatter in the yearly series comes from this effect, not from changes in the city. A robust long-term signal needs either more observations per season or a reference that is less sensitive to the crop calendar."
    >
      <EChart option={option} height={260} />
    </Card>
  );
}

function UrbanRural({ s }: { s: Summary }) {
  const cs = s.city_series;
  const option: EOption = {
    ...base(),
    legend: { top: 0, right: 0, itemWidth: 14, itemHeight: 2, textStyle: { color: CHART.text, fontSize: 11 } },
    grid: { left: 40, right: 12, top: 28, bottom: 24 },
    tooltip: { ...(base().tooltip as object), valueFormatter: (v: number) => (v == null ? "—" : `${fmt(v, 1)} °C`) },
    xAxis: { type: "category", data: yearsShort(cs.years), ...axis({ splitLine: { show: false } }) },
    yAxis: { type: "value", scale: true, name: "°C", ...axis() },
    series: [
      { name: "Urban core", type: "line", data: cs.urban_lst, symbolSize: 5, lineStyle: { color: CHART.heat }, itemStyle: { color: CHART.heat } },
      { name: "Rural cropland", type: "line", data: cs.rural_lst, symbolSize: 5, lineStyle: { color: CHART.veg }, itemStyle: { color: CHART.veg } },
    ],
  };
  return (
    <Card title="Absolute surface temperature" source="Landsat ST_B10 · °C · May–June medians"
      note="The year-to-year swings are mostly weather and timing within the season. That’s why the heat-island measure compares urban and rural pixels on the same date instead of tracking absolute temperature.">
      <EChart option={option} height={220} />
    </Card>
  );
}

function Vegetation({ s }: { s: Summary }) {
  const cs = s.city_series;
  const t = s.city_trends;
  const option: EOption = {
    ...base(),
    legend: { top: 0, right: 0, itemWidth: 14, itemHeight: 2, textStyle: { color: CHART.text, fontSize: 11 } },
    grid: { left: 40, right: 12, top: 28, bottom: 24 },
    tooltip: { ...(base().tooltip as object), valueFormatter: (v: number) => fmt(v, 3) },
    xAxis: { type: "category", data: yearsShort(cs.years), ...axis({ splitLine: { show: false } }) },
    yAxis: { type: "value", scale: true, name: "NDVI", ...axis() },
    series: [
      { name: "Urban core", type: "line", data: cs.urban_ndvi, symbolSize: 5, lineStyle: { color: CHART.heat }, itemStyle: { color: CHART.heat } },
      { name: "Rural reference", type: "line", data: cs.rural_ndvi, symbolSize: 5, lineStyle: { color: CHART.veg }, itemStyle: { color: CHART.veg } },
    ],
  };
  return (
    <Card title="Vegetation (NDVI)" source="Landsat SR B4/B5 · same scenes and masks as LST"
      note={<>Urban NDVI trend {t.urban_ndvi ? `${fmt(t.urban_ndvi.slope_per_decade, 3, true)}/decade, ${fmtP(t.urban_ndvi.p_value)}` : "—"}. Rural NDVI is shown to check how stable the reference is. In May–June the wheat harvest leaves many fields bare, and the harvest timing changes the rural baseline from year to year.</>}>
      <EChart option={option} height={220} />
    </Card>
  );
}

function Scatter({ s }: { s: Summary }) {
  const keys = Object.keys(s.scatter);
  const [k, setK] = useState(keys[keys.length - 1]);
  const sc = s.scatter[k];
  const option = useMemo<EOption>(() => ({
    ...base(),
    grid: { left: 44, right: 12, top: 14, bottom: 34 },
    tooltip: { trigger: "item", backgroundColor: "rgba(18,21,26,0.96)", borderColor: CHART.axis, textStyle: { color: CHART.fg, fontSize: 11 },
      formatter: (p: { value: [number, number] }) => `NDVI ${fmt(p.value[0], 2)} · ${fmt(p.value[1], 1, true)} °C` },
    xAxis: { type: "value", name: "NDVI", nameLocation: "middle", nameGap: 22, min: -0.1, max: 0.8, ...axis() },
    yAxis: { type: "value", name: "°C vs rural", ...axis() },
    series: [
      { name: "Urban core", type: "scatter", symbolSize: 3, large: true, itemStyle: { color: CHART.heat, opacity: 0.45 },
        data: sc.points.filter((p) => p[2] === "u").map((p) => [p[0], p[1]]) },
      { name: "Rural reference", type: "scatter", symbolSize: 3, large: true, itemStyle: { color: CHART.veg, opacity: 0.45 },
        data: sc.points.filter((p) => p[2] === "r").map((p) => [p[0], p[1]]) },
    ],
  }), [sc]);
  return (
    <Card title="Vegetation vs surface temperature" source={`Pixel sample from the ${keyLabel(k)} composite`}
      note={<>Pearson r = {fmt(sc.stats.pearson_r, 2)}, Spearman ρ = {fmt(sc.stats.spearman_r, 2)}, over {sc.stats.n_pixels.toLocaleString()} pixels (2,500 plotted). No p-value is given: neighbouring pixels aren’t independent, so one would be badly overconfident. A negative association fits vegetation’s cooling effect but doesn’t prove it.</>}>
      <div className="flex gap-1">
        {keys.map((kk) => (
          <button key={kk} onClick={() => setK(kk)}
            className={`h-6 px-2 rounded text-[11px] font-mono ${kk === k ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}>{keyLabel(kk)}</button>
        ))}
      </div>
      <EChart option={option} height={260} />
    </Card>
  );
}

function Distribution({ s }: { s: Summary }) {
  const keys = Object.keys(s.histogram);
  const h0 = s.histogram[keys[0]];
  const centres = h0.bins.slice(0, -1).map((b, i) => (b + h0.bins[i + 1]) / 2);
  const total = (k: string) => s.histogram[k].counts.reduce((a, b) => a + b, 0);
  const option: EOption = {
    ...base(),
    legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 8, textStyle: { color: CHART.text, fontSize: 11 } },
    grid: { left: 40, right: 12, top: 28, bottom: 34 },
    tooltip: { ...(base().tooltip as object), valueFormatter: (v: number) => `${fmt(v, 1)}%` },
    xAxis: { type: "category", data: centres.map((c) => c.toFixed(1)), name: "°C vs rural", nameLocation: "middle", nameGap: 22,
      ...axis({ splitLine: { show: false }, axisLabel: { color: CHART.text, fontSize: 10, interval: 3 } }) },
    yAxis: { type: "value", name: "% of urban px", ...axis() },
    series: keys.map((k, i) => ({
      name: keyLabel(k), type: "bar", barGap: "-100%", barCategoryGap: "10%",
      itemStyle: { color: i === 0 ? "rgba(90,169,230,0.55)" : "rgba(240,160,75,0.6)" },
      data: s.histogram[k].counts.map((c) => +(100 * c / total(k)).toFixed(2)),
    })),
  };
  return (
    <Card title="Spatial distribution across the urban core" source="Period composites · urban-core pixels"
      note={keys.map((k) => `${keyLabel(k)}: median ${fmt(s.histogram[k].median, 1, true)} °C, 90th percentile ${fmt(s.histogram[k].p90, 1, true)} °C`).join(" · ")}>
      <EChart option={option} height={260} />
    </Card>
  );
}

function Neighbourhoods({ s }: { s: Summary }) {
  const years = s.city_series.years;
  const option: EOption = {
    ...base(),
    legend: { top: 0, right: 0, itemWidth: 14, itemHeight: 2, textStyle: { color: CHART.text, fontSize: 11 } },
    grid: { left: 40, right: 12, top: 34, bottom: 24 },
    tooltip: { ...(base().tooltip as object), valueFormatter: (v: number) => (v == null ? "—" : `${fmt(v, 1, true)} °C`) },
    xAxis: { type: "category", data: years.map(String), ...axis({ splitLine: { show: false } }) },
    yAxis: { type: "value", name: "°C vs rural", ...axis() },
    series: s.neighbourhoods.map((h, i) => ({
      name: h.name, type: "line", data: h.series.anom, symbolSize: 4, connectNulls: false,
      lineStyle: { color: HOOD_COLORS[i % HOOD_COLORS.length], width: 1.5 }, itemStyle: { color: HOOD_COLORS[i % HOOD_COLORS.length] },
    })),
  };
  return (
    <Card title="Neighbourhood comparison" source="1 km circles around geocoded centroids (OSM/Nominatim) · area means"
      note="These are area-aggregated means over each circle, not single pixels. The circles are approximations of neighbourhoods, not official boundaries. Significant (*) means p < 0.05 from a Mann–Kendall test (trends) or a permutation test on scene-level means (period change). Seven areas are tested at once, so expect about one false positive in twenty tests.">
      <EChart option={option} height={260} />
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] tabular">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.08em] text-dim text-left border-b border-line">
              <th className="py-1.5 font-normal">Area</th>
              <th className="font-normal text-right">Anomaly 2023–25</th>
              <th className="font-normal text-right">Δ vs 2014–16</th>
              <th className="font-normal text-right">Anomaly trend /dec</th>
              <th className="font-normal text-right">NDVI 2023–25</th>
              <th className="font-normal text-right">Δ NDVI</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {s.neighbourhoods.map((h, i) => (
              <tr key={h.id} className="border-b border-line/60">
                <td className="py-1.5 font-sans">
                  <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: HOOD_COLORS[i % HOOD_COLORS.length] }} />
                  {h.name}
                </td>
                <td className="text-right">{fmt(h.periods.anom?.mean_b, 1, true)} °C</td>
                <Sig v={h.periods.anom?.difference} sig={h.periods.anom?.significant} d={1} unit=" °C" />
                <Sig v={h.trends.anom?.slope_per_decade} sig={h.trends.anom?.significant} d={2} unit="" />
                <td className="text-right">{fmt(h.periods.ndvi?.mean_b, 2)}</td>
                <Sig v={h.periods.ndvi?.difference} sig={h.periods.ndvi?.significant} d={3} unit="" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Sig({ v, sig, d, unit }: { v?: number; sig?: boolean; d: number; unit: string }) {
  return <td className={`text-right ${sig ? "text-accent" : "text-muted"}`}>{fmt(v, d, true)}{v != null ? unit : ""}{sig ? "*" : ""}</td>;
}

function Quality({ s }: { s: Summary }) {
  const acc = s.scenes.filter((x) => x.accepted);
  const unc = acc.map((x) => x.urban_unc_k ?? NaN).filter(Number.isFinite);
  return (
    <Card title="Data quality and uncertainty" source="Per-scene screening log"
      note={<>A scene is used only if at least 60% of urban-core pixels and 50% of rural-reference pixels are clear after QA_PIXEL masking (cloud, dilated cloud, cirrus, shadow, snow, fill). Median per-pixel LST uncertainty in the urban core (Landsat ST_QA band): {fmt(unc.sort((a, b) => a - b)[Math.floor(unc.length / 2)], 2)} K per scene. Absolute LST over rooftops carries extra error from the ASTER-based emissivity, which partly cancels in urban-minus-rural differences.</>}>
      <div className="overflow-x-auto max-h-[360px] overflow-y-auto scroll-thin rounded-md border border-line">
        <table className="w-full text-[11px] tabular">
          <thead className="sticky top-0 bg-panel">
            <tr className="text-[10px] uppercase tracking-[0.08em] text-dim text-left">
              {["Date", "Sensor", "Scene cloud", "Urban clear", "Rural clear", "Used", "Rural LST", "Urban − rural", "Unc."].map((h) => (
                <th key={h} className="px-2 py-1.5 font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono">
            {s.scenes.map((x) => (
              <tr key={x.id} className={`border-t border-line/60 ${x.accepted ? "" : "text-dim"}`} title={x.id}>
                <td className="px-2 py-1">{x.date}</td>
                <td className="px-2">{x.platform.replace("landsat-", "L")}</td>
                <td className="px-2">{fmt(x.scene_cloud_pct, 0)}%</td>
                <td className="px-2">{Math.round(x.urban_valid * 100)}%</td>
                <td className="px-2">{Math.round(x.rural_valid * 100)}%</td>
                <td className="px-2">{x.accepted ? "yes" : "no"}</td>
                <td className="px-2">{x.accepted ? `${fmt(x.rural_lst, 1)} °C` : "—"}</td>
                <td className="px-2">{x.accepted ? `${fmt(x.uhi, 2, true)} °C` : "—"}</td>
                <td className="px-2">{x.accepted ? `±${fmt(x.urban_unc_k, 1)} K` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
