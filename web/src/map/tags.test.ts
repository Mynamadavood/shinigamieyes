import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nowMs, setOffset } from "../clock";
import { MAX_FULL, MAX_TOTAL, NEAR_M, RED_CAP, EXPAND_ZOOM, MAX_VEHICLES, GLIDE_MS, JUMP_M, FADE_AFTER_S, REMOVE_AFTER_S, assignTags, labelSide, rankTags, TagLayer, type TagCand } from "./tags";

function cand(i: number, p: Partial<TagCand> = {}): TagCand {
  return { id: `c${i}`, x: i * 300, y: 0, dist: 100 + i, label: "Camera", icon: "cctv", prio: 2, ...p };
}
const many = (n: number) => Array.from({ length: n }, (_, i) => cand(i));

describe("constants", () => {
  it("match the contract", () => {
    expect([MAX_FULL, MAX_TOTAL, NEAR_M, RED_CAP, EXPAND_ZOOM]).toEqual([20, 60, 30, 3, 17.5]);
  });
});

describe("rankTags", () => {
  it("puts <= 30 m first, then ascending distance", () => {
    const r = rankTags([cand(1, { dist: 200 }), cand(2, { dist: 30 }), cand(3, { dist: 50 }), cand(4, { dist: 5 })]);
    expect(r.map((c) => c.dist)).toEqual([5, 30, 50, 200]);
  });
});

describe("assignTags", () => {
  it("caps labelled tags at 20", () => {
    const r = assignTags(rankTags(many(30)), 18);
    expect(r.full.size).toBe(20);
  });
  it("renders at most 60, nearest kept", () => {
    const ranked = rankTags(many(70));
    const r = assignTags(ranked, 18);
    expect(r.rendered).toHaveLength(60);
    expect(r.rendered.map((c) => c.id)).toEqual(ranked.slice(0, 60).map((c) => c.id));
  });
  it("demotes an overlapping lower-ranked label to compact", () => {
    const a = cand(0, { x: 100, y: 100, dist: 40 });
    const b = cand(1, { x: 150, y: 110, dist: 50 });
    const r = assignTags(rankTags([a, b]), 18);
    expect(r.full.has(a.id)).toBe(true);
    expect(r.full.has(b.id)).toBe(false);
    expect(r.rendered).toHaveLength(2);
  });
  it("reds only the 3 nearest within 30 m", () => {
    const five = Array.from({ length: 5 }, (_, i) => cand(i, { dist: 5 + i * 5 }));
    const r = assignTags(rankTags(five), 18);
    expect([...r.red].sort()).toEqual(["c0", "c1", "c2"]);
  });
  it("expands compact tags only at zoom >= 17.5, never past 20 labels", () => {
    const ranked = rankTags(many(30));
    const lo = assignTags(ranked, 17);
    const hi = assignTags(ranked, 17.5);
    expect(lo.full.size).toBeLessThan(hi.full.size);
    expect(hi.full.size).toBeLessThanOrEqual(20);
    expect(lo.rendered).toHaveLength(30);
  });
  it("renders only 6 compact tags per 96 px cluster", () => {
    const pile = Array.from({ length: 12 }, (_, i) => cand(i, { x: 500 + i, y: 500, dist: 100 + i }));
    const r = assignTags(rankTags(pile), 17);
    const compact = r.rendered.filter((c) => !r.full.has(c.id));
    expect(compact).toHaveLength(6);
    expect(compact.map((c) => c.id)).toEqual(["c1", "c2", "c3", "c4", "c5", "c6"]);
  });
});

describe("TagLayer server origin", () => {
  const mk = (id: string, x: number, detail: Record<string, unknown>): any => ({
    id, layer: "cameras_cctv", group: "cctv", name: "Camera", verb: "", target_ts: null, kind: "static",
    severity: 0, detail, geom: { type: "Point", coordinates: [144.9 + x, -37.8] },
    fetched_at: 0, stale_after_s: null, computed: true,
  });
  const setup = () => {
    const added: HTMLElement[] = [];
    const marker: any = { setLngLat: () => marker, addTo: () => marker, remove: () => marker };
    const layer = new TagLayer({
      map: { project: (l) => ({ x: l[0] * 1000, y: 0 }), getZoom: () => 15, on: vi.fn() },
      card: { isOpen: () => false, update: vi.fn(), close: vi.fn(), open: vi.fn() } as any,
      createMarker: (el) => {
        added.push(el);
        return marker;
      },
    });
    return { layer, added };
  };

  it("uses detail.distance_m for rank and red, and skips items without it", () => {
    const { layer, added } = setup();
    layer.setOrigin("server");
    layer.update([mk("a", 0.001, { distance_m: 10 }), mk("b", 0.01, { distance_m: 200 }), mk("c", 0.02, {})]);
    expect(added).toHaveLength(2);
    expect(added.filter((e) => e.classList.contains("near"))).toHaveLength(1);
    expect(added[0].getAttribute("aria-label")).toContain("10 metres");
  });
});

describe("labelSide", () => {
  it("keeps the label on the right when it fits", () => {
    expect(labelSide(100, 120, 390)).toBe("right");
  });
  it("flips left near the right edge", () => {
    expect(labelSide(330, 120, 390)).toBe("left");
  });
  it("does not flip when neither side fits", () => {
    expect(labelSide(40, 360, 390)).toBe("right");
  });
  it("falls back to the CSS max width", () => {
    expect(labelSide(330, 0, 390)).toBe("left");
    expect(labelSide(100, 0, 390)).toBe("right");
  });
});

describe("TagLayer flip and guard", () => {
  const mk = (id: string, lon: number, group = "cctv"): any => ({
    id, layer: "cameras_cctv", group, name: "Camera", verb: "", target_ts: null, kind: "static",
    severity: 0, detail: { distance_m: 100 }, geom: { type: "Point", coordinates: [lon, -37.8] },
    fetched_at: 0, stale_after_s: null, computed: true,
  });
  const setup = (zoom = 15) => {
    const added: HTMLElement[] = [];
    const marker: any = { setLngLat: () => marker, addTo: () => marker, remove: () => marker };
    const layer = new TagLayer({
      map: { project: (l) => ({ x: l[0], y: 0 }), getZoom: () => zoom, on: vi.fn() },
      card: { isOpen: () => false, update: vi.fn(), close: vi.fn(), open: vi.fn() } as any,
      createMarker: (el) => {
        added.push(el);
        return marker;
      },
      viewportWidth: () => 390,
    });
    layer.setOrigin("server");
    return { layer, added };
  };

  it("flips only the full tag near the right edge", () => {
    const { layer, added } = setup();
    layer.update([mk("a", 340), mk("b", 100)]);
    const byX = (x: number) => added[x];
    expect(byX(0).classList.contains("full")).toBe(true);
    expect(byX(0).classList.contains("flip")).toBe(true);
    expect(byX(1).classList.contains("flip")).toBe(false);
  });

  it("never flips a compact tag", () => {
    const { layer, added } = setup();
    // same spot: the second overlaps the first and is demoted to compact
    layer.update([mk("a", 340), mk("b", 341)]);
    const compact = added.find((e) => e.classList.contains("compact"))!;
    expect(compact.classList.contains("flip")).toBe(false);
  });

  it("announces guard posts", () => {
    const { layer, added } = setup();
    layer.update([mk("g", 100, "guard")]);
    expect(added[0].getAttribute("aria-label")).toMatch(/^Guard post, /);
  });
});

describe("stops and priority", () => {
  const stop = (i: number, p: Partial<TagCand> = {}): TagCand =>
    ({ id: `s${i}`, x: i * 10, y: 0, dist: 50 + i, label: "Stop", icon: "stop-tram", prio: 0, ...p });

  it("ranks by prio first", () => {
    const r = rankTags([cand(1, { dist: 5 }), stop(1, { dist: 300 })]);
    expect(r.map((c) => c.id)).toEqual(["s1", "c1"]);
  });
  it("never demotes stops, even overlapping or past the cap", () => {
    const stops = Array.from({ length: 12 }, (_, i) => stop(i, { x: 100, y: 100 }));
    const r = assignTags(rankTags(stops), 15);
    expect(r.full.size).toBe(12);
    expect(r.red.size).toBe(0);
  });
  it("demotes a camera overlapping a 40px stop box vertically", () => {
    const s = stop(0, { x: 100, y: 100 });
    const near = cand(1, { x: 100, y: 138, dist: 100 });
    const clear = cand(2, { x: 100, y: 145, dist: 100 });
    const r = assignTags(rankTags([s, near, clear]), 18);
    expect(r.full.has("c1")).toBe(false);
    expect(r.full.has("c2")).toBe(true);
  });
  it("never demotes a red within-30 m camera overlapping a stop or a vehicle (WR-W6)", () => {
    const s = stop(0, { x: 100, y: 100 });
    const v: TagCand = { id: "v", x: 300, y: 300, dist: 80, label: "96", icon: "veh-tram", prio: 1 };
    const underStop = cand(1, { x: 120, y: 110, dist: 12 });
    const underVeh = cand(2, { x: 310, y: 305, dist: 20 });
    const plain = cand(3, { x: 130, y: 105, dist: 60 });
    const r = assignTags(rankTags([s, v, underStop, underVeh, plain]), 15);
    expect(r.red.has("c1") && r.red.has("c2")).toBe(true);
    expect(r.full.has("c1")).toBe(true);
    expect(r.full.has("c2")).toBe(true);
    // a camera beyond 30 m is still demoted by the overlap
    expect(r.full.has("c3")).toBe(false);
  });
  it("keeps within-30 m red cameras labelled when stops use the cap", () => {
    const stops = Array.from({ length: 10 }, (_, i) => stop(i, { x: i * 300, y: 500 }));
    const cams = Array.from({ length: 3 }, (_, i) => cand(i, { x: i * 300, y: 0, dist: 5 + i }));
    const r = assignTags(rankTags([...stops, ...cams]), 15);
    expect([...r.red].sort()).toEqual(["c0", "c1", "c2"]);
    for (const id of r.red) expect(r.full.has(id)).toBe(true);
  });
});

describe("TagLayer stops", () => {
  const stopItem = (extra: Record<string, unknown> = {}): any => ({
    id: "stop:2720", layer: "transit_stops", group: "tram", name: "Bourke Street Mall/Elizabeth St #3",
    verb: "", target_ts: null, kind: "infrastructure", severity: 0,
    detail: { mode: "tram", stop_id: 2720, distance_m: 27, walk_s: 25, routes: ["96"], ...extra },
    geom: { type: "Point", coordinates: [100, -37.8] }, fetched_at: 0, stale_after_s: null, computed: true,
  });
  const setup = () => {
    const added: HTMLElement[] = [];
    const marker: any = { setLngLat: () => marker, addTo: () => marker, remove: () => marker };
    const open = vi.fn();
    const layer = new TagLayer({
      map: { project: (l) => ({ x: l[0], y: 0 }), getZoom: () => 15, on: vi.fn() },
      card: { isOpen: () => false, update: vi.fn(), close: vi.fn(), open } as any,
      createMarker: (el) => {
        added.push(el);
        return marker;
      },
      viewportWidth: () => 390,
    });
    return { layer, added, open };
  };

  it("renders a full stop tag with name, meta and aria-label", () => {
    const { layer, added } = setup();
    layer.setOrigin("server");
    layer.update([stopItem()]);
    const el = added[0];
    expect(el.classList.contains("stop")).toBe(true);
    expect(el.classList.contains("full")).toBe(true);
    expect(el.classList.contains("near")).toBe(false);
    expect(el.querySelector(".stop-name")!.textContent).toBe("Bourke St Mall");
    expect(el.querySelector(".stop-meta")!.textContent).toBe("27 m · 1 min");
    expect(el.getAttribute("aria-label")).toBe(
      "Tram stop, Bourke Street Mall/Elizabeth St #3, 27 metres away, 1 minute walk",
    );
  });
  it("never marks a stop near, even within 30 m", () => {
    const { layer, added } = setup();
    layer.setOrigin("server");
    layer.update([stopItem({ distance_m: 3 })]);
    expect(added[0].classList.contains("near")).toBe(false);
  });
  it("uses live distance and walk for a GPS origin", () => {
    const { layer, added } = setup();
    layer.setOrigin({ lat: -37.8, lon: 99.99 });
    layer.update([stopItem()]);
    expect(added[0].querySelector(".stop-meta")!.textContent).toBe("879 m · 14 min");
  });
  it("skips none and summary items", () => {
    const { layer, added } = setup();
    layer.setOrigin("server");
    layer.update([stopItem({ none: true }), stopItem({ summary: true })]);
    expect(added).toHaveLength(0);
  });
  it("openById opens the stop card; unknown id returns false", () => {
    const { layer, open } = setup();
    layer.setOrigin("server");
    layer.update([stopItem()]);
    expect(layer.openById("stop:2720")).toBe(true);
    const content = open.mock.calls[0][1];
    expect(content.title).toBe("TRAM STOP");
    expect(content.primary).toBe("Bourke Street Mall/Elizabeth St #3");
    expect(content.extra).toBe("27 m · 1 min walk");
    expect(content.caveats).toEqual(["Source: PTV"]);
    expect(layer.openById("nope")).toBe(false);
  });
  const withCard = (replace: ReturnType<typeof vi.fn>) => {
    const marker: any = { setLngLat: () => marker, addTo: () => marker, remove: () => marker };
    return new TagLayer({
      map: { project: (l) => ({ x: l[0], y: 0 }), getZoom: () => 15, on: vi.fn() },
      card: { isOpen: () => true, update: vi.fn(), close: vi.fn(), open: vi.fn(), replace } as any,
      createMarker: () => marker,
      viewportWidth: () => 390,
    });
  };
  it("setCardContext re-renders an open stop card only", () => {
    const replace = vi.fn();
    const layer = withCard(replace);
    layer.setOrigin("server");
    layer.update([stopItem()]);
    layer.setCardContext({ ptvState: "ok" });
    expect(replace).not.toHaveBeenCalled();
    layer.openById("stop:2720");
    layer.setCardContext({ ptvState: "no_key" });
    expect(replace).toHaveBeenCalledTimes(1);
    const c = replace.mock.calls[0][0];
    expect(c.title).toBe("TRAM STOP");
    expect(c.sections[0].lines[0].text).toBe("Departures · PTV key not set");
  });
  it("builds the stop card on the server-corrected clock, not the phone clock (WR-W1)", () => {
    // the server is 10 min ahead of the phone clock
    setOffset(600_000);
    try {
      const { layer, open } = setup();
      layer.setOrigin("server");
      layer.update([stopItem({ walk_s: 120 })]);
      // leaves in 60 s on the server clock with a 120 s walk: uncatchable, so dimmed
      const dep: any = {
        id: "dep:1", layer: "transit_departures", group: "tram", name: "96", verb: "departs",
        target_ts: (nowMs() + 60_000) / 1000, kind: "transit_departure", severity: 0,
        detail: { stop_id: 2720, route_id: 1, direction_id: 0, route_number: "96", mode: "tram", live: true },
        geom: null, fetched_at: nowMs() / 1000, stale_after_s: null, computed: true,
      };
      layer.setCardContext({
        departures: { id: "transit_departures", status: "fresh", rev: 1, as_of: 0, attribution: "", items: [dep] },
        ptvState: "ok",
      });
      expect(layer.openById("stop:2720")).toBe(true);
      const lines = open.mock.calls[0][1].sections[0].lines;
      expect(lines[0].cls).toContain("missed");
    } finally {
      setOffset(0);
    }
  });
  it("setCardContext does not touch an open camera card", () => {
    const replace = vi.fn();
    const layer = withCard(replace);
    layer.setOrigin("server");
    layer.update([
      {
        id: "cam:1", layer: "cameras", group: "cctv", name: "cam", verb: "", target_ts: null,
        kind: "infrastructure", severity: 0, detail: { distance_m: 20 },
        geom: { type: "Point", coordinates: [100, -37.8] }, fetched_at: 0, stale_after_s: null, computed: true,
      } as any,
    ]);
    layer.openById("cam:1");
    layer.setCardContext({ ptvState: "ok" });
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("TagLayer stop warning badges (D-16, D-17)", () => {
  const mkStop = (id: number, lon: number): any => ({
    id: `stop:${id}`, layer: "transit_stops", group: "tram", name: `Stop ${id}`,
    verb: "", target_ts: null, kind: "infrastructure", severity: 0,
    detail: { mode: "tram", stop_id: id, distance_m: 27, walk_s: 25 },
    geom: { type: "Point", coordinates: [lon, -37.8] }, fetched_at: 0, stale_after_s: null, computed: true,
  });
  const camera: any = {
    id: "cam:1", layer: "cameras", group: "speed", name: "Cam", verb: "", target_ts: null, kind: "infrastructure",
    severity: 0, detail: { distance_m: 10, walk_s: 9 }, geom: { type: "Point", coordinates: [300, -37.8] },
    fetched_at: 0, stale_after_s: null, computed: true,
  };
  const dep = (stopId: number, routeId: number): any => ({
    id: `dep:${stopId}`, layer: "transit_departures", group: "g", name: "n", verb: "", target_ts: 9e9, kind: "transit_vehicle",
    severity: 0, detail: { stop_id: stopId, route_id: routeId }, geom: null, fetched_at: 0, stale_after_s: 120, computed: false,
  });
  const dis = (severity: number, o: Record<string, unknown>): any => ({
    id: "dis:1", layer: "transit_disruptions", group: "g", name: "d", verb: "", target_ts: null, kind: "transit",
    severity, detail: { disruption_id: 1, title: "t", route_ids: [], stop_ids: [], ...o }, geom: null,
    fetched_at: 0, stale_after_s: 300, computed: false,
  });
  const L = (id: string, items: any[]): any => ({ id, status: "fresh", rev: 1, as_of: 0, attribution: "", items });
  const setup = () => {
    const added: HTMLElement[] = [];
    const marker: any = { setLngLat: () => marker, addTo: () => marker, remove: () => marker };
    const layer = new TagLayer({
      map: { project: (l) => ({ x: l[0], y: 0 }), getZoom: () => 15, on: vi.fn() },
      card: { isOpen: () => false, update: vi.fn(), close: vi.fn(), open: vi.fn(), replace: vi.fn() } as any,
      createMarker: (el) => {
        added.push(el);
        return marker;
      },
      viewportWidth: () => 390,
    });
    layer.setOrigin("server");
    layer.update([mkStop(2720, 100), mkStop(3000, 200), camera]);
    const byLabel = (n: string) => added.find((e) => (e.getAttribute("aria-label") ?? "").includes(n))!;
    return { layer, added, byLabel };
  };

  it("adds .tag-warn info to the matching stop only, then removes it", () => {
    const { layer, byLabel } = setup();
    layer.setCardContext({ departures: L("d", [dep(2720, 96)]), disruptions: L("x", [dis(0, { route_ids: [96] })]), ptvState: "ok" });
    const a = byLabel("Stop 2720");
    const w = a.querySelector(".tag-warn");
    expect(w?.classList.contains("info")).toBe(true);
    expect(w?.querySelector("use")?.getAttribute("href")).toBe("/icons.svg#warn");
    expect(a.getAttribute("aria-label")?.endsWith(", disruption")).toBe(true);
    expect(byLabel("Stop 3000").querySelector(".tag-warn")).toBeNull();
    layer.setCardContext({ departures: L("d", [dep(2720, 96)]), disruptions: L("x", []), ptvState: "ok" });
    expect(a.querySelector(".tag-warn")).toBeNull();
    expect(a.getAttribute("aria-label")?.endsWith("disruption")).toBe(false);
  });
  it("service-stopping gets the stop class and spoken suffix; cameras never get a badge", () => {
    const { layer, byLabel, added } = setup();
    layer.setCardContext({ disruptions: L("x", [dis(3, { stop_ids: [2720] })]), ptvState: "ok" });
    const a = byLabel("Stop 2720");
    expect(a.querySelector(".tag-warn")?.classList.contains("stop")).toBe(true);
    expect(a.getAttribute("aria-label")?.endsWith(", service stopped")).toBe(true);
    const cam = added.find((e) => !e.classList.contains("stop"))!;
    expect(cam.querySelector(".tag-warn")).toBeNull();
  });
});

describe("vehicles", () => {
  const NOW = 1_800_000_000_000;
  const veh = (id: string, lon: number, o: Record<string, unknown> = {}, eta = NOW / 1000 + 192): any => ({
    id: `veh:${id}`, layer: "transit_vehicles", group: "tram", name: "Tram 96 to St Kilda Beach", verb: "arrives",
    target_ts: eta, kind: "transit_vehicle", severity: 0,
    detail: {
      route_number: "96", route_type: 1, mode: "tram", destination: "St Kilda Beach", heading_stop_id: 2720,
      heading_stop_name: "Bourke Street Mall/Elizabeth St #3", eta_ts: eta, eta_live: true,
      pos_ts: NOW / 1000 - 10, pos_src: "ptv", ...o,
    },
    geom: { type: "Point", coordinates: [lon, -37.8] }, fetched_at: 0, stale_after_s: null, computed: true,
  });
  let rafQ: Array<() => void> = [];
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    rafQ = [];
    vi.stubGlobal("requestAnimationFrame", (fn: () => void) => rafQ.push(fn));
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const frame = () => {
    const q = rafQ;
    rafQ = [];
    for (const f of q) f();
  };
  const setup = (reducedMotion = false) => {
    const els: HTMLElement[] = [];
    const sets: Array<[number, number]> = [];
    const removed: number[] = [];
    const card: any = { isOpen: vi.fn(() => false), update: vi.fn(), close: vi.fn(), open: vi.fn(), replace: vi.fn() };
    const layer = new TagLayer({
      map: { project: (l) => ({ x: l[0] * 1000, y: 0 }), getZoom: () => 15, on: vi.fn() },
      card,
      createMarker: (el) => {
        els.push(el);
        const m: any = {
          setLngLat: (l: [number, number]) => (sets.push(l), m),
          addTo: () => m,
          remove: () => (removed.push(1), m),
        };
        return m;
      },
      viewportWidth: () => 390,
      reducedMotion,
    });
    layer.setOrigin({ lat: -37.8, lon: 0 });
    return { layer, els, sets, removed, card };
  };

  it("exports the constants", () => {
    expect([MAX_VEHICLES, GLIDE_MS, JUMP_M, FADE_AFTER_S, REMOVE_AFTER_S]).toEqual([8, 1000, 500, 120, 180]);
  });
  it("renders a vehicle with icon, badge and aria-label, never near or red", () => {
    const { layer, els } = setup();
    layer.update([veh("a", 0.001)]);
    const el = els[0];
    expect(el.classList.contains("vehicle")).toBe(true);
    expect(el.classList.contains("near")).toBe(false);
    expect(el.querySelector("use")!.getAttribute("href")).toBe("/icons.svg#veh-tram");
    expect(el.querySelector(".veh-badge")!.textContent).toBe("96");
    expect(el.getAttribute("aria-label")).toBe("Tram 96 to St Kilda Beach, arrives at Bourke St Mall in 03:12");
    layer.destroy();
  });
  it("marks an estimated vehicle", () => {
    const { layer, els } = setup();
    layer.update([veh("a", 0.001, { pos_src: "est" })]);
    expect(els[0].classList.contains("est")).toBe(true);
    expect(els[0].querySelector(".veh-badge")!.textContent).toBe("~96");
    expect(els[0].getAttribute("aria-label")).toMatch(/, estimated position$/);
    layer.destroy();
  });
  it("ranks vehicles after stops and before cameras, exempt from overlap", () => {
    const stop: TagCand = { id: "s", x: 0, y: 0, dist: 500, label: "s", icon: "stop-tram", prio: 0 };
    const v: TagCand = { id: "v", x: 0, y: 0, dist: 400, label: "96", icon: "veh-tram", prio: 1 };
    const c = cand(1, { x: 500, y: 0, dist: 5 });
    expect(rankTags([c, v, stop]).map((x) => x.id)).toEqual(["s", "v", "c1"]);
    const r = assignTags(rankTags([stop, v, c]), 15);
    expect(r.full.has("v")).toBe(true);
  });
  it("renders only the 8 soonest vehicles and never exceeds 20 labelled tags", () => {
    const stops = Array.from({ length: 6 }, (_, i): TagCand => ({ id: `s${i}`, x: i * 300, y: 400, dist: 50 + i, label: "s", icon: "stop-tram", prio: 0 }));
    const vs = Array.from({ length: 12 }, (_, i): TagCand => ({ id: `v${i}`, x: i * 20, y: 0, dist: 100 + i, label: "9", icon: "veh-tram", prio: 1 }));
    const cams = Array.from({ length: 3 }, (_, i) => cand(i, { x: i * 300, y: 900, dist: 5 + i }));
    const more = Array.from({ length: 20 }, (_, i) => cand(10 + i, { x: i * 300, y: 1500, dist: 200 + i }));
    const r = assignTags(rankTags([...stops, ...vs, ...cams, ...more]), 18);
    expect(r.rendered.filter((c) => c.prio === 1)).toHaveLength(8);
    expect(r.full.size).toBeLessThanOrEqual(20);
    const { layer, els } = setup();
    layer.update(Array.from({ length: 12 }, (_, i) => veh(`n${i}`, 0.001 * (i + 1), {}, NOW / 1000 + 100 + i)));
    expect(els).toHaveLength(8);
    layer.destroy();
  });
  it("glides a 200 m move over 1000 ms ending exactly at the new point", () => {
    const { layer, sets } = setup();
    layer.update([veh("a", 0)]);
    sets.length = 0;
    layer.update([veh("a", 0.0022)]);
    expect(sets).toHaveLength(0);
    vi.advanceTimersByTime(500);
    frame();
    expect(sets).toHaveLength(1);
    expect(sets[0][0]).toBeGreaterThan(0.0009);
    expect(sets[0][0]).toBeLessThan(0.0013);
    vi.advanceTimersByTime(500);
    frame();
    expect(sets[sets.length - 1]).toEqual([0.0022, -37.8]);
    layer.destroy();
  });
  it("jumps for a move over 500 m", () => {
    const { layer, sets } = setup();
    layer.update([veh("a", 0)]);
    sets.length = 0;
    layer.update([veh("a", 0.01)]);
    expect(sets).toEqual([[0.01, -37.8]]);
    layer.destroy();
  });
  it("jumps under reduced motion", () => {
    const { layer, sets } = setup(true);
    layer.update([veh("a", 0)]);
    sets.length = 0;
    layer.update([veh("a", 0.0022)]);
    expect(sets).toEqual([[0.0022, -37.8]]);
    layer.destroy();
  });
  it("fades at 121 s and removes at 181 s on the 1 s ticker", () => {
    const { layer, els, removed } = setup();
    layer.update([veh("a", 0.001, { pos_ts: NOW / 1000 - 100 })]);
    expect(els[0].classList.contains("fading")).toBe(false);
    vi.advanceTimersByTime(21_000);
    expect(els[0].classList.contains("fading")).toBe(true);
    expect(removed).toHaveLength(0);
    vi.advanceTimersByTime(60_000);
    expect(removed).toHaveLength(1);
    layer.destroy();
  });
  it("does not render a vehicle whose position is already too old", () => {
    const { layer, els } = setup();
    layer.update([veh("a", 0.001, { pos_ts: NOW / 1000 - 200 })]);
    expect(els).toHaveLength(0);
  });
  it("keeps an open vehicle card across moves and closes it when the vehicle goes", () => {
    const { layer, card } = setup();
    layer.update([veh("a", 0)]);
    layer.openById("veh:a");
    card.isOpen.mockReturnValue(true);
    layer.update([veh("a", 0.0022)]);
    expect(card.update).toHaveBeenCalled();
    expect(card.close).not.toHaveBeenCalled();
    layer.update([]);
    expect(card.close).toHaveBeenCalled();
  });
  it("refreshes an open vehicle card when the ETA changes without a move (WR-W7)", () => {
    const { layer, card } = setup();
    layer.update([veh("a", 0.001)]);
    layer.openById("veh:a");
    card.isOpen.mockReturnValue(true);
    // same item object again (moveend reconcile): no re-render
    card.replace.mockClear();
    layer.setOrigin({ lat: -37.8, lon: 0 });
    expect(card.replace).not.toHaveBeenCalled();
    // same position, new ETA and SCHED
    layer.update([veh("a", 0.001, { eta_ts: NOW / 1000 + 400, eta_live: false }, NOW / 1000 + 400)]);
    expect(card.replace).toHaveBeenCalledTimes(1);
    const c = card.replace.mock.calls[0][0];
    expect(c.sections[0].lines[0].countTargetMs).toBe((NOW / 1000 + 400) * 1000);
    expect(c.secondary[0]).toEqual(["Arrival", "SCHED"]);
    layer.destroy();
  });
  it("rewrites the vehicle aria-label once a minute, not every second (WR-W8)", () => {
    const { layer, els } = setup();
    layer.update([veh("a", 0.001)]);
    const label = () => els[0].getAttribute("aria-label");
    expect(label()).toBe("Tram 96 to St Kilda Beach, arrives at Bourke St Mall in 03:12");
    const set = vi.spyOn(els[0], "setAttribute");
    vi.advanceTimersByTime(5_000);
    expect(set.mock.calls.filter((c) => c[0] === "aria-label")).toHaveLength(0);
    expect(label()).toBe("Tram 96 to St Kilda Beach, arrives at Bourke St Mall in 03:12");
    vi.advanceTimersByTime(56_000);
    expect(set.mock.calls.filter((c) => c[0] === "aria-label")).toHaveLength(1);
    expect(label()).toMatch(/in 02:1\d$/);
    // a new item (new ETA) updates it straight away
    layer.update([veh("a", 0.001, {}, NOW / 1000 + 600)]);
    expect(label()).toMatch(/in 0[89]:\d\d$/);
    layer.destroy();
  });
  it("opens the vehicle card on tap", () => {
    const { layer, els, card } = setup();
    layer.update([veh("a", 0.001)]);
    els[0].click();
    expect(card.open.mock.calls[0][1].title).toBe("TRAM 96");
    layer.destroy();
  });
});
