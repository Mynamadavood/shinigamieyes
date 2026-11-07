import { describe, expect, it, vi } from "vitest";
import { BuildingSelector, buildingCardContent, buildingHeight } from "./buildings";

function fakeMap() {
  const sources: Record<string, { setData: ReturnType<typeof vi.fn> }> = {};
  const layers: Record<string, unknown> = {};
  return {
    sources,
    layers,
    setFeatureState: vi.fn(),
    removeFeatureState: vi.fn(),
    getSource: (id: string) => sources[id],
    addSource: vi.fn((id: string) => {
      sources[id] = { setData: vi.fn() };
    }),
    getLayer: (id: string) => layers[id],
    addLayer: vi.fn((spec: { id: string }) => {
      layers[spec.id] = spec;
    }),
  };
}

describe("BuildingSelector", () => {
  it("uses feature-state for ids and clears the previous one", () => {
    const m = fakeMap();
    const s = new BuildingSelector(m);
    s.select({ id: 7 });
    expect(m.setFeatureState).toHaveBeenCalledWith({ source: "protomaps", sourceLayer: "buildings", id: 7 }, { selected: true });
    s.select({ id: 8 });
    expect(m.removeFeatureState).toHaveBeenCalledWith({ source: "protomaps", sourceLayer: "buildings", id: 7 }, "selected");
    expect(s.usesFallback()).toBe(false);
    s.clear();
    expect(m.removeFeatureState).toHaveBeenCalledWith({ source: "protomaps", sourceLayer: "buildings", id: 8 }, "selected");
  });
  it("falls back to the GeoJSON overlay without an id", () => {
    const m = fakeMap();
    const s = new BuildingSelector(m);
    const geometry = { type: "Polygon", coordinates: [] };
    s.select({ properties: { height: 10 }, geometry });
    expect(m.setFeatureState).not.toHaveBeenCalled();
    expect(s.usesFallback()).toBe(true);
    expect(m.addSource).toHaveBeenCalledWith("building-hot", expect.anything());
    expect(m.layers["buildings-hot"]).toBeDefined();
    expect(m.sources["building-hot"].setData).toHaveBeenLastCalledWith(
      expect.objectContaining({ features: [expect.objectContaining({ geometry })] }),
    );
    s.clear();
    expect(m.sources["building-hot"].setData).toHaveBeenLastCalledWith({ type: "FeatureCollection", features: [] });
  });
});

describe("buildingCardContent", () => {
  it("shows the rounded height", () => {
    const c = buildingCardContent(24.4);
    expect(c.title).toBe("BUILDING");
    expect(c.primary).toBe("Height: 24 m");
    expect(c.caveats).toContain("Source: OpenStreetMap");
  });
  it("shows no height data", () => {
    const c = buildingCardContent(null);
    expect(c.primary).toBeUndefined();
    expect(c.caveats).toContain("No height data");
  });
  it("buildingHeight rejects junk", () => {
    expect(buildingHeight({ height: "x" })).toBeNull();
    expect(buildingHeight({ height: 12 })).toBe(12);
    expect(buildingHeight(null)).toBeNull();
  });
});
