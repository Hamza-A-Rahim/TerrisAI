"use client";
import { useEffect } from "react";
import { isChangeLayer, keyLabel } from "@/lib/format";
import { useApp } from "@/lib/store";
import type { Manifest } from "@/lib/types";

const SPEEDS = [
  { ms: 2200, label: "0.5×" },
  { ms: 1400, label: "1×" },
  { ms: 700, label: "2×" },
];

export default function Timeline({ manifest }: { manifest: Manifest }) {
  const s = useApp();
  const set = s.set;
  const years = manifest.years.map(String);
  const periods = Object.keys(manifest.periods);
  const change = isChangeLayer(s.layer);
  const comparing = s.compare && !change;

  // Animation: step through years
  useEffect(() => {
    if (!s.playing || comparing || change) return;
    const t = setInterval(() => {
      const st = useApp.getState();
      const i = years.indexOf(st.timeKey);
      st.set({ timeKey: years[(i + 1) % years.length] ?? years[0] });
    }, s.speedMs);
    return () => clearInterval(t);
  }, [s.playing, s.speedMs, comparing, change, years]);

  const left = s.leftOpen ? "left-[280px]" : "left-3";
  const right = s.rightOpen && s.view === "map" ? "right-[412px]" : "right-3";

  if (change) {
    return (
      <Bar className={`${left} ${right}`}>
        <span className="text-[11px] text-muted">
          Showing <b className="text-fg font-medium">2023–25</b> minus <b className="text-fg font-medium">2014–16</b> (May–June medians, each period 3 seasons)
        </span>
      </Bar>
    );
  }

  if (comparing) {
    return (
      <Bar className={`${left} ${right}`}>
        <Picker label="Left" value={s.keyA} years={years} periods={periods} onChange={(v) => set({ keyA: v })} />
        <span className="text-dim">⇔</span>
        <Picker label="Right" value={s.keyB} years={years} periods={periods} onChange={(v) => set({ keyB: v })} />
        <span className="hidden xl:block text-[10px] text-dim ml-auto">
          Periods pool all clear scenes from three seasons. Single years are noisier.
        </span>
      </Bar>
    );
  }

  const isYear = years.includes(s.timeKey);
  return (
    <Bar className={`${left} ${right}`}>
      <button
        onClick={() => set({ playing: !s.playing, timeKey: isYear ? s.timeKey : years[0] })}
        className="w-8 h-8 shrink-0 rounded-full bg-fg text-ink flex items-center justify-center hover:scale-105 transition"
        aria-label={s.playing ? "Pause" : "Play"}
      >
        {s.playing ? (
          <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="3" height="8" fill="currentColor"/><rect x="6" y="1" width="3" height="8" fill="currentColor"/></svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 1 9 5 2 9Z" fill="currentColor"/></svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="relative flex items-end justify-between h-8">
          <div className="absolute left-1 right-1 bottom-[7px] h-px bg-line-2" />
          {years.map((y) => {
            const active = s.timeKey === y;
            return (
              <button
                key={y}
                onClick={() => set({ timeKey: y, playing: false })}
                className="relative flex flex-col items-center gap-1 group px-0.5"
                aria-pressed={active}
                aria-label={y}
              >
                <span className={`font-mono text-[10px] tabular transition ${active ? "text-fg" : "text-dim group-hover:text-muted"}`}>
                  {y.slice(2) === "14" || y.slice(2) === "25" || active ? y : `’${y.slice(2)}`}
                </span>
                <span className={`w-2 h-2 rounded-full border transition ${
                  active ? "bg-accent border-accent scale-125" : "bg-ink border-line-2 group-hover:border-muted"}`} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0 border-l border-line pl-3">
        {periods.map((p) => (
          <button
            key={p}
            onClick={() => set({ timeKey: p, playing: false })}
            className={`h-7 px-2 rounded text-[11px] font-mono transition ${
              s.timeKey === p ? "bg-panel-2 text-fg border border-line-2" : "text-muted hover:text-fg border border-transparent"}`}
          >
            {keyLabel(p)}
          </button>
        ))}
      </div>

      <div className="hidden md:flex items-center gap-0.5 shrink-0 border-l border-line pl-3">
        {SPEEDS.map((sp) => (
          <button key={sp.ms} onClick={() => set({ speedMs: sp.ms })}
            className={`h-6 px-1.5 rounded text-[10px] font-mono ${s.speedMs === sp.ms ? "text-fg bg-panel-2" : "text-dim hover:text-muted"}`}>
            {sp.label}
          </button>
        ))}
      </div>
    </Bar>
  );
}

function Bar({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <div className={`absolute bottom-8 z-20 glass rounded-lg h-14 px-3 flex items-center gap-3 transition-all ${className}`}>
      {children}
    </div>
  );
}

function Picker({ label, value, years, periods, onChange }: {
  label: string; value: string; years: string[]; periods: string[]; onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-[0.12em] text-dim">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 bg-ink/70 border border-line-2 rounded px-2 font-mono text-[12px] text-fg outline-none focus:border-muted"
      >
        <optgroup label="3-season periods">
          {periods.map((p) => (
            <option key={p} value={p}>{keyLabel(p)}</option>
          ))}
        </optgroup>
        <optgroup label="Single seasons">
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}
