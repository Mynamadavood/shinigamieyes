import { nowMs, setOffset } from "./clock";
import { pad2 } from "./format";
import { selectVisible } from "./model";
import { HttpError, applyLayer, fetchProfile, openStream } from "./net";
import type { StreamHandle } from "./net";
import { createLocation, haversineM, loadPlaces, loadSavedState, toParams } from "./location";
import type { LocationState } from "./location";
import { createConnectivity } from "./offgrid";
import { loadCachedProfile, loadLastSync, saveLastSync, saveProfile } from "./store";
import type { CachedProfile } from "./store";
import { startTicker } from "./ticker";
import { withTimeout } from "./timeout";
import type { Profile } from "./types";
import type { ConnState } from "./offgrid";
import { GPS_OFF_COPY, LocationSheet } from "./ui/location-sheet";
import { LocationStrip } from "./ui/location-strip";
import type { StripText } from "./ui/location-strip";
import { Drawer } from "./ui/drawer";
import { NextList } from "./ui/next-list";
import type { ListState } from "./ui/next-list";
import { OffgridBanner } from "./ui/offgrid-banner";
import { Readouts } from "./ui/readouts";
import { mountHero, shouldPlayHero } from "./ui/hero";
import { mountShell } from "./ui/shell";
import type { MapDeps, MapHandle } from "./map/types";
import { mapViewFor } from "./map/view";

export interface BootDeps {
  fetchImpl?: typeof fetch;
  EventSourceImpl?: new (url: string) => EventSource;
  now?: () => number;
  geolocation?: Geolocation;
  /** Lazy map chunk loader; default is a dynamic import so the map is off the cached-paint path. */
  mapLoader?: () => Promise<{ createMap: (d: MapDeps) => Promise<MapHandle | null> }>;
  /** Cold-open hero; default true. Tests disable it. */
  hero?: boolean;
}
export interface AppHandle {
  setLocationParams(params: URLSearchParams | null): void;
}

export const IDB_TIMEOUT_MS = 300;
const SAVE_DEBOUNCE_MS = 1000;
const PREVIOUS_LOCATION_M = 500;

/** Strip text per UI-SPEC location states. */
export function stripText(s: LocationState, p: Profile | null): StripText {
  if (s.mode === "pin") return { source: "PIN", label: s.pin?.label ?? "" };
  if (s.mode === "search") return { source: "PIN", label: s.search?.label ?? "" };
  if (s.gps === "off") return { source: "GPS off", label: "" };
  const fix = s.lastAccepted;
  if (!fix) return { source: "GPS", label: "locating..." };
  const loc = p?.location;
  if (
    !loc ||
    loc.source !== "gps" ||
    loc.lat === null ||
    loc.lon === null ||
    haversineM(loc.lat, loc.lon, fix.lat, fix.lon) > PREVIOUS_LOCATION_M
  ) {
    return { source: "GPS", label: "previous location" };
  }
  return { source: "GPS", label: loc.label ?? "current location" };
}

/** List state is derived every tick so it can never stick (WR-07). */
export function deriveListState(rowCount: number, hasProfile: boolean, conn: ConnState): ListState {
  if (rowCount > 0) return "ready";
  if (hasProfile) return "empty";
  if (conn === "offgrid") return "no-data-offline";
  return "loading";
}

/** Module-level so the hero plays at most once per page lifetime (UI-SPEC). */
let heroPlayed = false;
/** Test hook: forget that the hero has played. */
export function resetHeroPlayed(): void {
  heroPlayed = false;
}

const paramKey = (p: URLSearchParams | null): string => (p ? p.toString() : "");

/**
 * Which location a params key is for, coarse enough that a GPS profile still shows as
 * "previous location" after a move: pin:<place id>, search:<lat>,<lon>, gps, or none.
 */
export function locationIdentity(key: string): string {
  const q = new URLSearchParams(key);
  const place = q.get("place");
  if (place) return `pin:${place}`;
  if (q.get("src") === "search") return `search:${q.get("lat")},${q.get("lon")}`;
  if (q.has("lat")) return "gps";
  return "none";
}

/** Identity of a cached profile: from its stored params key, else (legacy) from its location. */
function cachedIdentity(c: CachedProfile): string | null {
  if (c.key !== null) return locationIdentity(c.key);
  const l = c.profile.location;
  if (l?.source === "pin") return l.place_id ? `pin:${l.place_id}` : null;
  if (l?.source === "gps") return "gps";
  if (l?.source === "default") return "none";
  return null; // a legacy search profile cannot be matched to its point
}

export async function boot(root: HTMLElement, deps: BootDeps = {}): Promise<AppHandle> {
  const wall = deps.now ?? Date.now;
  const slots = mountShell(root);
  // HUD-03: the hero takes no data and is never awaited, so it cannot delay the cached paint.
  const navType = (
    typeof performance !== "undefined" && performance.getEntriesByType
      ? (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)
      : undefined
  )?.type;
  if (deps.hero !== false && shouldPlayHero(navType, false, heroPlayed)) {
    heroPlayed = true;
    mountHero(
      root,
      { titleBar: slots.titleBar, titleText: slots.titleText },
      {
        reducedMotion:
          typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches,
      },
    );
  }
  const list = new NextList(slots.listHost);
  const drawer = new Drawer(slots.drawer);
  const readouts = new Readouts(slots.readoutsLeft, slots.readoutsRight);
  const conn = createConnectivity();
  const banner = new OffgridBanner(slots.bannerSlot, conn, wall);
  let profile: Profile | null = null;
  let params: URLSearchParams | null = null;
  let profileKey: string | null = null;
  let stream: StreamHandle | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let mapHandle: MapHandle | null = null;
  let mapViewKey = "";
  let inflight = false;
  let queued = false;

  list.setState("loading");
  const handle: AppHandle = {
    setLocationParams(p) {
      params = p;
      void refetch();
      stream?.reopen(p);
    },
  };

  const strip = new LocationStrip(slots.locationSlot, () => sheet.open());
  const sheet: LocationSheet = new LocationSheet(root, {
    onGps: () => loc.useGps(),
    onPlace: (pl) => loc.usePlace(pl),
    onSearch: (r) => loc.useSearch(r),
  });
  const geo: Geolocation =
    deps.geolocation ??
    (typeof navigator !== "undefined" && navigator.geolocation
      ? navigator.geolocation
      : ({
          getCurrentPosition: (_ok: unknown, err: (e: unknown) => void) => err({ code: 2 }),
        } as unknown as Geolocation));
  const loc = createLocation({
    geolocation: geo,
    now: deps.now,
    onChange: (p) => handle.setLocationParams(p),
    onGpsOff: () => sheet.open(GPS_OFF_COPY),
    onState: () => renderLocation(),
  });

  function renderLocation(): void {
    strip.set(stripText(loc.state(), profile));
    sheet.setActive(loc.state());
    syncMap();
  }

  /** Push the current location and profile into the map (if it has loaded). */
  function syncMap(): void {
    if (!mapHandle) return;
    const view = mapViewFor(loc.state(), profile);
    const key = JSON.stringify(view);
    if (key !== mapViewKey) {
      mapViewKey = key;
      mapHandle.setView(view);
    }
    mapHandle.setProfile(profile);
  }

  async function startMap(): Promise<void> {
    try {
      const loader = deps.mapLoader ?? (() => import("./map/map"));
      const { createMap } = await loader();
      const h = await createMap({
        host: slots.mapHost,
        controls: slots.controls,
        origin: location.origin,
        reducedMotion:
          typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches,
        // D-07: a dropped pin behaves like a search pin
        onLongPress: (p) => loc.useSearch({ lat: p.lat, lon: p.lon, label: "Dropped pin" }),
        onUseGps: () => loc.useGps(),
        onMapTap: () => drawer.collapse(),
      });
      if (!h) return;
      mapHandle = h;
      syncMap();
    } catch {
      /* the grid stays; no raw error ever shows (D-15) */
    }
  }

  function renderFooter(now: number): void {
    const d = new Date(now);
    slots.footer.textContent = `server ${pad2(d.getHours())}:${pad2(d.getMinutes())} · v0.1.0`;
  }

  function renderRows(now: number): void {
    const rows = selectVisible(profile, now);
    list.setState(deriveListState(rows.length, profile !== null, conn.state()));
    list.update(rows, now);
    readouts.update(rows, profile, now);
  }

  function render(): void {
    renderRows(nowMs());
  }

  const bootStart = Date.now();
  // (2) cached-first: IndexedDB is read before any network request is started.
  const [cached, lastSync, savedLoc] = await withTimeout(
    Promise.all([loadCachedProfile(), loadLastSync(), loadSavedState()]),
    IDB_TIMEOUT_MS,
    [null, null, undefined] as [CachedProfile | null, number | null, LocationState | undefined],
  );
  conn.seedSync(lastSync);
  // WR-W4: only adopt a cached profile fetched for the location being restored; a profile for
  // another place must never show under this one's label or have its frames merged into it
  const restoredKey = paramKey(toParams(savedLoc ?? { mode: "gps", gps: "locating" }));
  if (cached && cachedIdentity(cached) === locationIdentity(restoredKey)) {
    profile = cached.profile;
    // the exact key it was fetched for: stream frames merge only while params match it
    profileKey = cached.key;
    renderLocation();
    render();
  }
  void loadPlaces(deps.fetchImpl).then((l) => sheet.setPlaces(l));
  renderLocation();
  // location restore is an IndexedDB read only; the GPS fix itself never blocks anything
  // shares the single IDB_TIMEOUT_MS budget with the cached read, so first request <= ~300 ms
  await withTimeout(loc.start(), Math.max(0, IDB_TIMEOUT_MS - (Date.now() - bootStart)), undefined);

  // (3) ticker
  startTicker((now) => {
    renderRows(now);
    banner.refresh();
    renderFooter(now);
  });

  // (3b) map chunk: two frames after first paint, never awaited by boot (RESEARCH Pattern 9)
  requestAnimationFrame(() => requestAnimationFrame(() => void startMap()));

  // (4) live fetch
  async function refetch(): Promise<void> {
    if (inflight) {
      queued = true;
      return;
    }
    inflight = true;
    const key = paramKey(params);
    try {
      const { profile: p, offsetMs } = await fetchProfile(params, {
        timeoutMs: 4000,
        fetchImpl: deps.fetchImpl,
      });
      if (paramKey(params) !== key) return; // location changed mid-flight; newer fetch is queued
      setOffset(offsetMs);
      profile = p;
      profileKey = key;
      renderLocation();
      const t = wall();
      void saveProfile(p, key);
      void saveLastSync(t);
      conn.markOnline(t);
      render();
    } catch (e) {
      if (e instanceof HttpError) {
        if (e.status === 422 && loc.state().mode === "pin") loc.useGps();
      } else {
        conn.markOffgrid();
      }
      render();
    } finally {
      inflight = false;
      if (queued) {
        queued = false;
        void refetch();
      }
    }
  }

  function scheduleSave(): void {
    if (saveTimer !== undefined) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (profile && profileKey !== null) void saveProfile(profile, profileKey);
    }, SAVE_DEBOUNCE_MS);
  }

  if (!inflight) void refetch();

  // (5) stream
  stream = openStream(
    params,
    {
      onHello: () => {
        const t = wall();
        conn.markOnline(t);
        void saveLastSync(t);
      },
      onLayer: (layer) => {
        // frames for another location must never merge into this profile (WR-04, WR-W4)
        if (!profile || profileKey === null || paramKey(params) !== profileKey) {
          void refetch();
          return;
        }
        profile = applyLayer(profile, layer);
        syncMap();
        render();
        scheduleSave();
      },
      onDead: () => void refetch(),
    },
    { EventSourceImpl: deps.EventSourceImpl },
  );

  // (6) foregrounding: stream reconnect is handled inside openStream
  const resume = () => {
    if (!document.hidden) void refetch();
  };
  document.addEventListener("visibilitychange", resume);
  window.addEventListener("pageshow", resume);
  window.addEventListener("online", resume);

  return handle;
}
