import { describe, expect, it } from "vitest";
import { stopCardContent } from "./transit-card";

const item: any = {
  id: "stop:2720", layer: "transit_stops", group: "tram", name: "Bourke Street Mall/Elizabeth St #3",
  verb: "", target_ts: null, kind: "infrastructure", severity: 0,
  detail: { mode: "tram", stop_id: 2720, distance_m: 27, walk_s: 25, routes: ["96"] },
  geom: { type: "Point", coordinates: [144.9, -37.8] }, fetched_at: 0, stale_after_s: null, computed: true,
};

describe("stopCardContent", () => {
  it("renders the static header", () => {
    const c = stopCardContent(item, 27, 25, null, 0);
    expect(c.title).toBe("TRAM STOP");
    expect(c.primary).toBe("Bourke Street Mall/Elizabeth St #3");
    expect(c.extra).toBe("27 m · 1 min walk");
    expect(c.caveats).toEqual(["Source: PTV"]);
    expect(c.secondary).toEqual([]);
  });
  it("titles trains and buses and caps long names", () => {
    expect(stopCardContent({ ...item, detail: { mode: "train" } }, 5, 5, null, 0).title).toBe("TRAIN STATION");
    expect(stopCardContent({ ...item, detail: { mode: "bus" } }, 5, 5, null, 0).title).toBe("BUS STOP");
    expect(String(stopCardContent({ ...item, name: "x".repeat(200) }, 5, 5, null, 0).primary)).toHaveLength(80);
  });
});
