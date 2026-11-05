export type ConnState = "unknown" | "online" | "offgrid";

export interface Connectivity {
  state(): ConnState;
  markOnline(syncMs: number): void;
  markOffgrid(): void;
  /** Seed the last-sync time from the device cache without changing state. */
  seedSync(syncMs: number | null): void;
  lastSyncMs(): number | null;
  subscribe(fn: () => void): () => void;
}

/** Failure-driven connectivity (fetch/SSE outcomes). Never consults the browser online flag. */
export function createConnectivity(): Connectivity {
  let st: ConnState = "unknown";
  let last: number | null = null;
  const subs = new Set<() => void>();
  const emit = () => subs.forEach((f) => f());
  return {
    state: () => st,
    markOnline(syncMs) {
      const changed = st !== "online";
      st = "online";
      last = syncMs;
      if (changed) emit();
    },
    markOffgrid() {
      if (st === "offgrid") return;
      st = "offgrid";
      emit();
    },
    seedSync(ms) {
      if (ms !== null) last = ms;
    },
    lastSyncMs: () => last,
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}
