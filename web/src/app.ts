import { nowMs, setOffset } from "./clock";
import { pad2 } from "./format";
import { selectVisible } from "./model";
import { applyLayer, fetchProfile, openStream } from "./net";
import type { StreamHandle } from "./net";
import { createLocation, haversineM, loadPlaces } from "./location";
import type { LocationState } from "./location";
import { createConnectivity } from "./offgrid";
import { loadLastSync, loadProfile, saveLastSync, saveProfile } from "./store";
import { startTicker } from "./ticker";
import type { Profile } from "./types";
import { GPS_OFF_COPY, LocationSheet } from "./ui/location-sheet";
import { LocationStrip } from "./ui/location-strip";
import type { StripText } from "./ui/location-strip";
import { NextList } from "./ui/next-list";
import { OffgridBanner } from "./ui/offgrid-banner";
import { mountShell } from "./ui/shell";

export interface BootDeps {
  fetchImpl?: typeof fetch;
  EventSourceImpl?: new (url: string) => EventSource;
  now?: () => number;
  geolocation?: Geolocation;
}
export interface AppHandle {
  setLocationParams(params: URLSearchParams | null): void;
}

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

const paramKey = (p: URLSearchParams | null): string => (p ? p.toString() : "");

export async function boot(root: HTMLElement, deps: BootDeps = {}): Promise<AppHandle> {
  const wall = deps.now ?? Date.now;
  const slots = mountShell(root);
  const list = new NextList(slots.listHost);
  const conn = createConnectivity();
  const banner = new OffgridBanner(slots.bannerSlot, conn, wall);
  let profile: Profile | null = null;
  let params: URLSearchParams | null = null;
  let stream: StreamHandle | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
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
  }

  function renderFooter(now: number): void {
    const d = new Date(now);
    slots.footer.textContent = `server ${pad2(d.getHours())}:${pad2(d.getMinutes())} · v0.1.0`;
  }

  function render(): void {
    const now = nowMs();
    list.update(selectVisible(profile, now), now);
  }

  // (2) cached-first: IndexedDB is read before any network request is started.
  const [cached, lastSync] = await Promise.all([loadProfile(), loadLastSync()]);
  conn.seedSync(lastSync);
  if (cached) {
    profile = cached;
    renderLocation();
    render();
  }
  void loadPlaces(deps.fetchImpl).then((l) => sheet.setPlaces(l));
  renderLocation();
  // location restore is an IndexedDB read only; the GPS fix itself never blocks anything
  await loc.start();

  // (3) ticker
  startTicker((now) => {
    list.update(selectVisible(profile, now), now);
    banner.refresh();
    renderFooter(now);
  });

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
      renderLocation();
      const t = wall();
      void saveProfile(p);
      void saveLastSync(t);
      conn.markOnline(t);
      const rows = selectVisible(profile, nowMs());
      list.setState(rows.length > 0 ? "ready" : "empty");
      render();
    } catch {
      conn.markOffgrid();
      if (!profile) list.setState("no-data-offline");
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
      if (profile) void saveProfile(profile);
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
        if (!profile) {
          void refetch();
          return;
        }
        profile = applyLayer(profile, layer);
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
