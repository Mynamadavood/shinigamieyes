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
