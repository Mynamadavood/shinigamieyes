import { describe, expect, it } from "vitest";
import {
  isTransitLayer,
  modeName,
  modeTitle,
  shortStopName,
  walkMinText,
  walkSecondsFor,
  TRANSIT_LAYERS,
} from "./transit";

describe("shortStopName", () => {
  it("follows the UI-SPEC rule", () => {
    expect(shortStopName("Flinders Street Station/Swanston St #13")).toBe("Flinders St");
    expect(shortStopName("Bourke Street Mall/Elizabeth St #3")).toBe("Bourke St Mall");
    expect(shortStopName("Clayton Railway Station")).toBe("Clayton");
    expect(shortStopName("Monash University")).toBe("Monash University");
    expect(shortStopName("Smith Road #12")).toBe("Smith Rd");
  });
  it("abbreviates whole words only", () => {
    expect(shortStopName("Streeton Rd")).toBe("Streeton Rd");
    expect(shortStopName("A Avenue")).toBe("A Ave");
    expect(shortStopName("Princes Highway")).toBe("Princes Hwy");
    expect(shortStopName("The Parade")).toBe("The Pde");
    expect(shortStopName("Main Drive")).toBe("Main Dr");
    expect(shortStopName("Grand Boulevard")).toBe("Grand Bvd");
  });
});

describe("walk helpers", () => {
  it("computes seconds and minutes", () => {
    expect(walkSecondsFor(409)).toBe(383);
    expect(walkMinText(383)).toBe("7 min");
    expect(walkMinText(10)).toBe("1 min");
  });
});

describe("mode helpers", () => {
  it("names modes and layers", () => {
    expect(modeTitle("tram")).toBe("TRAM STOP");
    expect(modeTitle("train")).toBe("TRAIN STATION");
    expect(modeName("bus")).toBe("Bus");
    expect(isTransitLayer("transit_stops")).toBe(true);
    expect(isTransitLayer("cameras_cctv")).toBe(false);
    expect(TRANSIT_LAYERS).toHaveLength(4);
  });
});
