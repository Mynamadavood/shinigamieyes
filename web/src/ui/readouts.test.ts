import { describe, expect, it } from "vitest";
import type { RowVM } from "../model";
import { Readouts, cornerRows } from "./readouts";

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
