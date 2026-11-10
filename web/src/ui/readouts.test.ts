import { describe, expect, it } from "vitest";
import type { RowVM } from "../model";
import type { Profile } from "../types";
import { Readouts, cameraCountText, cornerRows } from "./readouts";

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
