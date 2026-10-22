"use client";
import type { LayerDef, LayerId } from "@/lib/types";

const UNIT_LABEL: Record<LayerId, string> = {
  lst: "°C, surface (not air) temperature",
  anom: "°C relative to rural cropland",
  ndvi: "NDVI (unitless)",
  d_anom: "Δ °C anomaly, later minus earlier",
  d_ndvi: "Δ NDVI, later minus earlier",
};

export default function Legend({ id, def }: { id: LayerId; def: LayerDef }) {
  const { min, max, colors } = def.legend;
  const diverging = id === "anom" || id.startsWith("d_");
  const ticks = diverging ? [min, min / 2, 0, max / 2, max] : [min, (min + max) / 2, max];
  const digits = id.includes("ndvi") ? 2 : 0;
  const fmtTick = (v: number) => `${diverging && v > 0 ? "+" : ""}${v.toFixed(digits)}`;
  return (
    <div>
      <div className="h-2 rounded-[2px]" style={{ background: `linear-gradient(90deg, ${colors.join(",")})` }} />
      <div className="flex justify-between mt-1 font-mono text-[10px] text-muted tabular">
        {ticks.map((t) => (
          <span key={t}>{fmtTick(t)}</span>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 mt-1.5 text-[10px] text-dim">
        <span>{UNIT_LABEL[id]}</span>
        <span className="flex items-center gap-1 shrink-0">
          <span className="inline-block w-2.5 h-2.5 rounded-[2px]" style={{ background: "rgba(128,128,128,0.55)" }} />
          no data
        </span>
      </div>
    </div>
  );
}
