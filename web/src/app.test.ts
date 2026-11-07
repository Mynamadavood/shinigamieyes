import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Layer, Profile } from "./types";

vi.mock("./store", () => ({
  loadProfile: vi.fn(() => new Promise(() => {})),
  loadLastSync: vi.fn(() => new Promise(() => {})),
  saveProfile: vi.fn(async () => {}),
  saveLastSync: vi.fn(async () => {}),
}));
vi.mock("idb-keyval", () => ({
  get: vi.fn(() => new Promise(() => {})),
  set: vi.fn(async () => {}),
}));

import { IDB_TIMEOUT_MS, boot, deriveListState } from "./app";

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
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById("app")!;
});
afterEach(() => {
  vi.useRealTimers();
});

const banner = () => root.querySelector(".banner-slot")!.firstElementChild as HTMLElement;
const geolocation = { getCurrentPosition: vi.fn() } as unknown as Geolocation;

async function bootApp(fetchImpl: typeof fetch) {
  const p = boot(root, { fetchImpl, EventSourceImpl: ES, geolocation });
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
    const p = boot(root, { fetchImpl, EventSourceImpl: ES, geolocation, mapLoader });
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
    const p = boot(root, { fetchImpl, EventSourceImpl: ES, geolocation, mapLoader });
    await vi.advanceTimersByTimeAsync(IDB_TIMEOUT_MS + 100);
    await expect(p).resolves.toBeDefined();
    await vi.advanceTimersByTimeAsync(100);
    expect(mapLoader).toHaveBeenCalled();
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
