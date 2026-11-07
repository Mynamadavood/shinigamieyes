import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = { opts: undefined as any, instance: undefined as any, throwOnNew: false };
  return state;
});

vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
vi.mock("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url", () => ({ default: "/w.js" }));
vi.mock("maplibre-gl", () => {
  class FakeMap {
    handlers: Record<string, Array<(e: any) => void>> = {};
    canvas = document.createElement("canvas");
    jumpTo = vi.fn();
    easeTo = vi.fn();
    resize = vi.fn();
    triggerRepaint = vi.fn();
    remove = vi.fn();
    constructor(opts: unknown) {
      if (h.throwOnNew) throw new Error("GPUInitializationError");
      h.opts = opts;
      h.instance = this;
    }
    on(ev: string, fn: (e: any) => void) {
      (this.handlers[ev] ??= []).push(fn);
    }
    emit(ev: string, e: any = {}) {
      for (const f of this.handlers[ev] ?? []) f(e);
    }
    getCanvas() {
      return this.canvas;
    }
  }
  return { Map: FakeMap, setWorkerUrl: setWorkerUrlMock };
});
const setWorkerUrlMock = vi.hoisted(() => vi.fn());

import { createMap } from "./map";
import type { MapDeps } from "./types";

function mkDeps(over: Partial<MapDeps> = {}): MapDeps {
  return {
    host: document.createElement("div"),
    controls: document.createElement("div"),
    origin: "https://x.ts.net",
    reducedMotion: false,
    onLongPress: vi.fn(),
    onUseGps: vi.fn(),
    onMapTap: vi.fn(),
    ...over,
  };
}

const okMeta = (build: string) =>
  vi.fn(async () => new Response(JSON.stringify({ status: "ok", build }), { status: 200 }));

beforeEach(() => {
  h.throwOnNew = false;
  h.opts = undefined;
  localStorage.clear();
  vi.stubGlobal("fetch", okMeta("77"));
});

describe("createMap", () => {
  it("sets the worker url once and constructs with the resilience options", async () => {
    await createMap(mkDeps());
    await createMap(mkDeps());
    expect(setWorkerUrlMock).toHaveBeenCalledTimes(1);
    expect(setWorkerUrlMock).toHaveBeenCalledWith("/w.js");
    expect(h.opts).toMatchObject({
      maxPitch: 70, minZoom: 11, maxZoom: 19.5, renderWorldCopies: false, fadeDuration: 0,
      maxTileCacheSize: 100, cooperativeGestures: false, attributionControl: { compact: true },
    });
    expect(h.opts.pixelRatio).toBeLessThanOrEqual(2);
    expect(h.opts.style.sources.protomaps.tiles[0]).toBe("https://x.ts.net/tiles/{z}/{x}/{y}.mvt?v=77");
    expect(localStorage.getItem("tiles:meta")).toContain("77");
  });

  it("falls back to the stored meta, then to build 0", async () => {
    localStorage.setItem("tiles:meta", JSON.stringify({ build: "55" }));
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await createMap(mkDeps());
    expect(h.opts.style.sources.protomaps.tiles[0]).toContain("v=55");
    localStorage.clear();
    await createMap(mkDeps());
    expect(h.opts.style.sources.protomaps.tiles[0]).toContain("v=0");
  });

  it("races the meta fetch against 2 s", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const p = createMap(mkDeps());
    await vi.advanceTimersByTimeAsync(2100);
    await p;
    vi.useRealTimers();
    expect(h.opts.style.sources.protomaps.tiles[0]).toContain("v=0");
  });

  it("returns null and marks no-webgl when the constructor throws", async () => {
    h.throwOnNew = true;
    const deps = mkDeps();
    expect(await createMap(deps)).toBeNull();
    expect(deps.host.classList.contains("no-webgl")).toBe(true);
  });

  it("swallows error events", async () => {
    const spy = vi.spyOn(console, "error");
    await createMap(mkDeps());
    expect(() => h.instance.emit("error", { error: new Error("x"), tile: {} })).not.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });

  it("first gps view jumps, later ones ease; reduced motion always jumps", async () => {
    const handle = (await createMap(mkDeps()))!;
    handle.setView({ kind: "gps", lat: -37.8, lon: 144.9, accuracy: 10 });
    expect(h.instance.jumpTo).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: 17, pitch: 60, bearing: 0, center: [144.9, -37.8], padding: expect.objectContaining({ bottom: expect.any(Number) }) }),
    );
    handle.setView({ kind: "gps", lat: -37.81, lon: 144.91, accuracy: 10 });
    expect(h.instance.easeTo).toHaveBeenCalledWith(expect.objectContaining({ duration: 400 }));
    const h2 = (await createMap(mkDeps({ reducedMotion: true })))!;
    h2.setView({ kind: "gps", lat: 1, lon: 2, accuracy: 1 });
    h2.setView({ kind: "gps", lat: 1.1, lon: 2, accuracy: 1 });
    expect(h.instance.easeTo).not.toHaveBeenCalled();
    expect(h.instance.jumpTo).toHaveBeenCalledTimes(2);
  });

  it("none on first call centres on the CBD", async () => {
    const handle = (await createMap(mkDeps()))!;
    handle.setView({ kind: "none" });
    expect(h.instance.jumpTo).toHaveBeenCalledWith(
      expect.objectContaining({ center: [144.9631, -37.8136], zoom: 14, pitch: 0 }),
    );
  });

  it("shows the offline hint only when tiles failed and none loaded", async () => {
    const deps = mkDeps();
    await createMap(deps);
    const hint = deps.host.querySelector<HTMLElement>(".map-offline-hint")!;
    expect(hint.textContent).toBe("Map tiles unavailable offline");
    expect(hint.hidden).toBe(true);
    h.instance.emit("movestart");
    h.instance.emit("error", { tile: {} });
    h.instance.emit("idle");
    expect(hint.hidden).toBe(false);
    h.instance.emit("sourcedata", { tile: {} });
    expect(hint.hidden).toBe(true);
  });

  it("taps off DOM tags collapse the drawer; taps on tags do not", async () => {
    const deps = mkDeps();
    await createMap(deps);
    const tag = document.createElement("div");
    tag.className = "map-tag";
    h.instance.emit("click", { originalEvent: { target: tag } });
    expect(deps.onMapTap).not.toHaveBeenCalled();
    h.instance.emit("click", { originalEvent: { target: document.createElement("canvas") } });
    expect(deps.onMapTap).toHaveBeenCalledTimes(1);
  });
});
