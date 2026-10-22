import { create } from "zustand";
import type { Basemap, LayerId, PointResult } from "./types";

export type View = "map" | "analysis" | "method";

interface State {
  view: View;
  layer: LayerId;
  timeKey: string; // "2014".."2025" or a period id
  compare: boolean;
  keyA: string;
  keyB: string;
  opacity: number;
  basemap: Basemap;
  showZones: boolean;
  showHoods: boolean;
  leftOpen: boolean;
  rightOpen: boolean;
  playing: boolean;
  speedMs: number;
  selected: { lon: number; lat: number; label?: string } | null;
  point: PointResult | null;
  pointState: "idle" | "loading" | "error" | "outside";
  flyTo: { lon: number; lat: number; zoom: number; t: number } | null;
  set: (patch: Partial<State>) => void;
}

export const useApp = create<State>((set) => ({
  view: "map",
  layer: "anom",
  timeKey: "p2023_2025",
  compare: true,
  keyA: "p2014_2016",
  keyB: "p2023_2025",
  opacity: 0.8,
  basemap: "satellite",
  showZones: false,
  showHoods: true,
  leftOpen: true,
  rightOpen: true,
  playing: false,
  speedMs: 1400,
  selected: null,
  point: null,
  pointState: "idle",
  flyTo: null,
  set: (patch) => set(patch),
}));
