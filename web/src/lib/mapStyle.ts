import type { StyleSpecification } from "maplibre-gl";

/**
 * One style holding every basemap; switching basemaps only toggles
 * visibility, so data layers never have to be re-added.
 *
 * Satellite: EOX Sentinel-2 cloudless 2024 (CC BY-NC-SA 4.0).
 * Streets/labels: OpenFreeMap vector tiles (OpenStreetMap data, ODbL).
 * Landsat: our own period true-colour composites (added at runtime).
 */
export const LABEL_ANCHOR = "anchor-labels";

const ofm = "openfreemap";
const font = ["Noto Sans Regular"];
const fontBold = ["Noto Sans Bold"];

export function buildStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      eox: {
        type: "raster",
        tiles: ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg"],
        tileSize: 256,
        maxzoom: 15,
        attribution:
          '<a href="https://s2maps.eu" target="_blank">Sentinel-2 cloudless 2024</a> by EOX (Copernicus Sentinel data 2024)',
      },
      [ofm]: {
        type: "vector",
        url: "https://tiles.openfreemap.org/planet",
        attribution:
          '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
      },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#0d1014" } },
      // --- satellite
      {
        id: "sat",
        type: "raster",
        source: "eox",
        paint: { "raster-saturation": -0.25, "raster-brightness-max": 0.88, "raster-contrast": 0.05 },
      },
      // --- streets (dark, quiet)
      { id: "st-landuse", type: "fill", source: ofm, "source-layer": "landuse", layout: { visibility: "none" },
        paint: { "fill-color": "#13171c" } },
      { id: "st-park", type: "fill", source: ofm, "source-layer": "park", layout: { visibility: "none" },
        paint: { "fill-color": "#142019" } },
      { id: "st-water", type: "fill", source: ofm, "source-layer": "water", layout: { visibility: "none" },
        paint: { "fill-color": "#0f1d2a" } },
      { id: "st-building", type: "fill", source: ofm, "source-layer": "building", minzoom: 13,
        layout: { visibility: "none" }, paint: { "fill-color": "#1b2027", "fill-outline-color": "#232a33" } },
      {
        id: "st-roads", type: "line", source: ofm, "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary", "secondary", "tertiary", "minor"]]],
        layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["match", ["get", "class"], ["motorway", "trunk"], "#3a4350", "primary", "#323a45", "#262d36"],
          "line-width": ["interpolate", ["exponential", 1.5], ["zoom"], 9, 0.4, 16, ["match", ["get", "class"], ["motorway", "trunk", "primary"], 6, 3]],
        },
      },
      // Data layers are inserted before this anchor
      { id: LABEL_ANCHOR, type: "background", layout: { visibility: "none" }, paint: { "background-opacity": 0 } },
      // --- labels (all basemaps)
      {
        id: "lbl-roads", type: "symbol", source: ofm, "source-layer": "transportation_name", minzoom: 13,
        filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary", "secondary"]]],
        layout: { "symbol-placement": "line", "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
          "text-font": font, "text-size": 10.5 },
        paint: { "text-color": "#c9ced6", "text-halo-color": "#0a0c0f", "text-halo-width": 1.4 },
      },
      {
        id: "lbl-places", type: "symbol", source: ofm, "source-layer": "place",
        filter: ["in", ["get", "class"], ["literal", ["suburb", "neighbourhood", "quarter", "town", "village"]]],
        minzoom: 10.5,
        layout: {
          "text-field": ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]],
          "text-font": font,
          "text-size": ["interpolate", ["linear"], ["zoom"], 11, 10.5, 15, 13],
          "text-letter-spacing": 0.02,
          "text-max-width": 8,
        },
        paint: { "text-color": "#e9ecef", "text-halo-color": "rgba(8,10,13,0.85)", "text-halo-width": 1.5 },
      },
      {
        id: "lbl-city", type: "symbol", source: ofm, "source-layer": "place",
        filter: ["==", ["get", "class"], "city"], maxzoom: 12,
        layout: {
          "text-field": ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]],
          "text-font": fontBold, "text-size": ["interpolate", ["linear"], ["zoom"], 6, 12, 11, 17],
          "text-letter-spacing": 0.08, "text-transform": "uppercase",
        },
        paint: { "text-color": "#f3f4f6", "text-halo-color": "rgba(8,10,13,0.9)", "text-halo-width": 1.6 },
      },
    ],
  };
}

export const STREET_LAYERS = ["st-landuse", "st-park", "st-water", "st-building", "st-roads"];
