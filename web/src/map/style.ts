import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from "maplibre-gl";
import type { StyleTokens } from "./types";

// Protomaps v4 schema source layers (RESEARCH Pattern 3).
export const SOURCE_LAYERS = ["earth", "water", "landuse", "natural", "roads", "buildings"] as const;

export const DEFAULT_FONT = "JetBrainsMono-Regular";

const TOKEN_VARS: Record<keyof StyleTokens, string> = {
  bg: "--c-bg",
  land: "--c-land",
  water: "--c-water",
  park: "--c-park",
  roadMinor: "--c-road-minor",
  roadMajor: "--c-road-major",
  rail: "--c-rail",
  building: "--c-building",
  buildingHot: "--c-building-hot",
  mapLabel: "--c-map-label",
  frame: "--c-frame",
};

/** Colours come from the CSS custom properties only (no hex duplicated in TS). */
export function readStyleTokens(): StyleTokens {
  const cs = getComputedStyle(document.documentElement);
  const out = {} as StyleTokens;
  for (const k of Object.keys(TOKEN_VARS) as (keyof StyleTokens)[]) {
    out[k] = cs.getPropertyValue(TOKEN_VARS[k]).trim();
  }
  return out;
}

const kindIn = (...kinds: string[]): ExpressionSpecification => [
  "in",
  ["get", "kind"],
  ["literal", kinds],
];

export function buildStyle(
  tokens: StyleTokens,
  origin: string,
  build: string,
  font: string = DEFAULT_FONT,
): StyleSpecification {
  const major = kindIn("highway", "major_road");
  const layers: LayerSpecification[] = [
    // earth fill instead of a background layer: missing tiles leave the CSS grid visible
    {
      id: "earth",
      type: "fill",
      source: "protomaps",
      "source-layer": "earth",
      paint: { "fill-color": tokens.land },
    },
    {
      id: "landuse-park",
      type: "fill",
      source: "protomaps",
      "source-layer": "landuse",
      filter: kindIn("park", "wood", "grass", "forest", "nature_reserve"),
      paint: { "fill-color": tokens.park },
    },
    {
      id: "water",
      type: "fill",
      source: "protomaps",
      "source-layer": "water",
      paint: { "fill-color": tokens.water },
    },
    {
      id: "waterway",
      type: "line",
      source: "protomaps",
      "source-layer": "water",
      filter: ["==", ["geometry-type"], "LineString"],
      paint: { "line-color": tokens.water, "line-width": 1.5 },
    },
    {
      id: "roads-minor",
      type: "line",
      source: "protomaps",
      "source-layer": "roads",
      filter: ["!", kindIn("highway", "major_road", "path", "rail", "ferry")],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": tokens.roadMinor,
        "line-width": ["interpolate", ["linear"], ["zoom"], 15, 1, 18, 3],
      },
    },
    {
      id: "roads-major",
      type: "line",
      source: "protomaps",
      "source-layer": "roads",
      filter: major,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": tokens.roadMajor,
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, 1.5, 18, 6],
      },
    },
    {
      id: "roads-path",
      type: "line",
      source: "protomaps",
      "source-layer": "roads",
      minzoom: 16,
      filter: ["==", ["get", "kind"], "path"],
      paint: { "line-color": tokens.frame, "line-width": 1, "line-dasharray": [2, 2] },
    },
    {
      id: "rail",
      type: "line",
      source: "protomaps",
      "source-layer": "roads",
      filter: ["==", ["get", "kind"], "rail"],
      paint: { "line-color": tokens.rail, "line-width": 1 },
    },
    {
      id: "buildings-3d",
      type: "fill-extrusion",
      source: "protomaps",
      "source-layer": "buildings",
      minzoom: 15,
      filter: ["==", ["get", "kind"], "building"],
      paint: {
        "fill-extrusion-color": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          tokens.buildingHot,
          tokens.building,
        ],
        "fill-extrusion-height": ["coalesce", ["get", "height"], 8],
        "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
        "fill-extrusion-opacity": 1,
        "fill-extrusion-vertical-gradient": true,
      },
    },
    {
      id: "road-labels",
      type: "symbol",
      source: "protomaps",
      "source-layer": "roads",
      minzoom: 16,
      filter: ["has", "name"],
      layout: {
        "symbol-placement": "line",
        "text-field": ["get", "name"],
        "text-font": [font],
        "text-size": 11,
      },
      paint: {
        "text-color": tokens.mapLabel,
        "text-halo-color": "black",
        "text-halo-width": 1,
      },
    },
  ];

  return {
    version: 8,
    projection: { type: "mercator" },
    glyphs: `${origin}/glyphs/{fontstack}/{range}.pbf`,
    sources: {
      protomaps: {
        type: "vector",
        tiles: [`${origin}/tiles/{z}/{x}/{y}.mvt?v=${encodeURIComponent(build)}`],
        minzoom: 0,
        maxzoom: 15,
        attribution: "© OpenStreetMap contributors, Protomaps",
      },
    },
    layers,
  };
}
