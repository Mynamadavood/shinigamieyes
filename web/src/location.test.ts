import "fake-indexeddb/auto";
import { clear, get } from "idb-keyval";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLocation, loadPlaces, toParams } from "./location";
import type { LocationState } from "./location";

type Ok = (p: GeolocationPosition) => void;
type Err = (e: GeolocationPositionError) => void;

function fakeGeo() {
  const calls: { ok: Ok; err: Err; opts: PositionOptions }[] = [];
  const geo = {
    getCurrentPosition: vi.fn((ok: Ok, err: Err, opts: PositionOptions) => {
      calls.push({ ok, err, opts });
    }),
    watchPosition: vi.fn(),
  } as unknown as Geolocation;
  const pos = (lat: number, lon: number) =>
    ({ coords: { latitude: lat, longitude: lon } }) as GeolocationPosition;
  return { geo, calls, pos };
}

function setup() {
  const g = fakeGeo();
  const onChange = vi.fn();
  const onGpsOff = vi.fn();
  const loc = createLocation({ geolocation: g.geo, onChange, onGpsOff, now: () => 1000 });
  return { ...g, onChange, onGpsOff, loc };
}

function setHidden(h: boolean) {
  Object.defineProperty(document, "hidden", { value: h, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

const A = [-37.8136, 144.9631] as const;
// about 50 m and 150 m north of A (1e-5 deg lat is about 1.11 m)
const NEAR = [A[0] + 0.00045, A[1]] as const;
const FAR = [A[0] + 0.00135, A[1]] as const;

const settle = () => new Promise((r) => setTimeout(r, 10));

beforeEach(async () => {
  await clear();
  setHidden(false);
});

describe("createLocation", () => {
  it("asks once with battery-friendly options and never watches", async () => {
    const t = setup();
    await t.loc.start();
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0]!.opts).toEqual({
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 60000,
    });
    expect(t.geo.watchPosition).not.toHaveBeenCalled();
    expect(t.loc.state().gps).toBe("locating");
  });

  it("accepts the first fix and persists it", async () => {
    const t = setup();
    await t.loc.start();
    t.calls[0]!.ok(t.pos(...A));
    expect(t.loc.state().gps).toBe("live");
    expect(t.onChange).toHaveBeenCalledTimes(1);
    const p = t.onChange.mock.calls[0]![0] as URLSearchParams;
    expect(p.get("lat")).toBe("-37.81360");
    expect(p.get("lon")).toBe("144.96310");
    await settle();
    const saved = (await get("location:state")) as LocationState;
    expect(saved.lastAccepted).toEqual({ lat: A[0], lon: A[1], ts: 1000 });
  });

  it("applies 100 m hysteresis", async () => {
    const t = setup();
    await t.loc.start();
    t.calls[0]!.ok(t.pos(...A));
    t.onChange.mockClear();
    t.loc.requestFix();
    t.calls[1]!.ok(t.pos(...NEAR));
    expect(t.onChange).not.toHaveBeenCalled();
    t.loc.requestFix();
    t.calls[2]!.ok(t.pos(...FAR));
    expect(t.onChange).toHaveBeenCalledTimes(1);
  });

  it("re-fixes on becoming visible, not while hidden, not in pin mode", async () => {
    const t = setup();
    await t.loc.start();
    t.calls[0]!.ok(t.pos(...A));
    setHidden(true);
    expect(t.calls).toHaveLength(1);
    setHidden(false);
    expect(t.calls).toHaveLength(2);
    t.calls[1]!.ok(t.pos(...A));
    t.loc.usePlace({ id: "monash", label: "Monash Clayton" });
    setHidden(true);
    setHidden(false);
    expect(t.calls).toHaveLength(2);
  });

  it.each([
    ["denied", 1],
    ["unavailable", 2],
    ["timeout", 3],
  ])("GPS %s turns gps off and warns only once", async (_n, code) => {
    const t = setup();
    await t.loc.start();
    t.calls[0]!.err({ code } as GeolocationPositionError);
    expect(t.loc.state().gps).toBe("off");
    expect(t.onGpsOff).toHaveBeenCalledTimes(1);
    t.loc.requestFix();
    t.calls[1]!.err({ code } as GeolocationPositionError);
    expect(t.onGpsOff).toHaveBeenCalledTimes(1);
  });

  it("pin mode persists and stops geolocation; useGps returns to gps", async () => {
    const t = setup();
    await t.loc.start();
    t.loc.usePlace({ id: "monash", label: "Monash Clayton" });
    expect(t.loc.state().mode).toBe("pin");
    expect((t.onChange.mock.calls.at(-1)![0] as URLSearchParams).get("place")).toBe("monash");
    await settle();
    expect(((await get("location:state")) as LocationState).mode).toBe("pin");
    t.loc.requestFix();
    expect(t.calls).toHaveLength(1);
    t.loc.useGps();
    expect(t.loc.state().mode).toBe("gps");
    expect(t.calls).toHaveLength(2);
  });

  it("restores pin mode on start without asking geolocation", async () => {
    const a = setup();
    await a.loc.start();
    a.loc.usePlace({ id: "cbd", label: "Melbourne CBD" });
    await settle();
    const b = setup();
    await b.loc.start();
    expect(b.loc.state().pin?.id).toBe("cbd");
    expect(b.calls).toHaveLength(0);
    expect((b.onChange.mock.calls[0]![0] as URLSearchParams).get("place")).toBe("cbd");
  });
});

describe("toParams", () => {
  it("builds params per mode", () => {
    expect(toParams({ mode: "gps", gps: "locating" })).toBeNull();
    const g = toParams({
      mode: "gps",
      gps: "live",
      lastAccepted: { lat: 1.234567, lon: 2, ts: 0 },
    });
    expect(g!.toString()).toBe("lat=1.23457&lon=2.00000");
    expect(toParams({ mode: "pin", gps: "off", pin: { id: "gym", label: "G" } })!.toString()).toBe(
      "place=gym",
    );
    const s = toParams({
      mode: "search",
      gps: "off",
      search: { lat: -37.8, lon: 144.99, label: "Smith St" },
    })!;
    expect(s.get("src")).toBe("search");
    expect(s.get("label")).toBe("Smith St");
  });
});

describe("loadPlaces", () => {
  const list = [{ id: "cbd", label: "Melbourne CBD" }];
  it("caches on success and falls back to cache on failure", async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify(list), { status: 200 }));
    expect(await loadPlaces(ok as unknown as typeof fetch)).toEqual(list);
    const bad = vi.fn(async () => {
      throw new TypeError("offline");
    });
    expect(await loadPlaces(bad as unknown as typeof fetch)).toEqual(list);
  });
});
