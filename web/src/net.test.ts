import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyLayer, fetchProfile, openStream as rawOpen } from "./net";
import type { StreamHandle } from "./net";
import type { Layer, Profile } from "./types";

const lay = (id: string, rev: number): Layer => ({
  id, status: "fresh", rev, as_of: 1, attribution: "", items: [],
});
const prof = (layers: Layer[]): Profile => ({
  server_time: 1, rev: 1,
  location: { source: "default", lat: null, lon: null },
  layers: Object.fromEntries(layers.map((l) => [l.id, l])),
});

class FakeES {
  static all: FakeES[] = [];
  closed = false;
  handlers: Record<string, ((e: MessageEvent) => void)[]> = {};
  constructor(public url: string) { FakeES.all.push(this); }
  addEventListener(t: string, f: (e: MessageEvent) => void) { (this.handlers[t] ??= []).push(f); }
  close() { this.closed = true; }
  emit(t: string, data: unknown) {
    for (const f of this.handlers[t] ?? []) f({ data: JSON.stringify(data) } as MessageEvent);
  }
}
const ES = FakeES as unknown as new (u: string) => EventSource;
const handlers = () => ({ onHello: vi.fn(), onLayer: vi.fn(), onDead: vi.fn() });

const opened: StreamHandle[] = [];
const openStream: typeof rawOpen = (...a) => { const s = rawOpen(...a); opened.push(s); return s; };
beforeEach(() => { vi.useFakeTimers(); FakeES.all = []; });
afterEach(() => { opened.splice(0).forEach((s) => s.close()); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("applyLayer", () => {
  it("replaces on newer or equal rev, ignores older, adds new, does not mutate", () => {
    const p = prof([lay("a", 5)]);
    const n = applyLayer(p, lay("a", 6));
    expect(n.layers.a.rev).toBe(6);
    expect(p.layers.a.rev).toBe(5);
    expect(applyLayer(n, lay("a", 4)).layers.a.rev).toBe(6);
    expect(applyLayer(n, lay("a", 6))).not.toBe(n);
    expect(applyLayer(p, lay("b", 1)).layers.b).toBeDefined();
  });
});

describe("openStream", () => {
  it("dispatches hello and layer", () => {
    const h = handlers();
    openStream(null, h, { EventSourceImpl: ES });
    FakeES.all[0].emit("hello", { server_time: 7, rev: 1 });
    FakeES.all[0].emit("layer", lay("a", 1));
    expect(h.onHello).toHaveBeenCalledWith(7);
    expect(h.onLayer).toHaveBeenCalledWith(lay("a", 1));
  });
  it("watchdog recreates after 40 s of silence and calls onDead once", () => {
    const h = handlers();
    openStream(null, h, { EventSourceImpl: ES });
    vi.advanceTimersByTime(39_000);
    expect(FakeES.all).toHaveLength(1);
    vi.advanceTimersByTime(1_500);
    expect(FakeES.all).toHaveLength(2);
    expect(FakeES.all[0].closed).toBe(true);
    expect(h.onDead).toHaveBeenCalledTimes(1);
  });
  it("ping resets the watchdog", () => {
    const h = handlers();
    openStream(null, h, { EventSourceImpl: ES });
    vi.advanceTimersByTime(30_000);
    FakeES.all[0].emit("ping", "x");
    vi.advanceTimersByTime(30_000);
    expect(FakeES.all).toHaveLength(1);
  });
  it.each([
    ["document", "visibilitychange"],
    ["window", "pageshow"],
    ["window", "online"],
  ])("recreates on %s %s", (target, ev) => {
    const s = openStream(null, handlers(), { EventSourceImpl: ES });
    (target === "document" ? document : window).dispatchEvent(new Event(ev));
    expect(FakeES.all).toHaveLength(2);
    expect(FakeES.all[0].closed).toBe(true);
    s.close();
  });
  it("does not reconnect while hidden", () => {
    const s = openStream(null, handlers(), { EventSourceImpl: ES });
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(FakeES.all).toHaveLength(1);
    s.close();
  });
  it("reopen uses the new query string", () => {
    const s = openStream(null, handlers(), { EventSourceImpl: ES });
    expect(FakeES.all[0].url).toBe("/api/stream");
    s.reopen(new URLSearchParams({ lat: "-37.8", lon: "144.9" }));
    expect(FakeES.all[0].closed).toBe(true);
    expect(FakeES.all[1].url).toBe("/api/stream?lat=-37.8&lon=144.9");
    s.close();
  });
});

describe("fetchProfile", () => {
  it("aborts after 4000 ms", async () => {
    const fetchImpl = ((_u: string, init: RequestInit) =>
      new Promise((_r, rej) =>
        init.signal!.addEventListener("abort", () => rej(new Error("abort"))),
      )) as unknown as typeof fetch;
    const p = fetchProfile(null, { fetchImpl });
    const assertion = expect(p).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(4001);
    await assertion;
  });
});
