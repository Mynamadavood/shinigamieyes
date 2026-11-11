import "fake-indexeddb/auto";
import { clear, set } from "idb-keyval";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boot } from "./app";
import { setOffset } from "./clock";
import { createConnectivity } from "./offgrid";
import { loadLastSync, loadProfile, saveLastSync, saveProfile } from "./store";
import type { Item, Layer, Profile } from "./types";

const NOW = 1_800_000_000_000; // ms
const mkItem = (id: string, target: number): Item => ({
  id, layer: "sun", group: id, name: `Item ${id}`, verb: "starts", target_ts: target / 1000,
  kind: "environment", severity: 0, detail: null, geom: null, fetched_at: NOW / 1000,
  stale_after_s: null, computed: true,
});
const mkLayer = (rev: number, items: Item[]): Layer => ({
  id: "sun", status: "fresh", rev, as_of: NOW / 1000, attribution: "", items,
});
const mkProfile = (layer: Layer): Profile => ({
  server_time: NOW / 1000, rev: layer.rev,
  location: { source: "default", lat: null, lon: null, label: "Melbourne CBD" },
  layers: { sun: layer },
});
const cachedProfile = () =>
  mkProfile(mkLayer(1, [mkItem("a", NOW + 3_600_000), mkItem("b", NOW + 7_200_000)]));

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

/** fetch that never resolves but rejects on abort. */
const hangingFetch = (() =>
  new Promise(() => {})) as unknown as typeof fetch;
const okFetch = (p: Profile) =>
  (async () => ({ ok: true, json: async () => p })) as unknown as typeof fetch;

let root: HTMLElement;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(NOW);
  setOffset(0);
  FakeES.all = [];
  document.body.innerHTML = "";
  root = document.createElement("div");
  document.body.append(root);
  await clear();
});
afterEach(() => {
  vi.useRealTimers();
});

const rows = () => [...root.querySelectorAll(".row")].filter((r) => !r.classList.contains("placeholder"));
const banner = () => root.querySelector(".offgrid-banner") as HTMLElement;

describe("connectivity", () => {
  it("is failure driven", () => {
    const c = createConnectivity();
    expect(c.state()).toBe("unknown");
    const fn = vi.fn();
    c.subscribe(fn);
    c.markOffgrid();
    expect(c.state()).toBe("offgrid");
    c.markOnline(5);
    expect(c.state()).toBe("online");
    expect(c.lastSyncMs()).toBe(5);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("boot", () => {
  it("renders the cached profile before the network resolves", async () => {
    await saveProfile(cachedProfile());
    await saveLastSync(NOW - 14 * 60_000);
    await boot(root, { fetchImpl: hangingFetch, EventSourceImpl: ES });
    expect(rows()).toHaveLength(2);
    expect(banner().hidden).toBe(true);
  });

  it("shows OFF-GRID with last sync age after the 4 s timeout; rows keep ticking", async () => {
    await saveProfile(cachedProfile());
    await saveLastSync(NOW - 14 * 60_000);
    await boot(root, { fetchImpl: hangingFetch, EventSourceImpl: ES });
    await vi.advanceTimersByTimeAsync(4100);
    const b = banner();
    expect(b.hidden).toBe(false);
    expect(b.textContent).toBe("OFF-GRID · last sync 14m ago");
    expect(b.getAttribute("role")).toBe("status");
    expect(b.getAttribute("aria-live")).toBe("polite");
    expect(rows()).toHaveLength(2);
    const before = root.querySelector(".row-count")!.textContent;
    await vi.advanceTimersByTimeAsync(3000);
    expect(root.querySelector(".row-count")!.textContent).not.toBe(before);
  });

  it("updates the sync age text when the minute changes", async () => {
    await saveLastSync(NOW - 14 * 60_000);
    await boot(root, { fetchImpl: hangingFetch, EventSourceImpl: ES });
    await vi.advanceTimersByTimeAsync(4100);
    expect(banner().textContent).toBe("OFF-GRID · last sync 14m ago");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(banner().textContent).toBe("OFF-GRID · last sync 15m ago");
  });

  it("says never synced when there is no sync record", async () => {
    await boot(root, { fetchImpl: hangingFetch, EventSourceImpl: ES });
    await vi.advanceTimersByTimeAsync(4100);
    expect(banner().textContent).toBe("OFF-GRID · never synced");
  });

  it("offline with no cache shows the no-data state", async () => {
    await boot(root, { fetchImpl: hangingFetch, EventSourceImpl: ES });
    await vi.advanceTimersByTimeAsync(4100);
    expect(banner().hidden).toBe(false);
    expect(root.textContent).toContain("No data yet");
  });

  it("recovers on online event: banner clears, profile and sync saved", async () => {
    let up = false;
    const live = mkProfile(mkLayer(2, [mkItem("c", NOW + 600_000)]));
    const fetchImpl = ((u: string, init: RequestInit) =>
      up ? okFetch(live)(u, init) : hangingFetch(u, init)) as unknown as typeof fetch;
    await boot(root, { fetchImpl, EventSourceImpl: ES });
    await vi.advanceTimersByTimeAsync(4100);
    expect(banner().hidden).toBe(false);
    up = true;
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(300);
    expect(banner().hidden).toBe(true);
    expect((await loadProfile())?.layers.sun.rev).toBe(2);
    expect(await loadLastSync()).not.toBeNull();
    expect(rows()).toHaveLength(1);
  });

  it("does not show a cached profile for another place under the restored pin (WR-W4)", async () => {
    const forA = { ...cachedProfile(), location: { source: "pin" as const, lat: null, lon: null, place_id: "a" } };
    await saveProfile(forA, "place=a");
    await set("location:state", { mode: "pin", gps: "off", pin: { id: "b", label: "B" } });
    await boot(root, { fetchImpl: hangingFetch, EventSourceImpl: ES });
    expect(rows()).toHaveLength(0);
  });

  it("shows the cached profile when it belongs to the restored pin", async () => {
    const forA = { ...cachedProfile(), location: { source: "pin" as const, lat: null, lon: null, place_id: "a" } };
    await saveProfile(forA, "place=a");
    await set("location:state", { mode: "pin", gps: "off", pin: { id: "a", label: "A" } });
    await boot(root, { fetchImpl: hangingFetch, EventSourceImpl: ES });
    expect(rows()).toHaveLength(2);
  });

  it("never stores or merges camera layers for a camera-off place (WR-W5)", async () => {
    const camLayer: Layer = { ...mkLayer(1, []), id: "cameras_cctv" };
    const home: Profile = {
      ...cachedProfile(),
      location: { source: "pin", lat: null, lon: null, place_id: "home" },
      layers: { sun: mkLayer(1, [mkItem("a", NOW + 3_600_000)]), cameras_cctv: camLayer },
    };
    await set("location:state", { mode: "pin", gps: "off", pin: { id: "home", label: "Home", cameras: false } });
    const fetchImpl = (async (u: string) => ({
      ok: true,
      status: 200,
      json: async () => (String(u).startsWith("/api/places") ? [{ id: "home", label: "Home", cameras: false }] : home),
    })) as unknown as typeof fetch;
    await boot(root, { fetchImpl, EventSourceImpl: ES });
    await vi.advanceTimersByTimeAsync(300);
    expect(Object.keys((await loadProfile())!.layers)).toEqual(["sun"]);
    FakeES.all[FakeES.all.length - 1].emit("layer", { ...camLayer, rev: 2 });
    await vi.advanceTimersByTimeAsync(1500);
    expect(Object.keys((await loadProfile())!.layers)).toEqual(["sun"]);
  });

  it("SSE layer replaces rows in place (same DOM node for unchanged id)", async () => {
    await saveProfile(cachedProfile());
    await boot(root, { fetchImpl: hangingFetch, EventSourceImpl: ES });
    const before = rows().find((r) => r.textContent?.includes("Item a"))!;
    FakeES.all[FakeES.all.length - 1].emit(
      "layer",
      mkLayer(2, [mkItem("a", NOW + 3_600_000), mkItem("b", NOW + 7_200_000), mkItem("z", NOW + 9_000_000)]),
    );
    const after = rows().find((r) => r.textContent?.includes("Item a"))!;
    expect(after).toBe(before);
    expect(rows()).toHaveLength(3);
  });
});
