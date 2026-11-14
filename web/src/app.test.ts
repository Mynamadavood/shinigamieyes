import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Layer, Profile } from "./types";

vi.mock("./store", () => ({
  loadProfile: vi.fn(() => new Promise(() => {})),
  loadCachedProfile: vi.fn(() => new Promise(() => {})),
  loadLastSync: vi.fn(() => new Promise(() => {})),
  saveProfile: vi.fn(async () => {}),
  saveLastSync: vi.fn(async () => {}),
}));
vi.mock("idb-keyval", () => ({
  get: vi.fn(() => new Promise(() => {})),
  set: vi.fn(async () => {}),
}));

import { get as idbGet } from "idb-keyval";
import { loadCachedProfile, saveProfile } from "./store";
import { IDB_TIMEOUT_MS, boot, deriveListState, resetHeroPlayed, stripExactLayers } from "./app";

type SunItem = ReturnType<typeof sunItem>;
const sunItem = (id: string, ts: number) => ({
  id, layer: "sun", group: "sky", name: id, verb: "ends", target_ts: ts, kind: "environment",
  severity: 0, detail: null, geom: null, fetched_at: 1, stale_after_s: null, computed: true,
});
const layer = (id: string, rev: number, items: SunItem[] = []): Layer =>
  ({ id, status: "fresh", rev, as_of: 1, attribution: "", items }) as unknown as Layer;
const profile = (items: SunItem[]): Profile => ({
  server_time: Date.now(), rev: 1,
  location: { source: "default", lat: null, lon: null },
  layers: { sun: layer("sun", 1, items) },
});

class FakeES {
  static all: FakeES[] = [];
  handlers: Record<string, ((e: MessageEvent) => void)[]> = {};
  constructor(public url: string) { FakeES.all.push(this); }
  addEventListener(t: string, f: (e: MessageEvent) => void) { (this.handlers[t] ??= []).push(f); }
  close() {}
  emit(t: string, data: unknown) {
    for (const f of this.handlers[t] ?? []) f({ data: JSON.stringify(data) } as MessageEvent);
  }
}
const ES = FakeES as unknown as new (u: string) => EventSource;
const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const isProfile = (u: unknown) => String(u).startsWith("/api/profile");

let root: HTMLElement;
beforeEach(() => {
  vi.useFakeTimers();
  FakeES.all = [];
  resetHeroPlayed();
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById("app")!;
});
afterEach(() => {
  vi.useRealTimers();
});

const banner = () => root.querySelector(".banner-slot")!.firstElementChild as HTMLElement;
const geolocation = { getCurrentPosition: vi.fn() } as unknown as Geolocation;

async function bootApp(fetchImpl: typeof fetch) {
  const p = boot(root, { fetchImpl, EventSourceImpl: ES, geolocation, hero: false });
  await vi.advanceTimersByTimeAsync(IDB_TIMEOUT_MS + 100);
  return p;
}

describe("boot with hung IndexedDB (WR-06)", () => {
  it("starts the first /api/profile request within ~300 ms", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (u: string) => {
      urls.push(u);
      return isProfile(u) ? json(profile([])) : json([]);
    }) as unknown as typeof fetch;
    void boot(root, { fetchImpl, EventSourceImpl: ES, geolocation });
    await vi.advanceTimersByTimeAsync(IDB_TIMEOUT_MS + 100);
    expect(urls.some((u) => u.startsWith("/api/profile"))).toBe(true);
  });
});

describe("stream key guard (WR-04) and HTTP errors (WR-03)", () => {
  it("does not merge a layer into a profile fetched for another location", async () => {
    const t0 = Date.now();
    let resolveB: (v: unknown) => void = () => {};
    let n = 0;
    const fetchImpl = vi.fn((u: string) => {
      if (!isProfile(u)) return Promise.resolve(json([]));
      n++;
      if (n === 1) return Promise.resolve(json(profile([sunItem("a-row", t0 + 600_000)])));
      return new Promise((r) => {
        resolveB = r;
      });
    }) as unknown as typeof fetch;
    const app = await bootApp(fetchImpl);
    await vi.advanceTimersByTimeAsync(50);
    expect(root.textContent).toContain("a-row");
    app.setLocationParams(new URLSearchParams({ lat: "1", lon: "2" }));
    await vi.advanceTimersByTimeAsync(10);
    const before = vi.mocked(fetchImpl).mock.calls.filter((c) => isProfile(c[0])).length;
    FakeES.all.at(-1)!.emit("layer", layer("sun", 5, [sunItem("b-row", t0 + 700_000)]));
    await vi.advanceTimersByTimeAsync(10);
    expect(root.textContent).not.toContain("b-row");
    expect(root.textContent).toContain("a-row");
    resolveB(json(profile([sunItem("c-row", t0 + 800_000)])));
    await vi.advanceTimersByTimeAsync(50);
    expect(vi.mocked(fetchImpl).mock.calls.filter((c) => isProfile(c[0])).length).toBeGreaterThan(before);
  });

  it("a network error from a superseded request does not mark OFF-GRID (WR-W7)", async () => {
    let n = 0;
    let rejectStale: (e: unknown) => void = () => {};
    const fetchImpl = vi.fn((u: string) => {
      if (!isProfile(u)) return Promise.resolve(json([]));
      n++;
      if (n === 1) return Promise.resolve(json(profile([])));
      if (n === 2) return new Promise((_r, rej) => { rejectStale = rej; });
      return new Promise(() => {}); // the current request is still in flight
    }) as unknown as typeof fetch;
    const app = await bootApp(fetchImpl);
    await vi.advanceTimersByTimeAsync(50);
    app.setLocationParams(new URLSearchParams({ place: "a" }));
    await vi.advanceTimersByTimeAsync(10);
    app.setLocationParams(new URLSearchParams({ place: "b" }));
    rejectStale(new TypeError("network"));
    await vi.advanceTimersByTimeAsync(10);
    expect(banner().hidden).toBe(true);
    expect(n).toBe(3);
  });

  it("a 500 does not show OFF-GRID but a network error does", async () => {
    let mode: "500" | "net" = "500";
    const fetchImpl = vi.fn(async (u: string) => {
      if (!isProfile(u)) return json([]);
      if (mode === "500") return { ok: false, status: 500 };
      throw new TypeError("network");
    }) as unknown as typeof fetch;
    const app = await bootApp(fetchImpl);
    await vi.advanceTimersByTimeAsync(50);
    expect(banner().hidden).toBe(true);
    mode = "net";
    app.setLocationParams(new URLSearchParams({ lat: "1", lon: "2" }));
    await vi.advanceTimersByTimeAsync(50);
    expect(banner().hidden).toBe(false);
  });
});

describe("lazy map wiring (02-08)", () => {
  it("fetches before the loader runs and wires Dropped pin to useSearch", async () => {
    const order: string[] = [];
    const fetchImpl = vi.fn(async (u: string) => {
      order.push(`fetch:${u.split("?")[0]}`);
      return isProfile(u) ? json(profile([])) : json([]);
    }) as unknown as typeof fetch;
    let captured: any = null;
    const setView = vi.fn();
    const mapLoader = vi.fn(async () => {
      order.push("loader");
      return {
        createMap: async (d: unknown) => {
          captured = d;
          return { setView, setProfile: vi.fn(), resize: vi.fn(), destroy: vi.fn() };
        },
      };
    });
    const p = boot(root, { fetchImpl, EventSourceImpl: ES, geolocation, mapLoader, hero: false });
    await vi.advanceTimersByTimeAsync(IDB_TIMEOUT_MS + 100);
    await p;
    await vi.advanceTimersByTimeAsync(100);
    expect(order.indexOf("fetch:/api/profile")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("fetch:/api/profile")).toBeLessThan(order.indexOf("loader"));
    expect(captured.host).toBe(root.querySelector(".map-host"));
    captured.onLongPress({ lat: -37.8, lon: 144.9 });
    await vi.advanceTimersByTimeAsync(50);
    expect(root.querySelector(".location-strip")!.textContent).toContain("Dropped pin");
  });

  it("a rejecting loader is swallowed", async () => {
    const fetchImpl = vi.fn(async (u: string) =>
      isProfile(u) ? json(profile([])) : json([]),
    ) as unknown as typeof fetch;
    const mapLoader = vi.fn(async () => {
      throw new Error("chunk failed");
    });
    const p = boot(root, { fetchImpl, EventSourceImpl: ES, geolocation, mapLoader, hero: false });
    await vi.advanceTimersByTimeAsync(IDB_TIMEOUT_MS + 100);
    await expect(p).resolves.toBeDefined();
    await vi.advanceTimersByTimeAsync(100);
    expect(mapLoader).toHaveBeenCalled();
  });
});

describe("departure row tap (D-06)", () => {
  const tItem = (layerId: string, id: string, extra: Record<string, unknown>, ts: number | null, geom: unknown = null): any => ({
    id, layer: layerId, group: "g1", name: "Tram 96 to St Kilda", verb: "arrives", target_ts: ts, kind: "scheduled",
    severity: 0, detail: extra, geom, fetched_at: 1, stale_after_s: null, computed: false,
  });
  const transitProfile = (): Profile => {
    const ts = Math.floor(Date.now() / 1000) + 900;
    const mk = (id: string, items: any[]): Layer => ({ id, status: "fresh", rev: 1, as_of: 1, attribution: "", items }) as unknown as Layer;
    return {
      server_time: Math.floor(Date.now() / 1000), rev: 1, location: { source: "default", lat: null, lon: null },
      layers: {
        transit_stops: mk("transit_stops", [tItem("transit_stops", "stop:2720", { mode: "tram", distance_m: 50 }, null, { type: "Point", coordinates: [144.9, -37.8] })]),
        transit_departures: mk("transit_departures", [tItem("transit_departures", "dep:1", { mode: "tram", stop_id: 2720, live: true, walk_s: 60 }, ts)]),
      },
    } as unknown as Profile;
  };
  const fetchFor = () => vi.fn(async (u: string) => (isProfile(u) ? json(transitProfile()) : json([]))) as unknown as typeof fetch;

  it("collapses the drawer and focuses the stop on the map", async () => {
    const focusStop = vi.fn(() => true);
    const mapLoader = vi.fn(async () => ({
      createMap: async () => ({ setView: vi.fn(), setProfile: vi.fn(), resize: vi.fn(), destroy: vi.fn(), focusStop }),
    }));
    const { Drawer } = await import("./ui/drawer");
    const collapse = vi.spyOn(Drawer.prototype, "collapse");
    const p = boot(root, { fetchImpl: fetchFor(), EventSourceImpl: ES, geolocation, mapLoader, hero: false });
    await vi.advanceTimersByTimeAsync(IDB_TIMEOUT_MS + 100);
    await p;
    await vi.advanceTimersByTimeAsync(200);
    const row = root.querySelector<HTMLElement>('[role="button"].transit');
    expect(row).not.toBeNull();
    row!.click();
    expect(collapse).toHaveBeenCalledTimes(1);
    expect(focusStop).toHaveBeenCalledWith(2720);
    collapse.mockRestore();
  });

  it("a tap before the map handle exists collapses and does not throw", async () => {
    const mapLoader = vi.fn(() => new Promise<never>(() => {}));
    const { Drawer } = await import("./ui/drawer");
    const collapse = vi.spyOn(Drawer.prototype, "collapse");
    const p = boot(root, { fetchImpl: fetchFor(), EventSourceImpl: ES, geolocation, mapLoader, hero: false });
    await vi.advanceTimersByTimeAsync(IDB_TIMEOUT_MS + 100);
    await p;
    await vi.advanceTimersByTimeAsync(200);
    const row = root.querySelector<HTMLElement>('[role="button"].transit');
    expect(row).not.toBeNull();
    expect(() => row!.click()).not.toThrow();
    expect(collapse).toHaveBeenCalledTimes(1);
    collapse.mockRestore();
  });

  it("non-departure rows never call focusStop", async () => {
    const focusStop = vi.fn(() => true);
    const mapLoader = vi.fn(async () => ({
      createMap: async () => ({ setView: vi.fn(), setProfile: vi.fn(), resize: vi.fn(), destroy: vi.fn(), focusStop }),
    }));
    const t0 = Date.now();
    const fetchImpl = vi.fn(async (u: string) => (isProfile(u) ? json(profile([sunItem("sun-row", t0 + 600_000)])) : json([]))) as unknown as typeof fetch;
    const p = boot(root, { fetchImpl, EventSourceImpl: ES, geolocation, mapLoader, hero: false });
    await vi.advanceTimersByTimeAsync(IDB_TIMEOUT_MS + 100);
    await p;
    await vi.advanceTimersByTimeAsync(200);
    for (const r of Array.from(root.querySelectorAll<HTMLElement>(".row"))) r.click();
    expect(focusStop).not.toHaveBeenCalled();
  });
});

describe("deriveListState (WR-07)", () => {
  it.each([
    [0, false, "offgrid", "no-data-offline"],
    [0, false, "online", "loading"],
    [0, false, "unknown", "loading"],
    [0, true, "offgrid", "empty"],
    [0, true, "online", "empty"],
    [3, true, "online", "ready"],
  ] as const)("(%i,%s,%s) -> %s", (n, has, conn, want) => {
    expect(deriveListState(n, has, conn)).toBe(want);
  });
});

describe("cold-open hero (HUD-03)", () => {
  const okFetch = () =>
    vi.fn(async (u: string) => (isProfile(u) ? json(profile([])) : json([]))) as unknown as typeof fetch;

  it("is in the DOM synchronously after mountShell, before the IndexedDB read resolves", async () => {
    const fetchImpl = okFetch();
    void boot(root, { fetchImpl, EventSourceImpl: ES, geolocation });
    // no timers advanced: the IDB read is still pending (mock never resolves)
    expect(root.querySelector(".hero")).not.toBeNull();
    expect(root.querySelector(".title-text")!.textContent).toBe("EYES");
    await vi.advanceTimersByTimeAsync(IDB_TIMEOUT_MS + 100);
    expect(vi.mocked(fetchImpl).mock.calls.some((c) => isProfile(c[0]))).toBe(true);
  });

  it("still ends at 1500 ms when the map loader never resolves", async () => {
    const mapLoader = vi.fn(() => new Promise<never>(() => {}));
    void boot(root, { fetchImpl: okFetch(), EventSourceImpl: ES, geolocation, mapLoader });
    await vi.advanceTimersByTimeAsync(1499);
    expect(root.querySelector(".hero")).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(root.querySelector(".hero")).toBeNull();
    expect(root.querySelector(".title-text")!.textContent).toBe("SHINIGAMI EYES");
  });

  it("does not replay on pageshow or visibilitychange", async () => {
    void boot(root, { fetchImpl: okFetch(), EventSourceImpl: ES, geolocation });
    await vi.advanceTimersByTimeAsync(1600);
    expect(root.querySelector(".hero")).toBeNull();
    window.dispatchEvent(new Event("pageshow"));
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(50);
    expect(root.querySelector(".hero")).toBeNull();
  });

  it("is not mounted when deps.hero is false", async () => {
    void boot(root, { fetchImpl: okFetch(), EventSourceImpl: ES, geolocation, hero: false });
    expect(root.querySelector(".hero")).toBeNull();
  });
});

describe("exact-layer backstop (WR-W5, D-04, D-21)", () => {
  const NONE_NAME = "No tram stop within 800 m";
  const transitLayer = (id: string): Layer =>
    ({
      id, status: "fresh", rev: 9, as_of: 1, attribution: "",
      items: [{
        id: "none:tram", layer: id, group: "tram", name: NONE_NAME, verb: "", target_ts: null, kind: "transit_vehicle",
        severity: 0, detail: { mode: "tram", none: true, limit_m: 800 }, geom: null, fetched_at: 1, stale_after_s: null, computed: false,
      }],
    }) as unknown as Layer;
  const withTransit = (p: Profile): Profile => ({
    ...p,
    layers: { ...p.layers, transit_stops: transitLayer("transit_stops"), transit_departures: transitLayer("transit_departures") },
  });
  const savedWith = (cameras: boolean) => ({ mode: "pin", gps: "off", pin: { id: "home", label: "Home", cameras } });

  afterEach(() => {
    vi.mocked(idbGet).mockImplementation(() => new Promise(() => {}));
    vi.mocked(loadCachedProfile).mockImplementation(() => new Promise(() => {}));
    vi.mocked(saveProfile).mockClear();
  });

  it("stripExactLayers removes cameras_* and transit_* and keeps the rest", () => {
    const p = withTransit(profile([]));
    p.layers["cameras_cctv"] = layer("cameras_cctv", 1);
    const out = stripExactLayers(p);
    expect(Object.keys(out.layers)).toEqual(["sun"]);
  });

  it("a cached profile for a camera-off pin renders no transit layer", async () => {
    vi.mocked(idbGet).mockResolvedValue(savedWith(false) as never);
    vi.mocked(loadCachedProfile).mockResolvedValue({ profile: withTransit(profile([])), key: "place=home" });
    const fetchImpl = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    await bootApp(fetchImpl);
    expect(root.textContent).not.toContain(NONE_NAME);
  });

  async function camOffPlace() {
    const fetchImpl = vi.fn(async (u: string) => (isProfile(u) ? json(profile([])) : json([]))) as unknown as typeof fetch;
    const app = await bootApp(fetchImpl);
    app.setLocationParams(new URLSearchParams({ place: "home" }));
    await vi.advanceTimersByTimeAsync(50);
    return fetchImpl;
  }

  it("transit frames for a camera-off place are neither applied nor saved", async () => {
    await camOffPlace();
    vi.mocked(saveProfile).mockClear();
    const es = FakeES.all.at(-1)!;
    es.emit("layer", transitLayer("transit_stops"));
    es.emit("layer", transitLayer("transit_departures"));
    await vi.advanceTimersByTimeAsync(2500);
    expect(root.textContent).not.toContain(NONE_NAME);
    for (const c of vi.mocked(saveProfile).mock.calls) {
      expect(Object.keys(c[0].layers).some((k) => k.startsWith("transit_"))).toBe(false);
    }
  });

  it("transit frames for a GPS location are applied normally", async () => {
    const fetchImpl = vi.fn(async (u: string) => (isProfile(u) ? json(profile([])) : json([]))) as unknown as typeof fetch;
    const app = await bootApp(fetchImpl);
    app.setLocationParams(new URLSearchParams({ lat: "1", lon: "2" }));
    await vi.advanceTimersByTimeAsync(50);
    FakeES.all.at(-1)!.emit("layer", transitLayer("transit_stops"));
    await vi.advanceTimersByTimeAsync(50);
    expect(root.textContent).toContain(NONE_NAME);
  });
});
