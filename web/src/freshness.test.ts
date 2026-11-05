import { describe, expect, it } from "vitest";
import { ageTag, isStale } from "./freshness";
import type { Item } from "./types";

const NOW = 10_000_000_000;
function it2(p: Partial<Item>): Item {
  return {
    id: "x", layer: "uv_now", group: "g", name: "x", verb: "ends", target_ts: null, kind: "environment",
    severity: 0, detail: null, geom: null, fetched_at: NOW / 1000, stale_after_s: 1800, computed: false, ...p,
  };
}
const ago = (s: number) => NOW / 1000 - s;

describe("ageTag", () => {
  it("computed", () => expect(ageTag(it2({ computed: true, fetched_at: ago(9999) }), NOW)).toBe("computed"));
  it("just now", () => {
    expect(ageTag(it2({ fetched_at: ago(30) }), NOW)).toBe("just now");
    expect(ageTag(it2({ fetched_at: ago(59) }), NOW)).toBe("just now");
  });
  it("minutes", () => {
    expect(ageTag(it2({ fetched_at: ago(60) }), NOW)).toBe("1m old");
    expect(ageTag(it2({ fetched_at: ago(300) }), NOW)).toBe("5m old");
  });
  it("hours and days", () => {
    expect(ageTag(it2({ fetched_at: ago(2 * 3600 + 600) }), NOW)).toBe("2h old");
    expect(ageTag(it2({ fetched_at: ago(3 * 86400 + 7200) }), NOW)).toBe("3d old");
  });
  it("clock skew", () => expect(ageTag(it2({ fetched_at: ago(-50) }), NOW)).toBe("just now"));
});

describe("isStale", () => {
  it("null never stale", () => expect(isStale(it2({ stale_after_s: null, fetched_at: ago(99999) }), "fresh", NOW)).toBe(false));
  it("threshold", () => {
    expect(isStale(it2({ fetched_at: ago(1801) }), "fresh", NOW)).toBe(true);
    expect(isStale(it2({ fetched_at: ago(1799) }), "fresh", NOW)).toBe(false);
  });
  it("stale layer", () => expect(isStale(it2({ stale_after_s: null }), "stale", NOW)).toBe(true));
});
