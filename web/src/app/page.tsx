"use client";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import TopBar from "@/components/TopBar";
import { useManifest, useSummary } from "@/lib/data";
import { useApp } from "@/lib/store";

// The map and analysis panels are client-only and loaded lazily
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });
const Sidebar = dynamic(() => import("@/components/Sidebar"), { ssr: false });
const Timeline = dynamic(() => import("@/components/Timeline"), { ssr: false });
const InspectPanel = dynamic(() => import("@/components/InspectPanel"), { ssr: false });
const AnalysisView = dynamic(() => import("@/components/AnalysisView"), { ssr: false });
const MethodView = dynamic(() => import("@/components/MethodView"), { ssr: false });

export default function Home() {
  const { data: manifest, error } = useManifest();
  const { data: summary } = useSummary();
  const view = useApp((x) => x.view);
  const set = useApp((x) => x.set);

  // Narrow screens start with panels collapsed so the map is usable
  useEffect(() => {
    if (window.innerWidth < 900) set({ leftOpen: false, rightOpen: false });
  }, [set]);

  return (
    <div className="h-dvh flex flex-col">
      <TopBar manifest={manifest} />
      <main className="relative flex-1 min-h-0">
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-md glass rounded-lg p-5 text-[13px] text-muted leading-relaxed">
              <div className="text-fg font-medium mb-1">No processed data found</div>
              Run the pipeline first: <code className="font-mono text-fg">python pipeline/build.py --city lahore</code>.
              It writes the overlays and statistics this app reads. ({error})
            </div>
          </div>
        )}
        {manifest && (
          <div className={view === "map" ? "absolute inset-0" : "absolute inset-0 invisible"}>
            <MapView manifest={manifest} />
            <Sidebar manifest={manifest} />
            <Timeline manifest={manifest} />
            <InspectPanel manifest={manifest} summary={summary} />
          </div>
        )}
        {view === "analysis" && (
          <div className="absolute inset-0 z-40 bg-ink">
            <AnalysisView summary={summary} />
          </div>
        )}
        {view === "method" && (
          <div className="absolute inset-0 z-40 bg-ink">
            <MethodView summary={summary} />
          </div>
        )}
      </main>
    </div>
  );
}
