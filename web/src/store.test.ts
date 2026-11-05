import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { loadLastSync, loadProfile, saveLastSync, saveProfile } from "./store";
import type { Profile } from "./types";

const P: Profile = {
  server_time: 1,
  rev: 2,
  location: { source: "default", lat: -37.8, lon: 144.9, label: "x" },
  layers: {},
};

describe("store", () => {
  it("returns null on an empty db", async () => {
    expect(await loadProfile()).toBeNull();
    expect(await loadLastSync()).toBeNull();
  });
  it("round-trips the profile", async () => {
    await saveProfile(P);
    expect(await loadProfile()).toEqual(P);
  });
  it("round-trips last sync", async () => {
    await saveLastSync(12345);
    expect(await loadLastSync()).toBe(12345);
  });
});
