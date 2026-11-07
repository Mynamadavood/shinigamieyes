import { describe, expect, it } from "vitest";
import { MAX_FULL, MAX_TOTAL, NEAR_M, RED_CAP, EXPAND_ZOOM, assignTags, rankTags, type TagCand } from "./tags";

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
