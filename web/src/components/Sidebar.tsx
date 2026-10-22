"use client";
import { isChangeLayer } from "@/lib/format";
import { useApp } from "@/lib/store";
import type { Basemap, LayerId, Manifest } from "@/lib/types";
import Legend from "./Legend";

const PRIMARY: LayerId[] = ["lst", "anom", "ndvi"];
const CHANGE: LayerId[] = ["d_anom", "d_ndvi"];

export default function Sidebar({ manifest }: { manifest: Manifest }) {
  const s = useApp();
  const set = s.set;
  const def = manifest.layers[s.layer];

  if (!s.leftOpen) {
    return (
      <button
        onClick={() => set({ leftOpen: true })}
        className="absolute left-3 top-3 z-20 glass rounded-md h-9 px-3 text-xs text-fg hover:bg-panel-2 transition flex items-center gap-2"
        aria-label="Open layers panel"
      >
        <LayersIcon /> Layers
      </button>
    );
  }

  return (
    <aside className="absolute left-3 top-3 bottom-3 z-20 w-[264px] glass rounded-lg flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 h-10 border-b border-line">
        <span className="text-[11px] uppercase tracking-[0.14em] text-muted">Layers</span>
        <button onClick={() => set({ leftOpen: false })} className="text-dim hover:text-fg text-xs" aria-label="Collapse">
          ←
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scroll-thin px-3 py-3 space-y-5">
        <Section title="Observation">
          {PRIMARY.map((id) => (
            <LayerRow key={id} id={id} manifest={manifest} />
          ))}
        </Section>

        <Section title="Change · 2014–16 → 2023–25">
          {CHANGE.map((id) => (
            <LayerRow key={id} id={id} manifest={manifest} />
          ))}
        </Section>

        <div className="px-1 space-y-3">
          <Legend id={s.layer} def={def} />
          <label className="block">
            <div className="flex justify-between text-[10px] text-dim mb-0.5">
              <span>Opacity</span>
              <span className="font-mono tabular">{Math.round(s.opacity * 100)}%</span>
            </div>
            <input
              type="range"
              className="slider"
              min={0}
              max={1}
              step={0.05}
              value={s.opacity}
              onChange={(e) => set({ opacity: Number(e.target.value) })}
            />
          </label>
        </div>

        <Section title="Comparison">
          <Toggle
            label="Before / after split"
            hint={isChangeLayer(s.layer) ? "Not used for change layers" : "Drag the divider on the map"}
            on={s.compare && !isChangeLayer(s.layer)}
            disabled={isChangeLayer(s.layer)}
            onChange={(v) => set({ compare: v })}
          />
        </Section>

        <Section title="Basemap">
          <div className="grid grid-cols-3 gap-1 p-0.5 rounded-md bg-ink/60 border border-line">
            {(["satellite", "streets", "landsat"] as Basemap[]).map((b) => (
              <button
                key={b}
                onClick={() => set({ basemap: b })}
                className={`h-7 rounded text-[11px] capitalize transition ${
                  s.basemap === b ? "bg-panel-2 text-fg shadow-sm" : "text-muted hover:text-fg"
                }`}
              >
                {b}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-dim mt-1.5 leading-snug">
            {s.basemap === "landsat"
              ? "Landsat true colour from the same scenes as the data, so each side of the split shows its own period."
              : s.basemap === "satellite"
                ? "Sentinel-2 cloudless 2024 (EOX)."
                : "OpenStreetMap via OpenFreeMap."}
          </p>
        </Section>

        <Section title="Context">
          <Toggle label="Neighbourhood sample areas" hint="1 km circles used in the statistics" on={s.showHoods}
            onChange={(v) => set({ showHoods: v })} />
          <Toggle label="Urban core & rural reference" hint={undefined} on={s.showZones}
            onChange={(v) => set({ showZones: v })} />
          {s.showZones && (
            <div className="flex gap-3 text-[10px] text-muted pl-1 -mt-1">
              <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-[2px] bg-[#ff00ff] opacity-70" />urban core</span>
              <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-[2px] bg-[#00ffff] opacity-70" />rural reference</span>
            </div>
          )}
        </Section>
      </div>

      <div className="px-4 py-2.5 border-t border-line text-[10px] text-dim leading-snug">
        Landsat 8/9 Collection 2 Level-2 · path/row 149/038 · May–June clear-sky medians
      </div>
    </aside>
  );
}

function LayerRow({ id, manifest }: { id: LayerId; manifest: Manifest }) {
  const active = useApp((x) => x.layer === id);
  const set = useApp((x) => x.set);
  const def = manifest.layers[id];
  return (
    <button
      onClick={() => set({ layer: id })}
      className={`w-full text-left rounded-md px-2.5 py-2 transition border ${
        active ? "bg-panel-2 border-line-2" : "border-transparent hover:bg-panel-2/60"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className="w-3 h-3 rounded-[3px] shrink-0"
          style={{ background: `linear-gradient(135deg, ${def.legend.colors[2]}, ${def.legend.colors[6]})` }}
        />
        <span className={`text-[13px] ${active ? "text-fg" : "text-muted"}`}>{def.label}</span>
      </div>
      {active && <p className="text-[11px] text-dim mt-1 pl-5 leading-snug">{def.desc}</p>}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="px-1 mb-1.5 text-[10px] uppercase tracking-[0.12em] text-dim">{title}</h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Toggle({ label, hint, on, onChange, disabled }: {
  label: string; hint?: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="w-full flex items-start justify-between gap-3 px-1 py-1.5 text-left disabled:opacity-40"
      role="switch"
      aria-checked={on}
    >
      <span>
        <span className="block text-[12px] text-fg/90">{label}</span>
        {hint && <span className="block text-[10px] text-dim">{hint}</span>}
      </span>
      <span className={`mt-0.5 w-7 h-4 rounded-full relative transition shrink-0 ${on ? "bg-accent" : "bg-line-2"}`}>
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${on ? "left-3.5" : "left-0.5"}`} />
      </span>
    </button>
  );
}

function LayersIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3 2 8l10 5 10-5-10-5Z" />
      <path d="m2 13 10 5 10-5" />
    </svg>
  );
}
