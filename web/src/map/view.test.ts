import { describe, expect, it } from "vitest";
import type { LocationState } from "../location";
import type { Profile } from "../types";
import { CBD_DEFAULT, FOLLOW, PIN_AREA_ZOOM, mapViewFor } from "./view";

describe("mapViewFor", () => {
  it("gps with a fix", () => {
    const s: LocationState = {
      mode: "gps", gps: "live", lastFix: { lat: -37.8, lon: 144.9, ts: 1, accuracy: 20 },
    };
    expect(mapViewFor(s, null)).toEqual({ kind: "gps", lat: -37.8, lon: 144.9, accuracy: 20 });
  });
  it("gps without a fix", () => {
    expect(mapViewFor({ mode: "gps", gps: "locating" }, null)).toEqual({ kind: "none" });
  });
  it("search", () => {
    const s: LocationState = { mode: "search", gps: "off", search: { lat: 1, lon: 2, label: "X" } };
    expect(mapViewFor(s, null)).toEqual({ kind: "search", lat: 1, lon: 2, label: "X" });
  });
  it("pin without a cell is none", () => {
    expect(mapViewFor({ mode: "pin", gps: "off", pin: { id: "a", label: "A" } }, null)).toEqual({
      kind: "none",
    });
  });
  it("pin with a cell uses the cell centre", () => {
    const p = { location: { cell_lat: -37.8, cell_lon: 144.9 } } as unknown as Profile;
    expect(mapViewFor({ mode: "pin", gps: "off", pin: { id: "a", label: "A" } }, p)).toEqual({
      kind: "pin", lat: -37.8, lon: 144.9, label: "A",
    });
  });
  it("exports camera constants", () => {
    expect(PIN_AREA_ZOOM).toBe(12);
    expect(CBD_DEFAULT.zoom).toBe(14);
    expect(FOLLOW).toEqual({ zoom: 17, pitch: 60, bearing: 0 });
  });
});
