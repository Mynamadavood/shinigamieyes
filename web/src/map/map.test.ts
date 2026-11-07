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
    flyTo = vi.fn();
    isStyleLoaded = () => false;
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
  class FakeMarker {
    static all: FakeMarker[] = [];
    el: HTMLElement;
    opts: any;
    added = false;
    lngLat: unknown;
    constructor(opts: any) {
      this.opts = opts;
      this.el = opts.element;
      FakeMarker.all.push(this);
    }
    setLngLat(l: unknown) { this.lngLat = l; return this; }
    addTo() { this.added = true; return this; }
    remove() { this.added = false; return this; }
  }
  return { Map: FakeMap, Marker: FakeMarker, setWorkerUrl: setWorkerUrlMock };
});
const setWorkerUrlMock = vi.hoisted(() => vi.fn());

import * as ml from "maplibre-gl";
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

const markers = () => (ml as any).Marker.all as any[];
const figureM = () => markers().find((m) => m.el.classList.contains("marker-figure-wrap"));
const pinM = () => markers().find((m) => m.el.classList.contains("marker-pin"));

const okMeta = (build: string) =>
  vi.fn(async () => new Response(JSON.stringify({ status: "ok", build }), { status: 200 }));

beforeEach(() => {
  h.throwOnNew = false;
  h.opts = undefined;
  markers().length = 0;
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

  it("gps shows the figure and no pin; search shows the pin and no figure", async () => {
    const handle = (await createMap(mkDeps()))!;
    handle.setView({ kind: "gps", lat: -37.8, lon: 144.9, accuracy: 20 });
    expect(figureM().added).toBe(true);
    expect(pinM().added).toBe(false);
    handle.setView({ kind: "search", lat: -37.7, lon: 144.8, label: "X" });
    expect(figureM().added).toBe(false);
    expect(pinM().added).toBe(true);
    expect(pinM().lngLat).toEqual([144.8, -37.7]);
    expect(pinM().opts.anchor).toBe("bottom");
  });

  it("pin view shows no marker and jumps to area zoom, pitch 0", async () => {
    const handle = (await createMap(mkDeps()))!;
    handle.setView({ kind: "pin", lat: -37.8, lon: 144.9, label: "A" });
    expect(figureM().added).toBe(false);
    expect(pinM().added).toBe(false);
    expect(h.instance.jumpTo).toHaveBeenCalledWith(
      expect.objectContaining({ center: [144.9, -37.8], zoom: 12, pitch: 0 }),
    );
  });

  it("user gesture reveals recenter; click flies back to FOLLOW framing", async () => {
    const deps = mkDeps();
    const handle = (await createMap(deps))!;
    const btn = deps.controls.querySelector<HTMLButtonElement>("button.recenter")!;
    expect(btn.getAttribute("aria-label")).toBe("Recenter on me");
    expect(btn.querySelector("use")!.getAttribute("href")).toBe("/icons.svg#recenter");
    expect(btn.classList.contains("is-hidden")).toBe(true);
    handle.setView({ kind: "gps", lat: -37.8, lon: 144.9, accuracy: 20 });
    h.instance.emit("dragstart", {});
    expect(btn.classList.contains("is-hidden")).toBe(true);
    h.instance.emit("dragstart", { originalEvent: {} });
    expect(btn.classList.contains("is-hidden")).toBe(false);
    h.instance.easeTo.mockClear();
    handle.setView({ kind: "gps", lat: -37.81, lon: 144.9, accuracy: 20 });
    expect(h.instance.easeTo).not.toHaveBeenCalled();
    btn.click();
    expect(h.instance.flyTo).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: 17, pitch: 60, bearing: 0, duration: 600 }),
    );
    expect(btn.classList.contains("is-hidden")).toBe(true);
  });

  it("recenter jumps under reduced motion", async () => {
    const deps = mkDeps({ reducedMotion: true });
    const handle = (await createMap(deps))!;
    handle.setView({ kind: "gps", lat: -37.8, lon: 144.9, accuracy: 20 });
    h.instance.jumpTo.mockClear();
    deps.controls.querySelector<HTMLButtonElement>("button.recenter")!.click();
    expect(h.instance.flyTo).not.toHaveBeenCalled();
    expect(h.instance.jumpTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 17, pitch: 60, bearing: 0 }));
  });
});
