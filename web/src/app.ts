import { nowMs, setOffset } from "./clock";
import { pad2 } from "./format";
import { selectVisible } from "./model";
import { applyLayer, fetchProfile, openStream } from "./net";
import type { StreamHandle } from "./net";
import { createConnectivity } from "./offgrid";
import { loadLastSync, loadProfile, saveLastSync, saveProfile } from "./store";
import { startTicker } from "./ticker";
import type { Profile } from "./types";
import { NextList } from "./ui/next-list";
import { OffgridBanner } from "./ui/offgrid-banner";
import { mountShell } from "./ui/shell";

export interface BootDeps {
  fetchImpl?: typeof fetch;
  EventSourceImpl?: new (url: string) => EventSource;
  now?: () => number;
}
export interface AppHandle {
  setLocationParams(params: URLSearchParams | null): void;
}

const SAVE_DEBOUNCE_MS = 1000;

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

  list.setState("loading");

  function renderLocation(p: Profile): void {
    const src = document.createElement("span");
    src.className = "loc-source";
    src.textContent = p.location.source.toUpperCase();
    const lbl = document.createElement("span");
    lbl.className = "loc-label";
    lbl.textContent = p.location.label ?? "";
    slots.locationSlot.replaceChildren(src, lbl);
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
    renderLocation(cached);
    render();
  }

  // (3) ticker
  startTicker((now) => {
    list.update(selectVisible(profile, now), now);
    banner.refresh();
    renderFooter(now);
  });

  // (4) live fetch
  async function refetch(): Promise<void> {
    if (inflight) return;
    inflight = true;
    try {
      const { profile: p, offsetMs } = await fetchProfile(params, {
        timeoutMs: 4000,
        fetchImpl: deps.fetchImpl,
      });
      setOffset(offsetMs);
      profile = p;
      renderLocation(p);
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
    }
  }

  function scheduleSave(): void {
    if (saveTimer !== undefined) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (profile) void saveProfile(profile);
    }, SAVE_DEBOUNCE_MS);
  }

  void refetch();

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

  return {
    setLocationParams(p) {
      params = p;
      void refetch();
      stream?.reopen(p);
    },
  };
}
