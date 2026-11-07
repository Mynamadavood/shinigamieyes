import { describe, expect, it } from "vitest";
import { selectVisible } from "./model";
import type { Item, Profile } from "./types";

function item(p: Partial<Item> & { id: string }): Item {
  return {
    layer: "sun", group: "g", name: p.id, verb: "ends", target_ts: null, kind: "environment",
    severity: 0, detail: null, geom: null, fetched_at: 0, stale_after_s: null, computed: true, ...p,
  };
}
function prof(items: Item[]): Profile {
  return {
    server_time: 0, rev: 1,
    location: { source: "default", lat: null, lon: null },
    layers: { sun: { id: "sun", status: "fresh", rev: 1, as_of: 0, attribution: "", items } },
  };
}
const NOW = 1_000_000;

describe("selectVisible", () => {
  it("skips positioned and summary items", () => {
    const p = prof([
      item({ id: "cam", geom: { type: "Point", coordinates: [144.9, -37.8] }, target_ts: NOW / 1000 + 60 }),
      item({ id: "sum", detail: { summary: true }, target_ts: NOW / 1000 + 60 }),
      item({ id: "sun", group: "s", target_ts: NOW / 1000 + 90 }),
    ]);
    expect(selectVisible(p, NOW).map((r) => r.id)).toEqual(["sun"]);
  });

  it("null -> []", () => expect(selectVisible(null, NOW)).toEqual([]));

  it("keeps earliest unexpired per group, sorted, one isFirst", () => {
    const p = prof([
      item({ id: "a2", group: "a", target_ts: NOW / 1000 + 700 }),
      item({ id: "a1", group: "a", target_ts: NOW / 1000 + 60 }),
      item({ id: "b1", group: "b", target_ts: NOW / 1000 + 30 }),
    ]);
    const rows = selectVisible(p, NOW);
    expect(rows.map((r) => r.id)).toEqual(["b1", "a1"]);
    expect(rows.filter((r) => r.isFirst)).toHaveLength(1);
    expect(rows[0].isFirst).toBe(true);
    expect(rows[1].countdownText).toBe("01:00");
  });

  it("drops started item and shows the ends row", () => {
    const p = prof([
      item({ id: "s", group: "g", verb: "starts", target_ts: NOW / 1000 - 10 }),
      item({ id: "e", group: "g", verb: "ends", target_ts: NOW / 1000 + 120 }),
    ]);
    expect(selectVisible(p, NOW).map((r) => r.id)).toEqual(["e"]);
  });

  it("null-target rows last, show detail.display", () => {
    const p = prof([
      item({ id: "n", group: "n", detail: { display: "UV 7" } }),
      item({ id: "t", group: "t", target_ts: NOW / 1000 + 5 }),
    ]);
    const rows = selectVisible(p, NOW);
    expect(rows.map((r) => r.id)).toEqual(["t", "n"]);
    expect(rows[1].countdownText).toBe("UV 7");
    expect(rows[1].isFirst).toBe(false);
  });

  it("urgent under 15 min, only soonest gets red countdown", () => {
    const p = prof([
      item({ id: "u2", group: "u2", target_ts: NOW / 1000 + 600 }),
      item({ id: "u1", group: "u1", target_ts: NOW / 1000 + 100 }),
      item({ id: "far", group: "far", target_ts: NOW / 1000 + 901 }),
      item({ id: "val", group: "val", detail: { display: "UV 3" } }),
    ]);
    const rows = selectVisible(p, NOW);
    expect(rows.map((r) => r.urgent)).toEqual([true, true, false, false]);
    expect(rows.map((r) => r.redCountdown)).toEqual([true, false, false, false]);
  });

  it("stale rows are never urgent and carry ageTag/stale", () => {
    const p = prof([item({ id: "s", target_ts: NOW / 1000 + 60, computed: false, fetched_at: NOW / 1000 - 7300, stale_after_s: 1800 })]);
    const [r] = selectVisible(p, NOW);
    expect(r.stale).toBe(true);
    expect(r.urgent).toBe(false);
    expect(r.redCountdown).toBe(false);
    expect(r.ageTag).toBe("2h old");
  });

  it("computed rows show 'computed'", () => {
    const [r] = selectVisible(prof([item({ id: "c", target_ts: NOW / 1000 + 5000 })]), NOW);
    expect(r.ageTag).toBe("computed");
    expect(r.stale).toBe(false);
  });
});
