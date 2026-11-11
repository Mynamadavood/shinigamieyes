import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = { opts: undefined as any, instance: undefined as any, throwOnNew: false, zoom: 17.5 };
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
    fitBounds = vi.fn();
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
    project(l: [number, number]) {
      return { x: (l[0] - 144.9) * 100000, y: (l[1] + 37.8) * 100000 };
    }
    getZoom() {
      return h.zoom;
    }
    container = document.createElement("div");
    getCanvasContainer() {
      return this.container;
    }
    unproject = vi.fn((p: [number, number]) => ({ lng: 144 + p[0] / 1000, lat: -37 - p[1] / 1000 }));
    queryRenderedFeatures = vi.fn((..._a: unknown[]): any[] => []);
    setFeatureState = vi.fn();
    removeFeatureState = vi.fn();
    // stateful sources/layers so the accuracy ring path after `load` really runs
    sources: Record<string, { spec: unknown; setData: ReturnType<typeof vi.fn> }> = {};
    layers: Record<string, unknown> = {};
    getSource = vi.fn((id: string) => this.sources[id]);
    addSource = vi.fn((id: string, spec: unknown) => {
      this.sources[id] = { spec, setData: vi.fn() };
    });
    getLayer = vi.fn((id: string) => this.layers[id]);
    addLayer = vi.fn((spec: { id: string }) => {
      this.layers[spec.id] = spec;
    });
    removeLayer = vi.fn((id: string) => {
      delete this.layers[id];
    });
    setPaintProperty = vi.fn();
    off = vi.fn();
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
    addTo() { this.added = true; document.body.appendChild(this.el); return this; }
    remove() { this.added = false; this.el.remove(); return this; }
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
  h.zoom = 17.5;
  h.opts = undefined;
  markers().length = 0;
  document.body.replaceChildren();
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

  it("queues the accuracy ring until load, then applies it", async () => {
    const handle = (await createMap(mkDeps()))!;
    handle.setView({ kind: "gps", lat: -37.8, lon: 144.9, accuracy: 50 });
    expect(h.instance.addSource).not.toHaveBeenCalled();
    h.instance.emit("load");
    expect(h.instance.addSource).toHaveBeenCalledWith("me-acc", expect.anything());
    expect(h.instance.layers["me-acc-ring"]).toBeDefined();
  });

  it("applies ring updates after load even while tiles are loading (isStyleLoaded false)", async () => {
    const handle = (await createMap(mkDeps()))!;
    h.instance.emit("load");
    handle.setView({ kind: "gps", lat: -37.8, lon: 144.9, accuracy: 50 });
    // tiles in flight: isStyleLoaded() stays false in the fake, as it would on a real device
    expect(h.instance.isStyleLoaded()).toBe(false);
    handle.setView({ kind: "gps", lat: -37.81, lon: 144.91, accuracy: 40 });
    const setData = h.instance.sources["me-acc"].setData;
    expect(setData).toHaveBeenLastCalledWith(
      expect.objectContaining({
        features: [expect.objectContaining({ geometry: { type: "Point", coordinates: [144.91, -37.81] } })],
      }),
    );
    // leaving gps removes the ring layer straight away
    handle.setView({ kind: "search", lat: -37.7, lon: 144.8, label: "X" });
    expect(h.instance.layers["me-acc-ring"]).toBeUndefined();
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

function camItem(id: string, lon: number, lat: number, extra: Record<string, unknown> = {}, group = "cctv"): any {
  return {
    id, layer: "cameras_cctv", group, name: group === "cctv" ? "Camera" : "Speed camera", verb: "", target_ts: null,
    kind: "static", severity: 0, detail: { distance_m: 1, ...extra }, geom: { type: "Point", coordinates: [lon, lat] },
    fetched_at: 0, stale_after_s: null, computed: true,
  };
}
function profileWith(items: any[], roadItems: any[] = []): any {
  const layer = (id: string, its: any[]) => ({ id, status: "fresh", rev: 1, as_of: 0, attribution: "", items: its });
  const layers: Record<string, any> = {};
  if (items.length) layers.cameras_cctv = layer("cameras_cctv", items);
  if (roadItems.length) layers.cameras_road = layer("cameras_road", roadItems);
  return { server_time: 0, rev: 1, location: { source: "gps", lat: null, lon: null }, layers };
}
const tagEls = () => markers().filter((m) => m.el.classList.contains("map-tag"));

describe("camera tags", () => {
  const ORIGIN = { kind: "gps" as const, lat: -37.8, lon: 144.9, accuracy: 10 };
  // made-up points: ~20 m, ~150 m and ~330 m north of the made-up origin
  const items = () => [
    camItem("a", 144.9, -37.79982),
    camItem("b", 144.9, -37.79865, { operator: "Test Council" }),
    camItem("c", 144.9, -37.797, {}),
  ];

  it("creates accessible button markers for positioned items only", async () => {
    const handle = (await createMap(mkDeps()))!;
    handle.setView(ORIGIN);
    const summary = camItem("s", 0, 0, { summary: true });
    summary.geom = null;
    handle.setProfile(profileWith([...items(), summary]));
    const tags = tagEls();
    expect(tags).toHaveLength(3);
    for (const t of tags) {
      expect(t.el.getAttribute("role")).toBe("button");
      expect(t.el.getAttribute("tabindex")).toBe("0");
      expect(t.el.getAttribute("aria-label")).toMatch(/^CCTV camera, \d+ metres away$/);
      expect(t.opts.anchor).toBe("center");
    }
    expect(tags.find((t) => t.el.getAttribute("aria-label")!.includes("20 metres"))).toBeDefined();
  });

  it("marks tags within 30 m as near and the rest as blue", async () => {
    const handle = (await createMap(mkDeps()))!;
    handle.setView(ORIGIN);
    handle.setProfile(profileWith(items()));
    const near = tagEls().filter((t) => t.el.classList.contains("near"));
    expect(near).toHaveLength(1);
  });

  it("removes every camera marker when the profile has no camera layers", async () => {
    const handle = (await createMap(mkDeps()))!;
    handle.setView(ORIGIN);
    handle.setProfile(profileWith(items()));
    expect(document.querySelectorAll(".map-tag")).toHaveLength(3);
    handle.setProfile(profileWith([]));
    expect(document.querySelectorAll(".map-tag")).toHaveLength(0);
  });

  it("pin view ranks tags by the server distance_m", async () => {
    const handle = (await createMap(mkDeps()))!;
    handle.setView({ kind: "pin", lat: -37.8, lon: 144.9, label: "A" });
    handle.setProfile(
      profileWith([
        camItem("a", 144.9, -37.79982, { distance_m: 10 }),
        camItem("b", 144.9, -37.79865, { distance_m: 100 }),
        camItem("c", 144.9, -37.797, { distance_m: 400 }),
      ]),
    );
    const tags = tagEls();
    expect(tags).toHaveLength(3);
    expect(tags.filter((t) => t.el.classList.contains("near"))).toHaveLength(1);
    expect(tags.find((t) => t.el.getAttribute("aria-label")!.includes("10 metres"))!.el.classList.contains("near")).toBe(true);
  });

  it("pin view skips items without a finite distance_m", async () => {
    const handle = (await createMap(mkDeps()))!;
    handle.setView({ kind: "pin", lat: -37.8, lon: 144.9, label: "A" });
    const bad = camItem("x", 144.9, -37.79982);
    delete bad.detail.distance_m;
    handle.setProfile(profileWith([bad, camItem("y", 144.9, -37.79865, { distance_m: 100 })]));
    expect(tagEls()).toHaveLength(1);
  });

  it("shows no tags with no view", async () => {
    const handle = (await createMap(mkDeps()))!;
    handle.setView({ kind: "none" });
    handle.setProfile(profileWith(items()));
    expect(document.querySelectorAll(".map-tag")).toHaveLength(0);
  });

  it("pin view frames the CCTV items once, not again on the next profile", async () => {
    const handle = (await createMap(mkDeps()))!;
    handle.setView({ kind: "pin", lat: -37.8, lon: 144.9, label: "A" });
    const p = profileWith([
      camItem("a", 144.901, -37.799, { distance_m: 10 }),
      camItem("b", 144.903, -37.797, { distance_m: 100 }),
    ]);
    handle.setProfile(p);
    expect(h.instance.fitBounds).toHaveBeenCalledTimes(1);
    expect(h.instance.fitBounds).toHaveBeenCalledWith(
      [[144.901, -37.799], [144.903, -37.797]],
      expect.objectContaining({ padding: 48, maxZoom: 17, pitch: 60 }),
    );
    handle.setProfile(p);
    expect(h.instance.fitBounds).toHaveBeenCalledTimes(1);
  });

  it("pin view with no CCTV frames the road cameras instead", async () => {
    const handle = (await createMap(mkDeps()))!;
    handle.setView({ kind: "pin", lat: -37.8, lon: 144.9, label: "A" });
    handle.setProfile(
      profileWith([], [
        camItem("r1", 144.91, -37.79, { distance_m: 600 }, "speed"),
        camItem("r2", 144.92, -37.78, { distance_m: 900 }, "redlight"),
      ]),
    );
    expect(h.instance.fitBounds).toHaveBeenCalledTimes(1);
    expect(h.instance.fitBounds).toHaveBeenCalledWith(
      [[144.91, -37.79], [144.92, -37.78]],
      expect.objectContaining({ padding: 48, maxZoom: 17, pitch: 60 }),
    );
  });

  it("pin view without any camera positions keeps the area framing", async () => {
    const handle = (await createMap(mkDeps()))!;
    handle.setView({ kind: "pin", lat: -37.8, lon: 144.9, label: "A" });
    handle.setProfile(profileWith([]));
    expect(h.instance.fitBounds).not.toHaveBeenCalled();
  });

  it("a click opens the card; a canvas click closes it; Enter also opens", async () => {
    const handle = (await createMap(mkDeps()))!;
    handle.setView(ORIGIN);
    handle.setProfile(profileWith(items(), [camItem("r", 144.9, -37.795, { road: "Test Rd", suburb: "Testville" }, "speed")]));
    const el = tagEls()[0].el;
    el.click();
    const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]:not(.is-hidden)');
    expect(dialog()).not.toBeNull();
    expect(dialog()!.textContent).toContain("Mapped, not exhaustive.");
    expect(el.classList.contains("selected")).toBe(true);
    h.instance.emit("click", { originalEvent: { target: document.createElement("canvas") } });
    expect(dialog()).toBeNull();
    expect(el.classList.contains("selected")).toBe(false);
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(dialog()).not.toBeNull();
    const road = tagEls().find((t) => t.el.getAttribute("aria-label")!.startsWith("Speed camera"))!;
    road.el.click();
    expect(dialog()!.textContent).toContain("Static info only.");
    expect(dialog()!.textContent).toContain("Source: OpenStreetMap");
  });

  it("a camera-less profile update does not close a card the tags do not own", async () => {
    const handle = (await createMap(mkDeps()))!;
    handle.setView(ORIGIN);
    handle.setProfile(profileWith([]));
    figureM().el.click();
    const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]:not(.is-hidden)');
    expect(dialog()!.textContent).toContain("YOU");
    handle.setProfile(profileWith([]));
    expect(dialog()).not.toBeNull();
  });

  it("a frame for another layer leaves an open tag card alone", async () => {
    const handle = (await createMap(mkDeps()))!;
    handle.setView(ORIGIN);
    const p = profileWith(items());
    handle.setProfile(p);
    tagEls()[0].el.click();
    const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]:not(.is-hidden)');
    expect(dialog()).not.toBeNull();
    const other = { id: "uv_now", status: "fresh", rev: 1, as_of: 0, attribution: "", items: [] };
    handle.setProfile({ ...p, layers: { ...p.layers, uv_now: other } });
    expect(dialog()).not.toBeNull();
  });

  it("re-ranks on moveend debounced 100 ms, not on move", async () => {
    vi.useFakeTimers();
    const handle = (await createMap(mkDeps()))!;
    handle.setView(ORIGIN);
    handle.setProfile(profileWith(items()));
    const spy = vi.spyOn(h.instance, "project");
    h.instance.emit("move");
    h.instance.emit("moveend");
    h.instance.emit("moveend");
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(99);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(spy).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});

describe("long-press, pin and building interactions", () => {
  const touch = (target: Element, type: string, pts: Array<[number, number]>) => {
    const ev = new Event(type, { bubbles: true });
    (ev as any).touches = pts.map(([clientX, clientY]) => ({ clientX, clientY }));
    target.dispatchEvent(ev);
  };
  const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]:not(.is-hidden)');

  it("drops a pin after 500 ms still, via unproject", async () => {
    vi.useFakeTimers();
    const deps = mkDeps();
    await createMap(deps);
    const c = h.instance.container as HTMLElement;
    touch(c, "touchstart", [[100, 200]]);
    expect(deps.host.querySelector<HTMLElement>(".longpress-ring")!.hidden).toBe(false);
    vi.advanceTimersByTime(500);
    expect(h.instance.unproject).toHaveBeenCalledWith([100, 200]);
    expect(deps.onLongPress).toHaveBeenCalledWith({ lat: -37.2, lon: 144.1 });
    vi.useRealTimers();
  });

  it("ignores a non-finite unproject result", async () => {
    vi.useFakeTimers();
    const deps = mkDeps();
    await createMap(deps);
    h.instance.unproject.mockReturnValue({ lng: NaN, lat: NaN });
    touch(h.instance.container, "touchstart", [[1, 2]]);
    vi.advanceTimersByTime(500);
    expect(deps.onLongPress).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("cancels on movement and on a map gesture; never starts on UI", async () => {
    vi.useFakeTimers();
    const deps = mkDeps();
    await createMap(deps);
    const c = h.instance.container as HTMLElement;
    touch(c, "touchstart", [[0, 0]]);
    touch(c, "touchmove", [[20, 0]]);
    vi.advanceTimersByTime(600);
    touch(c, "touchstart", [[0, 0]]);
    h.instance.emit("dragstart", { originalEvent: {} });
    vi.advanceTimersByTime(600);
    for (const cls of ["tag", "card", "hud", "drawer"]) {
      const el = document.createElement("div");
      el.className = cls;
      c.appendChild(el);
      touch(el, "touchstart", [[0, 0]]);
    }
    vi.advanceTimersByTime(600);
    expect(deps.onLongPress).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("dropped pin card has Use GPS", async () => {
    const deps = mkDeps();
    const handle = (await createMap(deps))!;
    handle.setView({ kind: "search", lat: -37.7, lon: 144.8, label: "Dropped pin" });
    pinM().el.click();
    expect(dialog()!.textContent).toContain("YOUR PIN");
    expect(dialog()!.textContent).toContain("Dropped pin");
    expect(dialog()!.textContent).toContain("Set from the map");
    const btn = Array.from(dialog()!.querySelectorAll("button")).find((b) => b.textContent === "Use GPS")!;
    btn.click();
    expect(deps.onUseGps).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
  });

  it("figure card shows GPS accuracy", async () => {
    const handle = (await createMap(mkDeps()))!;
    handle.setView({ kind: "gps", lat: -37.8, lon: 144.9, accuracy: 12.2 });
    figureM().el.click();
    expect(dialog()!.textContent).toContain("YOU");
    expect(dialog()!.textContent).toContain("GPS · accuracy 12 m");
  });

  it("building tap selects and opens the card; elsewhere clears", async () => {
    await createMap(mkDeps());
    h.instance.queryRenderedFeatures.mockReturnValue([{ id: 5, properties: { height: 24.4 } }]);
    const target = document.createElement("canvas");
    h.instance.emit("click", { originalEvent: { target }, point: { x: 30, y: 40 } });
    expect(h.instance.queryRenderedFeatures).toHaveBeenCalledWith([30, 40], { layers: ["buildings-3d"] });
    expect(h.instance.setFeatureState).toHaveBeenCalledWith(
      { source: "protomaps", sourceLayer: "buildings", id: 5 }, { selected: true });
    expect(dialog()!.textContent).toContain("BUILDING");
    expect(dialog()!.textContent).toContain("Height: 24 m");
    h.instance.queryRenderedFeatures.mockReturnValue([]);
    h.instance.emit("click", { originalEvent: { target }, point: { x: 1, y: 1 } });
    expect(h.instance.removeFeatureState).toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });

  it("ignores building taps below zoom 15", async () => {
    await createMap(mkDeps());
    h.zoom = 14;
    h.instance.queryRenderedFeatures.mockReturnValue([{ id: 5, properties: {} }]);
    h.instance.emit("click", { originalEvent: { target: document.createElement("canvas") }, point: { x: 1, y: 1 } });
    expect(h.instance.queryRenderedFeatures).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });
});
