import { describe, expect, it } from "vitest";
import { SOURCE_LAYERS, buildStyle, readStyleTokens } from "./style";
import type { StyleTokens } from "./types";

const T: StyleTokens = {
  bg: "#000", land: "#111", water: "#222", park: "#333", roadMinor: "#444",
  roadMajor: "#555", rail: "#666", building: "#777", buildingHot: "#888",
  mapLabel: "#999", frame: "#aaa",
};
const ORIGIN = "https://x.ts.net";
const style = buildStyle(T, ORIGIN, "123", "JetBrainsMono-Regular");
const layer = (id: string) => style.layers.find((l) => l.id === id) as Record<string, any>;

describe("buildStyle", () => {
  it("has one same-origin vector source and no sprite", () => {
    expect(style.version).toBe(8);
    expect(Object.keys(style.sources)).toEqual(["protomaps"]);
    const src = style.sources.protomaps as Record<string, any>;
    expect(src.type).toBe("vector");
    expect(src.tiles).toEqual(["https://x.ts.net/tiles/{z}/{x}/{y}.mvt?v=123"]);
    expect(src.maxzoom).toBe(15);
    expect(src.attribution).toContain("OpenStreetMap");
    expect(style.glyphs).toBe("https://x.ts.net/glyphs/{fontstack}/{range}.pbf");
    expect("sprite" in style).toBe(false);
    expect(style.projection).toEqual({ type: "mercator" });
  });

  it("uses no background layer and only schema source layers", () => {
    for (const l of style.layers) {
      expect(l.type).not.toBe("background");
      expect(SOURCE_LAYERS).toContain((l as Record<string, any>)["source-layer"]);
    }
  });

  it("extrudes buildings from zoom 15 with feature-state highlight", () => {
    const b = layer("buildings-3d");
    expect(b.type).toBe("fill-extrusion");
    expect(b.minzoom).toBe(15);
    expect(b.filter).toEqual(["==", ["get", "kind"], "building"]);
    const color = JSON.stringify(b.paint["fill-extrusion-color"]);
    expect(color).toContain("selected");
    expect(color).toContain(T.buildingHot);
    expect(color).toContain(T.building);
    expect(b.paint["fill-extrusion-height"]).toEqual(["coalesce", ["get", "height"], 8]);
    expect(b.paint["fill-extrusion-base"]).toEqual(["coalesce", ["get", "min_height"], 0]);
    expect(b.paint["fill-extrusion-opacity"]).toBe(1);
    expect(b.paint["fill-extrusion-vertical-gradient"]).toBe(true);
  });

  it("labels roads from zoom 16 with the self-hosted font", () => {
    const l = layer("road-labels");
    expect(l.type).toBe("symbol");
    expect(l.minzoom).toBe(16);
    expect(l.layout["symbol-placement"]).toBe("line");
    expect(l.layout["text-font"]).toEqual(["JetBrainsMono-Regular"]);
    expect(l.paint["text-color"]).toBe(T.mapLabel);
    expect(l.paint["text-halo-color"]).toBe("black");
    expect(l.paint["text-halo-width"]).toBe(1);
  });

  it("never references render_height and keeps every URL on the origin", () => {
    const json = JSON.stringify(style);
    expect(json).not.toContain("render_height");
    for (const m of json.matchAll(/http/g)) {
      expect(json.slice(m.index, m.index! + ORIGIN.length)).toBe(ORIGIN);
    }
  });

  it("encodes the build id", () => {
    const s = buildStyle(T, ORIGIN, "a&b", "F");
    expect(JSON.stringify(s)).toContain("v=a%26b");
  });
});

describe("readStyleTokens", () => {
  it("reads the CSS custom properties", () => {
    document.documentElement.style.setProperty("--c-land", " #05070D ");
    expect(readStyleTokens().land).toBe("#05070D");
  });
});
