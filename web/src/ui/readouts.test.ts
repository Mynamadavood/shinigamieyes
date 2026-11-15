import { describe, expect, it, vi } from "vitest";
import type { RowVM } from "../model";
import type { Profile } from "../types";
import { Readouts, cameraCountText, cornerRows, disruptionReadout } from "./readouts";

function row(id: string, targetMs: number | null, extra: Partial<RowVM> = {}): RowVM {
  return {
    id, name: id, kindTag: "", countdownText: targetMs === null ? "5" : "01:00", targetMs, display: null,
    isFirst: false, item: {} as RowVM["item"], ageTag: "", stale: false, urgent: false, redCountdown: false, ...extra,
  };
}

describe("cornerRows", () => {
  it("max 2, timed first by soonest, then value-only", () => {
    const out = cornerRows([row("v", null), row("b", 200), row("a", 100), row("c", 300)]);
    expect(out.map((r) => r.id)).toEqual(["a", "b"]);
    expect(cornerRows([row("v", null), row("a", 100)]).map((r) => r.id)).toEqual(["a", "v"]);
  });
});

describe("cornerRows transit", () => {
  it("ignores transit rows", () => {
    const out = cornerRows([row("t", 50, { transit: true }), row("n", null, { transit: true, none: true }), row("a", 100)]);
    expect(out.map((r) => r.id)).toEqual(["a"]);
  });
});

describe("Readouts", () => {
  it("renders name/countdown, urgent class, in-place update, aria once a minute", () => {
    const l = document.createElement("div");
    const r = document.createElement("div");
    const ro = new Readouts(l, r);
    ro.update([row("a", 100, { redCountdown: true })], null, 0);
    const node = l.querySelector(".readout") as HTMLElement;
    expect(node.querySelector(".readout-name")?.textContent).toBe("a");
    expect(node.querySelector(".readout-countdown")?.textContent).toBe("01:00");
    expect(node.classList.contains("urgent")).toBe(true);
    expect(node.getAttribute("aria-label")).toBe("a, 01:00");
    ro.update([row("a", 100, { countdownText: "00:59" })], null, 1000);
    expect(l.querySelector(".readout")).toBe(node);
    expect(node.querySelector(".readout-countdown")?.textContent).toBe("00:59");
    expect(node.classList.contains("urgent")).toBe(false);
    expect(node.getAttribute("aria-label")).toBe("a, 01:00");
    ro.update([row("a", 100, { countdownText: "00:01" })], null, 61_000);
    expect(node.getAttribute("aria-label")).toBe("a, 00:01");
  });
});

describe("cameraCountText", () => {
  const prof = (count: number | null, source: "gps" | "pin" = "gps", status = "fresh"): Profile => ({
    server_time: 0, rev: 0,
    location: { source, lat: null, lon: null },
    layers: count === null ? {} : {
      cameras_cctv: {
        id: "cameras_cctv", status: status as "fresh", rev: 0, as_of: 0, attribution: "",
        items: [{ id: "s", layer: "cameras_cctv", group: "summary", name: "summary", verb: "", target_ts: null,
          kind: "infrastructure", severity: 0, detail: { summary: true, count, radius_m: 150 }, geom: null,
          fetched_at: 0, stale_after_s: null, computed: true }],
      },
    },
  });
  it("covers the six copy cases", () => {
    expect(cameraCountText(prof(6))).toEqual({ num: "6", rest: " cameras · 150 m · mapped, not exhaustive" });
    expect(cameraCountText(prof(1))).toEqual({ num: "1", rest: " camera · 150 m · mapped, not exhaustive" });
    expect(cameraCountText(prof(0))).toEqual({ num: "0", rest: " mapped cameras · 150 m · not exhaustive" });
    expect(cameraCountText(prof(null))).toEqual({ num: null, rest: "Cameras · not loaded yet" });
    expect(cameraCountText(prof(3, "gps", "pending"))).toEqual({ num: null, rest: "Cameras · not loaded yet" });
    const noLayer = prof(3, "pin");
    delete (noLayer.layers as Record<string, unknown>)["cameras_cctv"];
    expect(cameraCountText(noLayer)).toEqual({ num: null, rest: "Cameras · not shown for saved places" });
    expect(cameraCountText(prof(4, "pin"))).toEqual({ num: "4", rest: " cameras · 150 m · mapped, not exhaustive" });
    expect(cameraCountText(null)).toEqual({ num: null, rest: "Cameras · not loaded yet" });
  });
  it("renders in the right column without red or 'no cameras'", () => {
    const l = document.createElement("div");
    const r = document.createElement("div");
    const ro = new Readouts(l, r);
    ro.update([], prof(0), 0);
    const el = r.querySelector(".readout-cameras") as HTMLElement;
    expect(el.textContent?.toLowerCase()).not.toContain("no cameras");
    expect(el.classList.contains("urgent")).toBe(false);
    expect(el.querySelector(".count-num")?.textContent).toBe("0");
    ro.update([], prof(6), 1);
    expect(r.querySelectorAll(".readout-cameras").length).toBe(1);
    expect(el.querySelector(".count-num")?.textContent).toBe("6");
  });
});

describe("disruption readout", () => {
  const di = (sev: number, n = 0) => ({
    id: `dis:${sev}:${n}`, layer: "transit_disruptions", group: "disruption", name: "x", verb: "ends",
    target_ts: null, kind: "infrastructure" as const, severity: sev, detail: { title: "t" }, geom: null,
    fetched_at: 0, stale_after_s: 600, computed: false,
  });
  const prof = (items: ReturnType<typeof di>[] | null, status = "fresh"): Profile => ({
    server_time: 0, rev: 0, location: { source: "gps", lat: null, lon: null },
    layers: items === null ? {} : {
      transit_disruptions: { id: "transit_disruptions", status: status as "fresh", rev: 0, as_of: 0, attribution: "", items },
    },
  });
  it("computes visibility, count copy and red", () => {
    expect(disruptionReadout(prof([di(0, 1), di(0, 2)]))).toMatchObject({ visible: true, n: 2, red: false, text: { num: "2", rest: " disruptions · your routes" } });
    expect(disruptionReadout(prof([di(0)])).text.rest).toBe(" disruption · your routes");
    expect(disruptionReadout(prof([])).visible).toBe(false);
    expect(disruptionReadout(prof([di(0)], "pending")).visible).toBe(false);
    expect(disruptionReadout(prof(null)).visible).toBe(false);
    expect(disruptionReadout(null).visible).toBe(false);
    expect(disruptionReadout(prof([di(0), di(3)])).red).toBe(true);
  });
  it("renders a button below cameras, hides, toggles red, taps", () => {
    const l = document.createElement("div");
    const r = document.createElement("div");
    const tap = vi.fn();
    const ro = new Readouts(l, r, { onDisruptionsTap: tap });
    ro.update([], prof([di(0, 1), di(0, 2)]), 0);
    const b = r.querySelector("button.readout.readout-disruptions") as HTMLButtonElement;
    expect(r.children[0]).toBe(r.querySelector(".readout-cameras"));
    expect(r.children[1]).toBe(b);
    expect(b.hidden).toBe(false);
    expect(b.querySelector(".count-num")?.textContent).toBe("2");
    expect(b.getAttribute("aria-label")).toBe("2 disruptions on your routes, show list");
    expect(b.classList.contains("red")).toBe(false);
    ro.update([], prof([di(3)]), 1);
    expect(b.classList.contains("red")).toBe(true);
    expect(b.getAttribute("aria-label")).toBe("1 disruption on your routes, show list, service stopped on at least one");
    b.click();
    expect(tap).toHaveBeenCalledTimes(1);
    ro.update([], prof([]), 2);
    expect(b.hidden).toBe(true);
    ro.update([], null, 3);
    expect(b.hidden).toBe(true);
  });
});
