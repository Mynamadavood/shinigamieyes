import { describe, expect, it, vi } from "vitest";
import { MAX_FULL, MAX_TOTAL, NEAR_M, RED_CAP, EXPAND_ZOOM, assignTags, rankTags, TagLayer, type TagCand } from "./tags";

function cand(i: number, p: Partial<TagCand> = {}): TagCand {
  return { id: `c${i}`, x: i * 300, y: 0, dist: 100 + i, label: "Camera", icon: "cctv", ...p };
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
    const a = cand(0, { x: 100, y: 100, dist: 10 });
    const b = cand(1, { x: 150, y: 110, dist: 20 });
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
