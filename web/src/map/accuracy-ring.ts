import type { MapView } from "./types";

const EARTH_M_PER_PX_Z0 = 78271.51696;
const MIN_PX = 16;
const MAX_PX = 150;
const HIDE_AT_M = 10;

export const RING_SOURCE = "me-acc";
export const RING_LAYER = "me-acc-ring";

export interface RingTokens {
  fill: string;
  line: string;
}

/** Ring radius in CSS pixels for an accuracy in metres, or null when too small to show. */
export function ringRadiusPx(metres: number, lat: number, zoom: number): number | null {
  if (!(metres > HIDE_AT_M)) return null;
  const mPerPx = (EARTH_M_PER_PX_Z0 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
  const px = metres / mPerPx;
  return Math.min(MAX_PX, Math.max(MIN_PX, px));
}

/** The slice of the MapLibre map the ring needs (kept narrow so tests can fake it). */
export interface RingMap {
  getSource(id: string): unknown;
  addSource(id: string, spec: unknown): unknown;
  getLayer(id: string): unknown;
  addLayer(spec: unknown): unknown;
  removeLayer(id: string): unknown;
  setPaintProperty(layer: string, prop: string, value: unknown): unknown;
  getZoom(): number;
  on(ev: string, fn: () => void): unknown;
  off(ev: string, fn: () => void): unknown;
}

export function readRingTokens(): RingTokens {
  const cs = getComputedStyle(document.documentElement);
  return {
    fill: cs.getPropertyValue("--c-acc-fill").trim() || "rgba(94,138,168,0.12)",
    line: cs.getPropertyValue("--c-acc-line").trim() || "rgba(94,138,168,0.60)",
  };
}

interface RingState {
  accuracy: number;
  lat: number;
  handler: () => void;
  raf: number;
}
const states = new WeakMap<object, RingState>();

function detach(map: RingMap): void {
  const st = states.get(map);
  if (!st) return;
  map.off("zoom", st.handler);
  if (st.raf) cancelAnimationFrame(st.raf);
  states.delete(map);
}

/** Maintain the accuracy ring for the current view. Hidden unless gps with accuracy > 10 m. */
export function syncRing(map: RingMap, view: MapView, tokens: RingTokens): void {
  const radius = view.kind === "gps" ? ringRadiusPx(view.accuracy, view.lat, map.getZoom()) : null;
  if (view.kind !== "gps") {
    detach(map);
    if (map.getLayer(RING_LAYER)) map.removeLayer(RING_LAYER);
    return;
  }
  if (view.accuracy <= HIDE_AT_M) {
    detach(map);
    if (map.getLayer(RING_LAYER)) map.removeLayer(RING_LAYER);
    return;
  }
  const px = radius ?? MIN_PX;
  const data = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [view.lon, view.lat] } },
    ],
  };
  const src = map.getSource(RING_SOURCE) as { setData?: (d: unknown) => void } | undefined;
  if (src && src.setData) src.setData(data);
  else map.addSource(RING_SOURCE, { type: "geojson", data });
  if (!map.getLayer(RING_LAYER)) {
    map.addLayer({
      id: RING_LAYER,
      type: "circle",
      source: RING_SOURCE,
      paint: {
        "circle-radius": px,
        "circle-color": tokens.fill,
        "circle-stroke-width": 1,
        "circle-stroke-color": tokens.line,
        "circle-pitch-alignment": "map",
        "circle-pitch-scale": "map",
      },
    });
  } else {
    map.setPaintProperty(RING_LAYER, "circle-radius", px);
  }
  let st = states.get(map);
  if (!st) {
    const next: RingState = {
      accuracy: view.accuracy,
      lat: view.lat,
      raf: 0,
      handler: () => {
        if (next.raf) return;
        next.raf = requestAnimationFrame(() => {
          next.raf = 0;
          const r = ringRadiusPx(next.accuracy, next.lat, map.getZoom());
          if (r !== null && map.getLayer(RING_LAYER)) map.setPaintProperty(RING_LAYER, "circle-radius", r);
        });
      },
    };
    map.on("zoom", next.handler);
    states.set(map, next);
    st = next;
  }
  st.accuracy = view.accuracy;
  st.lat = view.lat;
}
