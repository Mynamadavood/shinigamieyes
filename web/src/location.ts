import { get, set } from "idb-keyval";
import { withTimeout } from "./timeout";

// Location state machine (D-08, D-10): GPS on open and on return to the app, accepted only
// after moving ~100 m; manual pin via saved places. Render never waits on GPS. No continuous
// watch, and no Permissions API (reported inconsistent on iOS standalone).

export type GpsStatus = "locating" | "live" | "off";
export interface LocationState {
  mode: "gps" | "pin" | "search";
  pin?: { id: string; label: string };
  search?: { lat: number; lon: number; label: string };
  lastAccepted?: { lat: number; lon: number; ts: number };
  /** Every successful fix (not gated by the 100 m hysteresis); accuracy in metres. */
  lastFix?: { lat: number; lon: number; ts: number; accuracy: number };
  gps: GpsStatus;
}
export interface PlaceRef {
  id: string;
  label: string;
}
export interface LocationDeps {
  geolocation: Geolocation;
  onChange(params: URLSearchParams | null, s: LocationState): void;
  onGpsOff(): void;
  onState?(s: LocationState): void;
  now?: () => number;
}
export interface LocationController {
  start(): Promise<void>;
  requestFix(): void;
  useGps(): void;
  usePlace(p: PlaceRef): void;
  useSearch(r: { lat: number; lon: number; label: string }): void;
  state(): LocationState;
}

const STATE_KEY = "location:state";
const PLACES_KEY = "places:list";
export const HYSTERESIS_M = 100;
const STATE_READ_TIMEOUT_MS = 300;
const EARTH_R = 6371008.8;
const GEO_OPTS: PositionOptions = { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 };

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dphi = (lat2 - lat1) * rad;
  const dlmb = (lon2 - lon1) * rad;
  const a =
    Math.sin(dphi / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dlmb / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(a));
}

const r5 = (n: number): string => n.toFixed(5);

export function toParams(s: LocationState): URLSearchParams | null {
  if (s.mode === "pin") return s.pin ? new URLSearchParams({ place: s.pin.id }) : null;
  if (s.mode === "search") {
    if (!s.search) return null;
    return new URLSearchParams({
      lat: r5(s.search.lat),
      lon: r5(s.search.lon),
      src: "search",
      label: s.search.label.slice(0, 120),
    });
  }
  if (!s.lastAccepted) return null;
  return new URLSearchParams({ lat: r5(s.lastAccepted.lat), lon: r5(s.lastAccepted.lon) });
}

async function persist(s: LocationState): Promise<void> {
  try {
    await set(STATE_KEY, s);
  } catch {
    /* private mode / eviction */
  }
}

/** The persisted location state, or undefined (missing, invalid, unreadable or slow). */
export async function loadSavedState(): Promise<LocationState | undefined> {
  try {
    const saved = (await withTimeout(get(STATE_KEY), STATE_READ_TIMEOUT_MS, undefined)) as
      | LocationState
      | undefined;
    if (saved && (saved.mode === "gps" || saved.mode === "pin" || saved.mode === "search")) return saved;
  } catch {
    /* use default */
  }
  return undefined;
}

export function createLocation(deps: LocationDeps): LocationController {
  const clock = deps.now ?? Date.now;
  let s: LocationState = { mode: "gps", gps: "locating" };
  let warned = false;
  let listening = false;
  let pending = false;

  function changed(): void {
    void persist(s);
    deps.onChange(toParams(s), s);
    deps.onState?.(s);
  }

  function fix(force: boolean): void {
    if (pending && !force) return;
    pending = true;
    deps.geolocation.getCurrentPosition(
      (pos) => {
        pending = false;
        if (s.mode !== "gps") return;
        const { latitude: lat, longitude: lon } = pos.coords;
        const last = s.lastAccepted;
        const moved = !last || haversineM(last.lat, last.lon, lat, lon) >= HYSTERESIS_M;
        s = { ...s, gps: "live", lastFix: { lat, lon, ts: clock(), accuracy: pos.coords.accuracy } };
        if (force || moved) {
          s.lastAccepted = { lat, lon, ts: clock() };
          changed();
        } else {
          void persist(s);
          deps.onState?.(s);
        }
      },
      (err) => {
        pending = false;
        if (s.mode !== "gps") return;
        // TIMEOUT / POSITION_UNAVAILABLE are transient: keep "locating"/"live", retry on next foreground
        if (err.code !== 1) {
          deps.onState?.(s);
          return;
        }
        s = { ...s, gps: "off" };
        void persist(s);
        deps.onState?.(s);
        if (!warned) {
          warned = true;
          deps.onGpsOff();
        }
      },
      GEO_OPTS,
    );
  }

  function fixIfGps(): void {
    if (s.mode === "gps") fix(false);
  }

  return {
    async start() {
      const saved = await loadSavedState();
      if (saved) s = { ...saved, gps: "locating" };
      if (!listening) {
        listening = true;
        document.addEventListener("visibilitychange", () => {
          if (!document.hidden) fixIfGps();
        });
      }
      const p = toParams(s);
      if (p) deps.onChange(p, s);
      deps.onState?.(s);
      fixIfGps();
    },
    requestFix: fixIfGps,
    useGps() {
      s = { ...s, mode: "gps", gps: "locating" };
      changed();
      fix(true);
    },
    usePlace(p) {
      s = { ...s, mode: "pin", pin: { id: p.id, label: p.label } };
      changed();
    },
    useSearch(r) {
      s = { ...s, mode: "search", search: { ...r } };
      changed();
    },
    state: () => s,
  };
}

export async function loadPlaces(fetchImpl: typeof fetch = fetch): Promise<PlaceRef[]> {
  try {
    const res = await fetchImpl("/api/places", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const list = (await res.json()) as PlaceRef[];
    try {
      await set(PLACES_KEY, list);
    } catch {
      /* ignore */
    }
    return list;
  } catch {
    try {
      return ((await get(PLACES_KEY)) as PlaceRef[] | undefined) ?? [];
    } catch {
      return [];
    }
  }
}
