import type { LayerId } from "./types";

export const PERIOD_LABELS: Record<string, string> = {
  p2014_2016: "2014–16",
  p2023_2025: "2023–25",
};

export function keyLabel(key: string): string {
  return PERIOD_LABELS[key] ?? key;
}

export function keyLong(key: string): string {
  if (PERIOD_LABELS[key]) return `${PERIOD_LABELS[key]} May–June median`;
  if (key === "change") return "2023–25 minus 2014–16";
  return `${key} May–June median`;
}

export function fmt(v: number | null | undefined, digits = 1, signed = false): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const s = v.toFixed(digits);
  return signed && v > 0 ? `+${s}` : s;
}

export function fmtLayer(layer: LayerId, v: number | null | undefined): string {
  if (layer === "ndvi" || layer === "d_ndvi") return fmt(v, 2, layer === "d_ndvi");
  return `${fmt(v, 1, layer !== "lst")} °C`;
}

export function fmtP(p: number): string {
  return p < 0.001 ? "p < 0.001" : `p = ${p.toFixed(3)}`;
}

/** Layers that compare two periods have only one "time" */
export function isChangeLayer(layer: LayerId): boolean {
  return layer === "d_anom" || layer === "d_ndvi";
}

export const WORLDCOVER: Record<number, string> = {
  10: "Tree cover",
  20: "Shrubland",
  30: "Grassland",
  40: "Cropland",
  50: "Built-up",
  60: "Bare / sparse vegetation",
  80: "Water",
  90: "Herbaceous wetland",
};
