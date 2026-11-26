import { beforeEach, describe, expect, it } from "vitest";
import { hideLayers, loadHidden, saveHidden } from "./layers";
import type { Layer, Profile } from "./types";

const layer = (id: string): Layer => ({ id, status: "fresh", rev: 1, as_of: 1, attribution: "", items: [] });
const prof = (ids: string[]): Profile => ({
  server_time: 1, rev: 1, location: { source: "gps", lat: 1, lon: 1 },
  layers: Object.fromEntries(ids.map((i) => [i, layer(i)])),
});

describe("layer toggles (HUD-08)", () => {
  beforeEach(() => localStorage.clear());

  it("hides every layer a group owns, and only those", () => {
    const p = prof(["transit_stops", "transit_departures", "uv_now", "uv_window", "weather", "sun"]);
    const out = hideLayers(p, new Set(["transit", "uv"]))!;
    expect(Object.keys(out.layers).sort()).toEqual(["sun", "weather"]);
    expect(Object.keys(p.layers)).toHaveLength(6); // the stored profile is untouched
    expect(hideLayers(p, new Set())).toBe(p);
    expect(hideLayers(null, new Set(["sun"]))).toBeNull();
  });

  it("persists across a relaunch and ignores junk", () => {
    saveHidden(new Set(["fire", "pollen"]));
    expect([...loadHidden()].sort()).toEqual(["fire", "pollen"]);
    localStorage.setItem("shinigami.hiddenLayers", '["fire","nope",3]');
    expect([...loadHidden()]).toEqual(["fire"]);
    localStorage.setItem("shinigami.hiddenLayers", "{broken");
    expect(loadHidden().size).toBe(0);
  });
});
