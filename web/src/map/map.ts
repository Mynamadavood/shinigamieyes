import { Map as MlMap, Marker, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "../styles/map.css";
import "../styles/tags.css";
import { withTimeout } from "../timeout";
import type { Item } from "../types";
import { DEFAULT_FONT, buildStyle, readStyleTokens } from "./style";
import type { MapDeps, MapHandle, MapView } from "./types";
import { RING_SOURCE,readRingTokens, syncRing, type RingMap } from "./accuracy-ring";
import { createFollow } from "./follow";
import { Card } from "./card";
import { BuildingSelector, buildingCardContent, buildingHeight, type BuildingMap } from "./buildings";
import { createLongPress } from "./longpress";
import { TagLayer } from "./tags";
import { createFigureElement, createPinElement, setFigureAccuracy } from "./marker-figure";
import { CBD_DEFAULT, FOLLOW, PIN_AREA_ZOOM } from "./view";

const META_KEY = "tiles:meta";
const META_TIMEOUT_MS = 2000;
const EASE_MS = 400;
const FLY_MS = 600;
const OFFLINE_COPY = "Map tiles unavailable offline";
const DEFAULT_PEEK_PX = 144;
const CAMERA_LAYERS = ["cameras_cctv", "cameras_road"] as const;
const BUILDING_MIN_ZOOM = 15;
const DROPPED_LABEL = "Dropped pin";
// touches that begin on these never start the long-press ring
const UI_SELECTOR = ".tag, .map-tag, .card, .hud, .drawer, .marker-hit, .recenter, .maplibregl-ctrl";

let workerSet = false;

/** Tile build id: fresh from the server, else the last stored value, else "0". */
async function resolveBuild(): Promise<string> {
  let fresh: string | null = null;
  try {
    const meta = await withTimeout(
      fetch("/api/tiles/meta").then(async (r) => (r.ok ? ((await r.json()) as unknown) : null)),
      META_TIMEOUT_MS,
      null,
    );
    if (meta && typeof meta === "object" && "build" in meta) {
      fresh = String((meta as { build: unknown }).build);
      try {
        localStorage.setItem(META_KEY, JSON.stringify(meta));
      } catch {
        /* storage full or blocked: not fatal */
      }
    }
  } catch {
    /* offline: fall through to the stored value */
  }
  if (fresh) return fresh;
  try {
    const stored = localStorage.getItem(META_KEY);
    if (stored) {
      const b = (JSON.parse(stored) as { build?: unknown }).build;
      if (b !== undefined && b !== null) return String(b);
    }
  } catch {
    /* corrupt entry */
  }
  return "0";
}

function bottomPadding(): number {
  const drawer = document.querySelector(".drawer");
  const h = drawer ? drawer.getBoundingClientRect().height : 0;
  if (h > 0) return h;
  const peek = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--drawer-peek"));
  return Number.isFinite(peek) ? peek : DEFAULT_PEEK_PX;
}

export async function createMap(deps: MapDeps): Promise<MapHandle | null> {
  if (!workerSet) {
    // same-origin worker asset: CSP stays `worker-src 'self'` (no blob:)
    setWorkerUrl(workerUrl);
    workerSet = true;
  }
  const build = await resolveBuild();
  const style = buildStyle(readStyleTokens(), deps.origin, build, DEFAULT_FONT);

  let map: MlMap;
  try {
    map = new MlMap({
      container: deps.host,
      style,
      center: [CBD_DEFAULT.lon, CBD_DEFAULT.lat],
      zoom: CBD_DEFAULT.zoom,
      pitch: CBD_DEFAULT.pitch,
      bearing: 0,
      maxPitch: 70,
      minZoom: 11,
      maxZoom: 19.5,
      renderWorldCopies: false,
      fadeDuration: 0,
      maxTileCacheSize: 100,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      canvasContextAttributes: { antialias: false, powerPreference: "high-performance" },
      attributionControl: { compact: true },
      cooperativeGestures: false,
    });
  } catch {
    deps.host.classList.add("no-webgl");
    return null;
  }

  const hint = document.createElement("div");
  hint.className = "map-offline-hint";
  hint.textContent = OFFLINE_COPY;
  hint.hidden = true;
  deps.host.appendChild(hint);

  let tileErrors = 0;
  let tileLoads = 0;
  // errors are swallowed and never logged: tile coordinates encode location
  map.on("error", (e: unknown) => {
    if ((e as { tile?: unknown }).tile) tileErrors += 1;
  });
  map.on("sourcedata", (e: unknown) => {
    if ((e as { tile?: unknown }).tile) {
      tileLoads += 1;
      hint.hidden = true;
    }
  });
  map.on("movestart", () => {
    tileErrors = 0;
    tileLoads = 0;
  });
  map.on("idle", () => {
    if (tileErrors >= 1 && tileLoads === 0) hint.hidden = false;
  });

  const card = new Card(document.body, () => {
    const r = document.querySelector(".readouts")?.getBoundingClientRect();
    return { top: r && r.bottom > 0 ? r.bottom + 8 : 64, bottom: bottomPadding() };
  });
  const selector = new BuildingSelector(map as unknown as BuildingMap, readStyleTokens().buildingHot || undefined);
  let tapAnchor: HTMLElement | null = null;
  const dropTapAnchor = () => {
    tapAnchor?.remove();
    tapAnchor = null;
  };
  const closeBuilding = () => {
    selector.clear();
    dropTapAnchor();
  };
  type ClickEvt = {
    originalEvent?: MouseEvent;
    point?: { x: number; y: number };
  };
  map.on("click", (e: ClickEvt) => {
    const t = e.originalEvent?.target;
    if (t instanceof Element && t.closest(".map-tag, .marker-hit")) return;
    card.close();
    closeBuilding();
    deps.onMapTap();
    if (!e.point || map.getZoom() < BUILDING_MIN_ZOOM) return;
    const feats = map.queryRenderedFeatures([e.point.x, e.point.y], { layers: ["buildings-3d"] });
    const f = feats[0];
    if (!f) return;
    selector.select(f as unknown as Parameters<BuildingSelector["select"]>[0]);
    const a = document.createElement("div");
    a.className = "tap-anchor";
    a.style.left = `${Math.round(e.point.x)}px`;
    a.style.top = `${Math.round(e.point.y)}px`;
    document.body.appendChild(a);
    tapAnchor = a;
    card.open(a, buildingCardContent(buildingHeight(f.properties as Record<string, unknown> | null)), {
      onClose: closeBuilding,
    });
  });

  const canvas = map.getCanvas();
  canvas.setAttribute("role", "application");
  canvas.setAttribute("aria-label", "3D map of your surroundings");
  canvas.addEventListener("webglcontextlost", (ev) => ev.preventDefault());
  canvas.addEventListener("webglcontextrestored", () => map.triggerRepaint());

  const onVisible = () => {
    if (document.visibilityState === "visible") {
      map.resize();
      map.triggerRepaint();
    }
  };
  document.addEventListener("visibilitychange", onVisible);

  let positioned = false;

  const follow = createFollow();
  const recenterBtn = document.createElement("button");
  recenterBtn.type = "button";
  recenterBtn.className = "recenter is-hidden";
  recenterBtn.setAttribute("aria-label", "Recenter on me");
  const ns = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(ns, "svg");
  const use = document.createElementNS(ns, "use");
  use.setAttribute("href", "/icons.svg#recenter");
  icon.appendChild(use);
  recenterBtn.appendChild(icon);
  deps.controls.appendChild(recenterBtn);
  const showRecenter = (on: boolean) => recenterBtn.classList.toggle("is-hidden", !on);

  const markerOpts = (element: HTMLElement) => ({
    element,
    anchor: "bottom" as const,
    pitchAlignment: "viewport" as const,
    rotationAlignment: "viewport" as const,
  });
  const figureEl = createFigureElement();
  const pinEl = createPinElement();
  const figureMarker = new Marker(markerOpts(figureEl));
  const pinMarker = new Marker(markerOpts(pinEl));
  let figureOn = false;
  let pinOn = false;
  const setFigure = (on: boolean, v?: { lat: number; lon: number }) => {
    if (on && v) {
      figureMarker.setLngLat([v.lon, v.lat]);
      if (!figureOn) figureMarker.addTo(map);
    } else if (figureOn) figureMarker.remove();
    figureOn = on;
  };
  const setPin = (on: boolean, v?: { lat: number; lon: number }) => {
    if (on && v) {
      pinMarker.setLngLat([v.lon, v.lat]);
      if (!pinOn) pinMarker.addTo(map);
    } else if (pinOn) pinMarker.remove();
    pinOn = on;
  };

  // marker cards (D-07, UI-SPEC): tapping the figure or the dropped/search pin
  figureEl.addEventListener("click", () => {
    if (current.kind !== "gps") return;
    closeBuilding();
    card.open(figureEl, {
      title: "YOU",
      primary: `GPS · accuracy ${Math.round(current.accuracy)} m`,
      secondary: [],
      caveats: [],
    });
  });
  pinEl.addEventListener("click", () => {
    const v = current;
    if (v.kind !== "search") return;
    closeBuilding();
    card.open(pinEl, {
      title: "YOUR PIN",
      primary: v.label,
      secondary: [],
      caveats: v.label === DROPPED_LABEL ? ["Set from the map"] : [],
      action: {
        label: "Use GPS",
        onClick: () => {
          card.close();
          deps.onUseGps();
        },
      },
    });
  });

  // long-press pin drop (D-07): one finger, 500 ms, still, on empty map
  const container = map.getCanvasContainer();
  const ring = document.createElement("div");
  ring.className = "longpress-ring";
  ring.hidden = true;
  deps.host.appendChild(ring);
  const press = createLongPress({
    onStart(x, y) {
      ring.style.setProperty("--x", `${x}px`);
      ring.style.setProperty("--y", `${y}px`);
      ring.hidden = false;
      ring.classList.add("is-growing");
    },
    onCancel() {
      ring.hidden = true;
      ring.classList.remove("is-growing");
    },
    onFire(x, y) {
      ring.hidden = true;
      ring.classList.remove("is-growing");
      const ll = map.unproject([x, y]);
      if (!ll || !Number.isFinite(ll.lat) || !Number.isFinite(ll.lng)) return;
      card.close();
      closeBuilding();
      deps.onLongPress({ lat: ll.lat, lon: ll.lng });
    },
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (hd) => window.clearTimeout(hd as number),
  });
  const touchPts = (e: Event): Array<{ x: number; y: number }> => {
    const r = container.getBoundingClientRect();
    const list = (e as TouchEvent).touches;
    return Array.from(list ?? [], (t) => ({ x: t.clientX - r.left, y: t.clientY - r.top }));
  };
  const onTouchStart = (e: Event) => {
    const t = e.target;
    const onUi = t instanceof Element && t.closest(UI_SELECTOR) !== null;
    press.touchStart(touchPts(e), onUi);
  };
  const onTouchMove = (e: Event) => press.touchMove(touchPts(e));
  const onTouchEnd = () => press.touchEnd();
  container.addEventListener("touchstart", onTouchStart, { passive: true });
  container.addEventListener("touchmove", onTouchMove, { passive: true });
  container.addEventListener("touchend", onTouchEnd, { passive: true });
  container.addEventListener("touchcancel", onTouchEnd, { passive: true });

  const ringTokens = readRingTokens();
  const ringMap = map as unknown as RingMap;
  // Ring updates queue only until the style has first loaded. After that they always apply:
  // isStyleLoaded() is false whenever any tile (or the ring's own setData) is in flight, so it must
  // not gate updates (CR-W1). addSource/addLayer/setData are legal once the style JSON has parsed.
  let ringPending: MapView | null = null;
  let styleReady = false;
  const applyRing = (v: MapView) => {
    if (!styleReady && !map.getSource(RING_SOURCE)) {
      ringPending = v;
      return;
    }
    ringPending = null;
    syncRing(ringMap, v, ringTokens);
  };
  const onStyleReady = () => {
    styleReady = true;
    if (ringPending) applyRing(ringPending);
  };
  map.on("style.load", onStyleReady);
  map.on("load", onStyleReady);

  const tags = new TagLayer({
    map: map as unknown as ConstructorParameters<typeof TagLayer>[0]["map"],
    card,
    createMarker: (element) =>
      new Marker({
        element,
        anchor: "center",
        pitchAlignment: "viewport",
        rotationAlignment: "viewport",
      }) as unknown as ReturnType<ConstructorParameters<typeof TagLayer>[0]["createMarker"]>,
  });

  let current: MapView = { kind: "none" };
  let lastKind: MapView["kind"] = "none";
  let lastPinKey = "";
  let pinFramed = false;

  const framing = (v: { lat: number; lon: number }) => ({
    center: [v.lon, v.lat] as [number, number],
    zoom: FOLLOW.zoom,
    pitch: FOLLOW.pitch,
    bearing: FOLLOW.bearing,
    padding: { top: 0, left: 0, right: 0, bottom: bottomPadding() },
  });
  const areaFraming = (v: { lat: number; lon: number }) => ({
    center: [v.lon, v.lat] as [number, number],
    zoom: PIN_AREA_ZOOM,
    pitch: 0,
    bearing: 0,
    padding: { top: 0, left: 0, right: 0, bottom: 0 },
  });

  // user gestures only (originalEvent set); programmatic moves carry none
  for (const ev of ["dragstart", "zoomstart", "rotatestart", "pitchstart"] as const) {
    map.on(ev, (e: { originalEvent?: unknown }) => {
      if (!e.originalEvent) return;
      press.mapGesture();
      if (current.kind === "none") return;
      showRecenter(follow.on("userGesture").showRecenter);
    });
  }

  recenterBtn.addEventListener("click", () => {
    const v = current;
    if (v.kind === "none") return;
    const res = follow.on("recenter");
    showRecenter(res.showRecenter);
    const opts = v.kind === "pin" ? areaFraming(v) : framing(v);
    if (deps.reducedMotion) map.jumpTo(opts);
    else map.flyTo({ ...opts, duration: FLY_MS, essential: true });
  });

  function setView(v: MapView): void {
    current = v;
    // gps/search measure on the client. Saved places use the server's distances because the phone
    // never receives the place coordinates (a pin view's lat/lon is the 0.1 degree cell centre,
    // not the place, and must NOT be used as the origin).
    tags.setOrigin(v.kind === "gps" || v.kind === "search" ? { lat: v.lat, lon: v.lon } : v.kind === "pin" ? "server" : null);
    if (v.kind === "none") {
      setFigure(false);
      setPin(false);
      applyRing(v);
      if (!positioned) {
        map.jumpTo({ center: [CBD_DEFAULT.lon, CBD_DEFAULT.lat], zoom: CBD_DEFAULT.zoom, pitch: CBD_DEFAULT.pitch, bearing: 0 });
        positioned = true;
      }
      lastKind = "none";
      return;
    }
    if (v.kind === "pin") {
      // saved place: area level on the cell centre, no marker (CR-02)
      setFigure(false);
      setPin(false);
      applyRing(v);
      const key = `${v.lat},${v.lon}`;
      if (lastKind !== "pin" || key !== lastPinKey) {
        map.jumpTo(areaFraming(v));
        pinFramed = false;
        follow.on("recenter");
        showRecenter(false);
      }
      lastPinKey = key;
      lastKind = "pin";
      positioned = true;
      return;
    }
    if (v.kind === "gps") {
      setFigure(true, v);
      setFigureAccuracy(figureEl, v.accuracy);
      setPin(false);
    } else {
      setFigure(false);
      setPin(true, v);
    }
    applyRing(v);
    const kindChanged = lastKind !== v.kind;
    lastKind = v.kind;
    if (!positioned || kindChanged) {
      // first fix or a different source: full framing, follow resets to on
      follow.on("recenter");
      showRecenter(false);
      const opts = framing(v);
      if (!positioned || deps.reducedMotion) map.jumpTo(opts);
      else map.easeTo({ ...opts, duration: EASE_MS });
      positioned = true;
      return;
    }
    const res = follow.on("viewChanged");
    showRecenter(res.showRecenter);
    if (res.action === "none") return;
    const centre = { center: [v.lon, v.lat] as [number, number], padding: { top: 0, left: 0, right: 0, bottom: bottomPadding() } };
    if (deps.reducedMotion) map.jumpTo(centre);
    else map.easeTo({ ...centre, duration: EASE_MS });
  }

  return {
    setView,
    setProfile(p) {
      const items: Item[] = [];
      for (const id of CAMERA_LAYERS) {
        for (const it of p?.layers[id]?.items ?? []) items.push(it);
      }
      tags.update(items);
      // saved place: the cell-centre area view shows 150 m as ~5 px, so frame the cameras once:
      // the CCTV items, or the road cameras when no CCTV is mapped within 150 m (the common case)
      if (current.kind === "pin" && !pinFramed && follow.following()) {
        const pointsOf = (layer: string): [number, number][] => {
          const out: [number, number][] = [];
          for (const it of p?.layers[layer]?.items ?? []) {
            if (it.detail && it.detail["summary"] === true) continue;
            const g = it.geom as { type?: unknown; coordinates?: unknown } | null;
            if (!g || g.type !== "Point" || !Array.isArray(g.coordinates)) continue;
            const [lo, la] = g.coordinates as unknown[];
            if (typeof lo === "number" && typeof la === "number" && Number.isFinite(lo) && Number.isFinite(la)) {
              out.push([lo, la]);
            }
          }
          return out;
        };
        let pts = pointsOf("cameras_cctv");
        if (pts.length === 0) pts = pointsOf("cameras_road");
        if (pts.length > 0) {
          pinFramed = true;
          const lons = pts.map((q) => q[0]);
          const lats = pts.map((q) => q[1]);
          const bounds: [[number, number], [number, number]] = [
            [Math.min(...lons), Math.min(...lats)],
            [Math.max(...lons), Math.max(...lats)],
          ];
          const opts = { padding: 48, maxZoom: 17, pitch: 60, bearing: 0 };
          if (deps.reducedMotion) map.fitBounds(bounds, { ...opts, duration: 0 });
          else map.fitBounds(bounds, { ...opts, duration: FLY_MS });
        }
      }
    },
    resize() {
      map.resize();
    },
    destroy() {
      document.removeEventListener("visibilitychange", onVisible);
      hint.remove();
      recenterBtn.remove();
      ring.remove();
      closeBuilding();
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("touchcancel", onTouchEnd);
      tags.destroy();
      card.destroy();
      figureMarker.remove();
      pinMarker.remove();
      map.remove();
    },
  };
}
