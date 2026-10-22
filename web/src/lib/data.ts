"use client";
import { useEffect, useState } from "react";
import type { Manifest, Summary } from "./types";

export const CITY = "lahore";
export const dataUrl = (file: string) => `/data/${CITY}/${file}`;

const cache = new Map<string, Promise<unknown>>();

function load<T>(file: string): Promise<T> {
  if (!cache.has(file)) {
    cache.set(
      file,
      // Revalidate every load: the pipeline can rewrite these at any time
      fetch(dataUrl(file), { cache: "no-cache" }).then((r) => {
        if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
        return r.json();
      }),
    );
  }
  return cache.get(file) as Promise<T>;
}

function useJson<T>(file: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    load<T>(file)
      .then((d) => live && setData(d))
      .catch((e) => {
        cache.delete(file);
        if (live) setError(String(e.message ?? e));
      });
    return () => {
      live = false;
    };
  }, [file]);
  return { data, error };
}

export const useManifest = () => useJson<Manifest>("manifest.json");
export const useSummary = () => useJson<Summary>("summary.json");

export function overlayUrl(layer: string, key: string): string {
  return dataUrl(`overlays/${layer.startsWith("d_") ? layer : `${layer}_${key}`}.webp`);
}
