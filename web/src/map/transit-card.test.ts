import { describe, expect, it } from "vitest";
import { depLines, MAX_CARD_LINES, stopCardContent } from "./transit-card";

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

const NOW = 1_800_000_000_000;
const dep = (o: Record<string, unknown> = {}, top: Record<string, unknown> = {}): any => ({
  id: `dep:2720:${Math.random()}`, layer: "transit_departures", group: "2720:x", name: "n", verb: "departs",
  target_ts: NOW / 1000 + 300, kind: "transit_vehicle", severity: 0, geom: null,
  fetched_at: NOW / 1000 - 5, stale_after_s: 120, computed: false,
  detail: {
    live: true, delay_s: null, route_id: "96", route_number: "96", route_name: "", route_type: 1, mode: "tram",
    destination: "St Kilda Beach", direction_id: 1, platform: null, at_platform: null, walk_s: 25,
    stop_id: 2720, cancelled: false, run_ref: "RUN-SECRET-1", operator: "OP-SECRET", ...o,
  },
  ...top,
});
const layer = (items: any[], status = "fresh"): any => ({ id: "transit_departures", status, rev: 1, as_of: 0, attribution: "", items });
const ctx = (items: any[], status = "fresh", ptv: string | null = "ok"): any => ({ departures: layer(items, status), ptvState: ptv });
const texts = (secs: any[]): string[] => secs.flatMap((s) => s.lines.map((l: any) => l.text));
const at = (sec: number): Record<string, unknown> => ({ target_ts: NOW / 1000 + sec });

describe("depLines", () => {
  it("groups per route and direction ordered by soonest, 2 lines each", () => {
    const items = [
      dep({}, at(600)), dep({}, at(300)), dep({}, at(900)),
      dep({ direction_id: 2, destination: "Bundoora" }, at(100)),
      dep({ route_id: "86", route_number: "86", destination: "RMIT" }, at(200)),
    ];
    const s = depLines(item, ctx(items), NOW);
    expect(s.map((x) => x.head)).toEqual(["96 to Bundoora", "86 to RMIT", "96 to St Kilda Beach"]);
    expect(s[2].lines).toHaveLength(2);
    expect(s[2].lines[0].countTargetMs).toBe(NOW + 300_000);
  });
  it("trains use the route name when present", () => {
    const t = (rn: string) =>
      depLines(item, ctx([dep({ mode: "train", route_name: rn, destination: "Flinders Street" })]), NOW)[0].head;
    expect(t("Hurstbridge")).toBe("Hurstbridge line to Flinders Street");
    expect(t("")).toBe("to Flinders Street");
  });
  it("caps at 8 lines and adds a more-routes line", () => {
    const items = Array.from({ length: 6 }, (_, i) => [
      dep({ route_id: `r${i}`, route_number: `${i}` }, at(100 + i)),
      dep({ route_id: `r${i}`, route_number: `${i}` }, at(200 + i)),
    ]).flat();
    const s = depLines(item, ctx(items), NOW);
    const n = s.reduce((a, x) => a + (x.head ? x.lines.length : 0), 0);
    expect(n).toBe(MAX_CARD_LINES);
    expect(s[s.length - 1].lines[0].text).toBe("+2 more routes");
  });
  it("marks LIVE/SCHED, platform and delay notes", () => {
    const l = (o: any) => depLines(item, ctx([dep(o)]), NOW)[0].lines[0];
    expect(l({ mode: "train", platform: "4", delay_s: 180 })).toMatchObject({
      mark: { text: "LIVE", cls: "live" },
      note: "plat 4 · delayed 3 min",
    });
    expect(l({ mode: "train", platform: "4", at_platform: true, delay_s: -120 }).note).toBe("at plat 4 · 2 min early");
    const sched = l({ live: false, delay_s: 300 });
    expect(sched.mark).toEqual({ text: "SCHED", cls: "sched" });
    expect(sched.note).toBeUndefined();
  });
  it("dims uncatchable lines and shows CANCELLED chips", () => {
    const missed = depLines(item, ctx([dep({}, at(60))]), NOW, 120)[0].lines[0];
    expect(missed.cls).toContain("missed");
    expect(missed.note).toBe("too late");
    const ok = depLines(item, ctx([dep({}, at(60))]), NOW, 60)[0].lines[0];
    expect(ok.cls).not.toContain("missed");
    const c = depLines(item, ctx([dep({ cancelled: true })]), NOW)[0].lines[0];
    expect(c.chip).toBe("CANCELLED");
    expect(c.mark).toBeUndefined();
    expect(c.note).toBeUndefined();
  });
  it("covers the states", () => {
    expect(texts(depLines(item, ctx([], "fresh", "no_key"), NOW))).toEqual(["Departures · PTV key not set"]);
    expect(texts(depLines(item, null, NOW))).toEqual(["Departures · loading"]);
    expect(texts(depLines(item, ctx([], "pending"), NOW))).toEqual(["Departures · loading"]);
    expect(texts(depLines(item, ctx([], "error"), NOW))).toEqual(["Departures · unavailable"]);
    expect(texts(depLines(item, ctx([]), NOW))).toEqual(["No services listed"]);
    expect(texts(depLines(item, ctx([dep({ stop_id: 9 })]), NOW))).toEqual(["No services listed"]);
  });
  it("dims stale data and shows its age", () => {
    const old = dep({}, { fetched_at: NOW / 1000 - 180 });
    const a = depLines(item, ctx([old]), NOW);
    expect(a[0].cls).toBe("stale");
    expect(a[a.length - 1].lines[0].text).toBe("Departures 3m old");
    const b = depLines(item, ctx([dep()], "stale"), NOW);
    expect(b[0].cls).toBe("stale");
    expect(b[b.length - 1].lines[0].text).toBe("Departures just now");
  });
  it("never leaks run refs or operators and keeps the header in every state", () => {
    const c = stopCardContent(item, 27, 25, ctx([dep()]), NOW);
    expect(JSON.stringify(c)).not.toMatch(/RUN-SECRET|OP-SECRET/);
    for (const x of [ctx([], "fresh", "no_key"), ctx([], "error"), null]) {
      const h = stopCardContent(item, 27, 25, x, NOW);
      expect(h.title).toBe("TRAM STOP");
      expect(h.primary).toBe(item.name);
      expect(h.extra).toBe("27 m · 1 min walk");
    }
  });
});

import { MAX_CARD_ALERTS, stopDisruptions } from "./transit-card";

const dis = (id: number, o: Record<string, unknown> = {}, top: Record<string, unknown> = {}): any => ({
  id: `dis:${id}`, layer: "transit_disruptions", group: "g", name: `Name ${id}`, verb: "", target_ts: NOW / 1000 + 3600,
  kind: "transit", severity: 0, geom: null, fetched_at: NOW / 1000, stale_after_s: 300, computed: false,
  detail: { disruption_id: id, title: `Title ${id}`, route_ids: [96], stop_ids: [], service_stopped: false, ...o },
  ...top,
});
const dlayer = (items: any[]): any => ({ id: "transit_disruptions", status: "fresh", rev: 1, as_of: 0, attribution: "", items });
const actx = (deps: any[], diss: any[] | null): any => ({
  departures: layer(deps), ...(diss ? { disruptions: dlayer(diss) } : {}), ptvState: "ok",
});
const alertSec = (c: any): any => (c.sections ?? []).find((s: any) => s.cls === "card-alerts");

describe("alerts and line warnings (D-16, D-17)", () => {
  it("warns on matching route lines: 1 info, 3 service-stopping", () => {
    const s1 = depLines(item, actx([dep({ route_id: 96 }, at(300))], [dis(1)]), NOW);
    expect(s1[0].lines[0].warn).toBe(1);
    const s3 = depLines(item, actx([dep({ route_id: 96 }, at(300))], [dis(1, {}, { severity: 3 })]), NOW);
    expect(s3[0].lines[0].warn).toBe(3);
    const other = depLines(item, actx([dep({ route_id: 86 }, at(300))], [dis(1)]), NOW);
    expect(other[0].lines[0].warn).toBeUndefined();
  });
  it("warns via the line's disruption_ids", () => {
    const s = depLines(item, actx([dep({ route_id: 5, disruption_ids: [9] }, at(300))], [dis(9, { route_ids: [] })]), NOW);
    expect(s[0].lines[0].warn).toBe(1);
  });
  it("lists alerts after the groups, severity 3 first, with ends in", () => {
    const c = stopCardContent(item, 5, 5, actx([dep({ route_id: 96 }, at(300))], [dis(1), dis(2, {}, { severity: 3 })]), NOW);
    const a = alertSec(c);
    expect(a.lines[0].cls).toEqual(["card-alert", "stop"]);
    expect(a.lines[0].text).toBe("Title 2");
    expect(a.lines[0].warn).toBe(3);
    expect(a.lines[1].cls).toContain("card-alert-end");
    expect(a.lines[1].text).toBe("ends in");
    expect(a.lines[1].countTargetMs).toBe(NOW + 3_600_000);
    expect(a.lines[2].cls).toEqual(["card-alert"]);
    expect(c.sections![c.sections!.length - 1]).toBe(a);
  });
  it("omits the end line when to_ts is unknown and trims to 120 chars", () => {
    const c = stopCardContent(item, 5, 5, actx([dep({ route_id: 96 }, at(300))], [dis(1, { title: "x".repeat(300) }, { target_ts: null })]), NOW);
    const a = alertSec(c);
    expect(a.lines).toHaveLength(1);
    expect(a.lines[0].text).toHaveLength(120);
  });
  it("caps at 2 alerts with a more line", () => {
    expect(MAX_CARD_ALERTS).toBe(2);
    const c = stopCardContent(item, 5, 5, actx([dep({ route_id: 96 }, at(300))], [dis(1), dis(2), dis(3), dis(4)]), NOW);
    const a = alertSec(c);
    expect(a.lines.filter((l: any) => l.cls[0] === "card-alert")).toHaveLength(2);
    expect(a.lines[a.lines.length - 1].text).toBe("+2 more · see disruptions");
  });
  it("matches by stop id and has no section without a layer or matches", () => {
    expect(stopDisruptions(item, actx([], [dis(1, { route_ids: [], stop_ids: [2720] })]))).toHaveLength(1);
    expect(alertSec(stopCardContent(item, 5, 5, actx([dep({ route_id: 96 }, at(300))], null), NOW))).toBeUndefined();
    expect(alertSec(stopCardContent(item, 5, 5, actx([dep({ route_id: 86 }, at(300))], [dis(1)]), NOW))).toBeUndefined();
  });
  it("never puts links in the card", () => {
    const c = stopCardContent(item, 5, 5, actx([dep({ route_id: 96 }, at(300))], [dis(1, { title: "Details" })]), NOW);
    expect(JSON.stringify(c)).not.toMatch(/https?:|www\./);
  });
});
