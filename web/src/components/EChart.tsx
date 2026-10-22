"use client";
import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart, ScatterChart } from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  LineChart, ScatterChart, BarChart, GridComponent, TooltipComponent, LegendComponent,
  MarkLineComponent, MarkAreaComponent, DataZoomComponent, CanvasRenderer,
]);

export type EOption = echarts.EChartsCoreOption;

export const CHART = {
  text: "#8a939f",
  grid: "#1e242c",
  axis: "#2d3540",
  fg: "#e7e9ec",
  heat: "#f0a04b",
  veg: "#7cc68d",
  cool: "#5aa9e6",
  muted: "#5d6672",
  font: "var(--font-inter), system-ui, sans-serif",
};

/** Shared axis/tooltip styling so every chart reads as one system */
export function base(): EOption {
  return {
    animationDuration: 500,
    textStyle: { fontFamily: CHART.font, color: CHART.text, fontSize: 11 },
    grid: { left: 44, right: 14, top: 18, bottom: 26, containLabel: false },
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(18,21,26,0.96)",
      borderColor: CHART.axis,
      textStyle: { color: CHART.fg, fontSize: 11 },
      axisPointer: { lineStyle: { color: CHART.axis } },
    },
  };
}

export const axis = (extra: Record<string, unknown> = {}) => ({
  axisLine: { lineStyle: { color: CHART.axis } },
  axisTick: { show: false },
  axisLabel: { color: CHART.text, fontSize: 10 },
  splitLine: { lineStyle: { color: CHART.grid } },
  nameTextStyle: { color: CHART.text, fontSize: 10 },
  ...extra,
});

export default function EChart({ option, height = 180 }: { option: EOption; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const c = echarts.init(el.current, undefined, { renderer: "canvas" });
    chart.current = c;
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true });
  }, [option]);

  return <div ref={el} style={{ height }} className="w-full" />;
}
