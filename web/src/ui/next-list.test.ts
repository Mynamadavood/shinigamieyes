import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextList } from "./next-list";
import type { RowVM } from "../model";
import type { Item } from "../types";

const NOW = 1_000_000;
function vm(p: Partial<RowVM> & { id: string }): RowVM {
  return {
    name: p.id, kindTag: "sun", countdownText: "01:00", targetMs: NOW + 60_000, display: null, isFirst: false,
    item: {} as Item, ageTag: "computed", stale: false, urgent: false, redCountdown: false, ...p,
  };
}

let host: HTMLElement;
let list: NextList;
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
  list = new NextList(host);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const rowEls = () => [...host.querySelectorAll(".row")];

describe("NextList expiry", () => {
  it("expired row pulses, stays, then is removed after 1200 ms", () => {
    list.update([vm({ id: "a", targetMs: NOW + 1000 }), vm({ id: "b" })], NOW);
    list.update([vm({ id: "b" })], NOW + 2000);
    const a = rowEls().find((e) => e.textContent?.includes("a"))!;
    expect(a.classList.contains("expiring")).toBe(true);
    list.update([vm({ id: "b" })], NOW + 2500);
    expect(rowEls()).toHaveLength(2);
    vi.advanceTimersByTime(1199);
    expect(a.isConnected).toBe(true);
    vi.advanceTimersByTime(2);
    expect(a.isConnected).toBe(false);
    expect(rowEls()).toHaveLength(1);
  });

  it("replaced data is removed without expiring", () => {
    list.update([vm({ id: "a" }), vm({ id: "b" })], NOW);
    const a = rowEls()[0];
    list.update([vm({ id: "b" })], NOW + 1000);
    expect(a.isConnected).toBe(false);
    expect(a.classList.contains("expiring")).toBe(false);
  });

  it("reduced motion removes after 300 ms", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    list.update([vm({ id: "a", targetMs: NOW + 1000 })], NOW);
    const a = rowEls()[0];
    list.update([], NOW + 2000);
    vi.advanceTimersByTime(301);
    expect(a.isConnected).toBe(false);
  });

  it("new row is placed ahead of an expiring one without breaking order", () => {
    list.update([vm({ id: "a", targetMs: NOW + 1000 }), vm({ id: "b" })], NOW);
    list.update([vm({ id: "c" }), vm({ id: "b" })], NOW + 2000);
    const names = rowEls().map((e) => e.querySelector(".row-name")!.textContent);
    expect(names.filter((n) => n !== "a")).toEqual(["c", "b"]);
  });
});

describe("NextList classes and freshness", () => {
  it("applies stale/urgent/red-countdown/first and ageTag", () => {
    list.update([vm({ id: "a", stale: true, urgent: true, redCountdown: true, isFirst: true, ageTag: "2h old" })], NOW);
    const r = rowEls()[0];
    for (const c of ["stale", "urgent", "red-countdown", "first"]) expect(r.classList.contains(c)).toBe(true);
    expect(r.querySelector(".row-fresh")!.textContent).toBe("2h old");
    expect(r.getAttribute("style")).toBeNull();
  });

  it("shows just now / computed", () => {
    list.update([vm({ id: "a", ageTag: "just now" })], NOW);
    expect(rowEls()[0].querySelector(".row-fresh")!.textContent).toBe("just now");
  });
});

describe("NextList states", () => {
  it("loading shows 3 placeholder rows", () => {
    list.setState("loading");
    const rs = rowEls();
    expect(rs).toHaveLength(3);
    expect(rs[0].querySelector(".row-count")!.textContent).toBe("--");
    expect(rs[0].querySelector(".row-kind")!.textContent).toBe("loading");
  });

  it("empty copy", () => {
    list.setState("empty");
    expect(host.textContent).toContain("Nothing on the radar");
    expect(host.textContent).toContain("No items for this spot yet. Pick another place or check back soon.");
  });

  it("no-data-offline copy", () => {
    list.setState("no-data-offline");
    expect(host.textContent).toContain("No data yet");
    expect(host.textContent).toContain("Connect to your tailnet to load your first profile.");
  });

  it("update with rows leaves loading state", () => {
    list.setState("loading");
    list.update([vm({ id: "a" })], NOW);
    expect(rowEls()).toHaveLength(1);
    expect(host.querySelector(".placeholder")).toBeNull();
  });
});

describe("NextList.setState idempotence", () => {
  it("does not rebuild the DOM when the state is unchanged", () => {
    list.setState("loading");
    const node = host.querySelector(".list-state-rows");
    expect(node).not.toBeNull();
    list.setState("loading");
    expect(host.querySelector(".list-state-rows")).toBe(node);
  });
  it("re-shows empty after rows came and went", () => {
    list.setState("empty");
    list.update([vm({ id: "a" })], NOW);
    expect(host.querySelector(".list-state")).toBeNull();
    list.update([], NOW + 100_000);
    list.setState("empty");
    expect(host.querySelector(".list-state")).not.toBeNull();
  });
});

describe("NextList transit classes", () => {
  it("toggles transit/none classes", () => {
    list.update([vm({ id: "t", targetMs: null, transit: true, none: true })], NOW);
    const el = host.querySelector(".row") as HTMLElement;
    expect(el.className).toContain("transit");
    expect(el.classList.contains("none")).toBe(true);
    list.update([vm({ id: "t", targetMs: null })], NOW + 1000);
    expect(el.classList.contains("transit")).toBe(false);
    expect(el.classList.contains("none")).toBe(false);
  });
});

describe("NextList departure rows", () => {
  const dvm = (p: Partial<RowVM> = {}) =>
    vm({
      id: "transit:1:a", name: "Tram 96 to St Kilda", kindTag: "tram · LIVE", countdownText: "06:12", transit: true,
      stopId: 1, live: true, leaveText: "leave in 01:40", note: "plat 4", missed: false, leaveNow: false, leaveNowRed: false, ...p,
    });
  const row = () => host.querySelector(".row") as HTMLElement;

  it("renders live mark, note and leave-in value", () => {
    list.update([dvm()], NOW);
    expect(row().querySelector(".row-live")!.textContent).toBe("LIVE");
    expect(row().querySelector(".row-kind")!.textContent).toBe("tram · LIVE plat 4");
    expect(row().querySelector(".row-leave")!.textContent).toBe("leave in 01:40");
    expect(row().querySelector(".leave-val")!.textContent).toBe("01:40");
    expect(row().querySelector(".row-fresh")!.textContent).toBe("");
    expect(row().getAttribute("aria-label")).toBe("Tram 96 to St Kilda, departs in 06:12, live, leave in 01:40");
  });
  it("sched mark", () => {
    list.update([dvm({ live: false, kindTag: "bus · SCHED" })], NOW);
    expect(row().querySelector(".row-live")!.classList.contains("sched")).toBe(true);
    expect(row().classList.contains("sched")).toBe(true);
  });
  it("leave-now red shows chip and class", () => {
    list.update([dvm({ leaveNow: true, leaveNowRed: true, leaveText: "LEAVE NOW" })], NOW);
    expect(row().classList.contains("leave-now")).toBe(true);
    expect(row().querySelector(".leave-chip")!.textContent).toBe("LEAVE NOW");
    expect(row().getAttribute("aria-label")).toContain("leave now");
  });
  it("second leave-now row is white text, no chip", () => {
    list.update([dvm({ leaveNow: true, leaveText: "leave now" })], NOW);
    expect(row().classList.contains("leave-now")).toBe(false);
    expect(row().querySelector(".row-leave")!.textContent).toBe("leave now");
  });
  it("missed state", () => {
    list.update([dvm({ missed: true, leaveText: "too late to catch" })], NOW);
    expect(row().classList.contains("missed")).toBe(true);
    expect(row().getAttribute("aria-label")).toContain("too late to catch");
  });
  it("rolling to next departure keeps node, no pulse", () => {
    list.update([dvm()], NOW);
    const el = row();
    list.update([dvm({ countdownText: "12:00", targetMs: NOW + 700_000 })], NOW + 1000);
    expect(row()).toBe(el);
    expect(el.classList.contains("expiring")).toBe(false);
    expect(el.querySelectorAll(".row-live")).toHaveLength(1);
  });
  it("tap and Enter call onRowTap only for tappable rows", () => {
    const onRowTap = vi.fn();
    document.body.innerHTML = "";
    host = document.createElement("div");
    document.body.append(host);
    list = new NextList(host, { onRowTap });
    list.update([dvm(), dvm({ id: "transit:none:tram", none: true, stopId: null, leaveText: undefined }), dvm({ id: "transit:status", stopId: null, leaveText: undefined })], NOW);
    const rows = [...host.querySelectorAll<HTMLElement>(".row")];
    expect(rows[0].getAttribute("role")).toBe("button");
    expect(rows[1].getAttribute("role")).toBe("listitem");
    expect(rows[2].getAttribute("role")).toBe("listitem");
    rows[0].click();
    rows[0].dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    rows[1].click();
    rows[2].click();
    expect(onRowTap).toHaveBeenCalledTimes(2);
    expect(onRowTap.mock.calls[0][0].id).toBe("transit:1:a");
  });
});

describe("NextList disruption warnings", () => {
  const dvm = (p: Partial<RowVM> = {}) =>
    vm({
      id: "transit:1:a", name: "Tram 96 to St Kilda", kindTag: "tram · LIVE", countdownText: "06:12", transit: true,
      stopId: 1, live: true, leaveText: "leave in 01:40", note: "", missed: false, leaveNow: false, leaveNowRed: false, ...p,
    });
  const row = () => host.querySelector(".row") as HTMLElement;
  const warn = () => row().querySelector("svg.row-warn");

  it("warn 1 renders info glyph first in row-kind; warn 3 stop; 0 removes; toggles in place", () => {
    list.update([dvm({ warn: 1 })], NOW);
    const g = warn() as SVGElement;
    expect(g.classList.contains("info")).toBe(true);
    expect(row().querySelector(".row-kind")!.firstElementChild).toBe(g);
    expect(g.querySelector("use")!.getAttribute("href")).toBe("/icons.svg#warn");
    expect(row().getAttribute("aria-label")).toMatch(/, disruption$/);
    list.update([dvm({ warn: 3 })], NOW);
    expect(warn()).toBe(g);
    expect(g.classList.contains("stop")).toBe(true);
    expect(g.classList.contains("info")).toBe(false);
    expect(row().getAttribute("aria-label")).toMatch(/, service stopped$/);
    list.update([dvm({ warn: 0 })], NOW);
    expect(warn()).toBeNull();
    expect(row().getAttribute("aria-label")).not.toMatch(/disruption|service stopped/);
  });
  it("end rows are tappable buttons with class transit end", () => {
    const taps: RowVM[] = [];
    document.body.innerHTML = "";
    host = document.createElement("div");
    document.body.append(host);
    list = new NextList(host, { onRowTap: (r) => taps.push(r) });
    const end = vm({
      id: "transit-end:5", name: "Tram 96 disruption", kindTag: "disruption · ends", countdownText: "2h 0m",
      transit: true, endRow: true, stopId: null,
    });
    list.update([end], NOW);
    expect(row().classList.contains("transit")).toBe(true);
    expect(row().classList.contains("end")).toBe(true);
    expect(row().getAttribute("role")).toBe("button");
    expect(row().querySelector(".row-kind")!.textContent).toBe("disruption · ends");
    row().click();
    expect(taps.map((t) => t.id)).toEqual(["transit-end:5"]);
  });
});
