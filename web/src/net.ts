import { measureOffset } from "./clock";
import type { Layer, Profile } from "./types";

export async function fetchProfile(
  params: URLSearchParams | null,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<{ profile: Profile; offsetMs: number }> {
  const timeoutMs = opts.timeoutMs ?? 4000;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const qs = params && params.toString() ? `?${params.toString()}` : "";
    const tSend = Date.now();
    const f = opts.fetchImpl ?? fetch;
    const res = await f(`/api/profile${qs}`, { signal: ctl.signal });
    const tRecv = Date.now();
    if (!res.ok) throw new Error(`profile HTTP ${res.status}`);
    const profile = (await res.json()) as Profile;
    return { profile, offsetMs: measureOffset(profile.server_time, tSend, tRecv) };
  } finally {
    clearTimeout(timer);
  }
}

/** Pure whole-layer replace; ignores stale (older rev) updates. */
export function applyLayer(profile: Profile, layer: Layer): Profile {
  const existing = profile.layers[layer.id];
  if (existing && layer.rev < existing.rev) return profile;
  return { ...profile, layers: { ...profile.layers, [layer.id]: layer } };
}

const WATCHDOG_MS = 40_000;

export interface StreamHandlers {
  onHello(serverTime: number): void;
  onLayer(layer: Layer): void;
  onDead(): void;
}
export interface StreamHandle {
  close(): void;
  reopen(params: URLSearchParams | null): void;
}
type ESCtor = new (url: string) => EventSource;

/**
 * SSE client. iOS silently kills sockets when backgrounded, so recreate on
 * visible/pageshow/online and run a 40 s watchdog (server pings every 15 s).
 */
export function openStream(
  initial: URLSearchParams | null,
  h: StreamHandlers,
  deps: { EventSourceImpl?: ESCtor } = {},
): StreamHandle {
  const ES: ESCtor = deps.EventSourceImpl ?? (globalThis.EventSource as ESCtor);
  let params = initial;
  let es: EventSource | null = null;
  let dog: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const kick = () => {
    if (dog !== undefined) clearTimeout(dog);
    dog = setTimeout(() => {
      if (closed) return;
      connect();
      h.onDead();
    }, WATCHDOG_MS);
  };

  const connect = () => {
    es?.close();
    const qs = params && params.toString() ? `?${params.toString()}` : "";
    const src = new ES(`/api/stream${qs}`);
    es = src;
    src.addEventListener("hello", (e) => {
      kick();
      try {
        h.onHello((JSON.parse((e as MessageEvent).data) as { server_time: number }).server_time);
      } catch {
        /* malformed frame */
      }
    });
    src.addEventListener("layer", (e) => {
      kick();
      try {
        h.onLayer(JSON.parse((e as MessageEvent).data) as Layer);
      } catch {
        /* malformed frame */
      }
    });
    src.addEventListener("ping", kick);
    kick();
  };

  const resume = () => {
    if (closed || document.hidden) return;
    connect();
  };
  document.addEventListener("visibilitychange", resume);
  window.addEventListener("pageshow", resume);
  window.addEventListener("online", resume);
  connect();

  return {
    close() {
      closed = true;
      es?.close();
      if (dog !== undefined) clearTimeout(dog);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("online", resume);
    },
    reopen(p) {
      params = p;
      if (!closed) connect();
    },
  };
}
