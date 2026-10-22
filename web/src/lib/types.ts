export type LayerId = "lst" | "anom" | "ndvi" | "d_anom" | "d_ndvi";
export type Basemap = "satellite" | "streets" | "landsat";

export interface LayerDef {
  label: string;
  unit: string;
  keys: string[];
  desc: string;
  legend: { min: number; max: number; colors: string[] };
}

export interface Manifest {
  city: string;
  name: string;
  center: [number, number];
  bbox: [number, number, number, number];
  corners: [[number, number], [number, number], [number, number], [number, number]];
  grid: { width: number; height: number; crs: string; transform: number[]; res_m: number };
  years: number[];
  periods: Record<string, [number, number]>;
  bands: Record<string, number>;
  cube_scales: Record<string, number>;
  nodata: number;
  layers: Record<LayerId, LayerDef>;
  truecolour: Record<string, string>;
  neighbourhoods: { id: string; name: string; lon: number; lat: number; radius_m: number }[];
}

export interface Trend {
  n: number;
  slope_per_decade: number;
  slope_ci95_per_decade: [number, number];
  intercept: number;
  kendall_tau: number;
  p_value: number;
  significant: boolean;
}

export interface PeriodTest {
  n_a: number;
  n_b: number;
  mean_a: number;
  mean_b: number;
  difference: number;
  ci95: [number, number];
  p_value: number;
  significant: boolean;
}

export interface SceneRow {
  id: string;
  date: string;
  platform: string;
  scene_cloud_pct: number;
  urban_valid: number;
  rural_valid: number;
  accepted: boolean;
  reason?: string;
  rural_lst?: number;
  rural_alt_lst?: number;
  urban_lst?: number;
  uhi?: number;
  uhi_alt?: number;
  urban_ndvi?: number;
  rural_ndvi?: number;
  urban_unc_k?: number;
}

type Series = (number | null)[];

export interface Neighbourhood {
  id: string;
  name: string;
  lon: number;
  lat: number;
  geocoded_as: string;
  radius_m: number;
  series: { anom: Series; ndvi: Series; lst: Series };
  trends: { anom: Trend | null; ndvi: Trend | null };
  periods: { anom: PeriodTest | null; ndvi: PeriodTest | null };
}

export interface Summary {
  generated_utc: string;
  city: { id: string; name: string; center: [number, number]; bbox: number[]; wrs: string };
  season: { months: [number, number]; label: string };
  periods: Record<string, { years: [number, number]; n_scenes: number }>;
  masks: {
    urban_px: number;
    rural_px: number;
    rural_alt_px: number;
    urban_radius_km: number;
    rural_ring_km: [number, number];
    rural_ring_alt_km: [number, number];
  };
  scenes: SceneRow[];
  city_series: {
    years: number[];
    n_scenes: number[];
    uhi: Series;
    uhi_alt: Series;
    uhi_l8_only: Series;
    urban_lst: Series;
    rural_lst: Series;
    urban_ndvi: Series;
    rural_ndvi: Series;
    urban_unc_k: Series;
  };
  city_trends: Record<string, Trend | null>;
  city_periods: Record<string, PeriodTest | null>;
  neighbourhoods: Neighbourhood[];
  scatter: Record<string, { points: [number, number, "u" | "r"][]; stats: { pearson_r: number; spearman_r: number; n_pixels: number } }>;
  histogram: Record<string, { bins: number[]; counts: number[]; median: number; p90: number }>;
}

export interface PointValue {
  lst: number | null;
  anom: number | null;
  ndvi: number | null;
  unc: number | null;
  count: number;
}

export interface PointResult {
  lon: number;
  lat: number;
  pixel: { row: number; col: number; center: [number, number] };
  values: Record<string, PointValue>;
  landcover?: number | null;
}
