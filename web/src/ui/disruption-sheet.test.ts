import { afterEach, describe, expect, it, vi } from "vitest";
import type { Item, Layer } from "../types";
import { DisruptionSheet, NO_DISRUPTIONS, PTV_LICENCE, disruptionRows } from "./disruption-sheet";

const NOW = 1_700_000_000_000;

function item(id: string, d: Record<string, unknown>, sev = 0, target: number | null = null): Item {
  return {
    id: `dis:${id}`, layer: "transit_disruptions", group: "disruption", name: "fallback", verb: "ends",
    target_ts: target, kind: "infrastructure", severity: sev, detail: { title: `T${id}`, status: "Current", ...d },
    geom: null, fetched_at: NOW / 1000, stale_after_s: 600, computed: false,
  };
}
const layer = (items: Item[]): Layer => ({
  id: "transit_disruptions", status: "fresh", rev: 1, as_of: NOW / 1000, attribution: "", items,
});

describe("disruptionRows", () => {
  it("orders red first, then soonest end, then most recently updated", () => {
    const rows = disruptionRows(
      layer([
        item("a", { route_labels: ["Tram 96"], to_ts: NOW / 1000 + 7200, updated_ts: NOW / 1000 - 60 }, 0, NOW / 1000 + 7200),
        item("b", { route_labels: ["Tram 11"], to_ts: NOW / 1000 + 600, updated_ts: NOW / 1000 - 60 }, 0, NOW / 1000 + 600),
        item("c", { route_labels: ["Bus 1"], updated_ts: NOW / 1000 - 10 }),
        item("d", { route_labels: ["Bus 2"], updated_ts: NOW / 1000 - 500, service_stopped: true }, 3),
      ]),
      NOW,
    );
    expect(rows.map((r) => r.id)).toEqual(["dis:d", "dis:b", "dis:a", "dis:c"]);
    expect(rows[0]!.red).toBe(true);
    expect(rows[3]!.endTargetMs).toBeNull();
  });
  it("joins routes max 3 with +n, uses short stop name for stop-only, builds meta", () => {
    const rows = disruptionRows(
      layer([
        item("a", { route_labels: ["A", "B", "C", "D", "E"], updated_ts: NOW / 1000 - 180 }),
        item("b", { stop_names: ["Flinders Street Railway Station"], status: "Planned", updated_ts: NOW / 1000 - 3600 }),
      ]),
      NOW,
    );
    const a = rows.find((r) => r.id === "dis:a")!;
    const b = rows.find((r) => r.id === "dis:b")!;
    expect(a.routes).toBe("A, B, C +2");
    expect(a.meta).toBe("Current · updated 3m ago");
    expect(b.routes).toBe("Flinders St");
    expect(b.meta).toBe("Planned · updated 1h ago");
  });
  it("caps at 6", () => {
    const items = Array.from({ length: 8 }, (_, i) => item(String(i), { route_labels: ["X"] }));
    expect(disruptionRows(layer(items), NOW).length).toBe(6);
  });
});

describe("DisruptionSheet", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });
  function setup() {
    document.body.replaceChildren();
    const btn = document.createElement("button");
    document.body.append(btn);
    const sheet = new DisruptionSheet(document.body, { reducedMotion: false });
    return { btn, sheet };
  }
  const L = (): Layer =>
    layer([
      item("r", { route_labels: ["Tram 96"], service_stopped: true, updated_ts: Date.now() / 1000 }, 3),
      item("n", { route_labels: ["Bus 5"], to_ts: Date.now() / 1000 + 3600, updated_ts: Date.now() / 1000 }, 0, Date.now() / 1000 + 3600),
    ]);

  it("renders title, chip only on red, ends-in only when known, licence, Close", () => {
    const { sheet, btn } = setup();
    sheet.open(L(), btn);
    expect(document.querySelector(".sheet-title")?.textContent).toBe("DISRUPTIONS · YOUR ROUTES");
    expect(document.querySelectorAll(".dis-row").length).toBe(2);
    expect(document.querySelectorAll(".no-service").length).toBe(1);
    expect(document.querySelectorAll(".dis-end").length).toBe(1);
    expect(document.querySelector(".dis-foot")?.textContent).toBe(PTV_LICENCE);
    expect(document.querySelector(".dis-close")?.textContent).toBe("Close");
    expect(document.querySelector("a")).toBeNull();
    expect(document.activeElement).toBe(document.querySelector(".sheet-title"));
    sheet.close();
  });
  it("closes by Close, backdrop and Escape; focus returns", () => {
    const { sheet, btn } = setup();
    sheet.open(L(), btn);
    (document.querySelector(".dis-close") as HTMLElement).click();
    expect(sheet.isOpen()).toBe(false);
    expect(document.activeElement).toBe(btn);
    sheet.open(L(), btn);
    (document.querySelector(".sheet-backdrop") as HTMLElement).click();
    expect(sheet.isOpen()).toBe(false);
    sheet.open(L(), btn);
    document.querySelector(".sheet")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(sheet.isOpen()).toBe(false);
  });
  it("ticks countdowns while open and stops after close", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { sheet, btn } = setup();
    const lay = layer([item("n", { route_labels: ["Bus 5"], to_ts: NOW / 1000 + 120 }, 0, NOW / 1000 + 120)]);
    sheet.open(lay, btn);
    const cd = document.querySelector(".dis-countdown") as HTMLElement;
    expect(cd.textContent).toBe("02:00");
    vi.advanceTimersByTime(5000);
    expect(cd.textContent).toBe("01:55");
    sheet.close();
    vi.advanceTimersByTime(5000);
    expect(cd.textContent).toBe("01:55");
  });
  it("follows a new layer while open and ignores updates while closed (WR-W10)", () => {
    const { sheet, btn } = setup();
    sheet.update(L());
    expect(document.querySelectorAll(".dis-row").length).toBe(0);
    const first = L();
    sheet.open(first, btn);
    expect(document.querySelectorAll(".dis-row").length).toBe(2);
    // a cleared disruption leaves; the same layer object again does not re-render
    const row = document.querySelector(".dis-row");
    sheet.update(first);
    expect(document.querySelector(".dis-row")).toBe(row);
    sheet.update(layer([first.items[0]!]));
    expect(document.querySelectorAll(".dis-row").length).toBe(1);
    sheet.update(layer([]));
    expect(document.querySelectorAll(".dis-row").length).toBe(0);
    expect(document.querySelector(".dis-empty")?.textContent).toBe(NO_DISRUPTIONS);
    sheet.close();
  });
  it("drops a disruption once its end has passed instead of showing 00:00 (WR-W10)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(disruptionRows(layer([item("old", { to_ts: NOW / 1000 - 1 }, 0, NOW / 1000 - 1)]), NOW)).toHaveLength(0);
    const { sheet, btn } = setup();
    sheet.open(
      layer([
        item("soon", { route_labels: ["Bus 5"], to_ts: NOW / 1000 + 3 }, 0, NOW / 1000 + 3),
        item("open", { route_labels: ["Tram 96"] }),
      ]),
      btn,
    );
    expect(document.querySelectorAll(".dis-row").length).toBe(2);
    vi.advanceTimersByTime(4000);
    expect(document.querySelectorAll(".dis-row").length).toBe(1);
    expect(document.querySelector(".dis-routes")?.textContent).toBe("Tram 96");
    sheet.close();
  });
});
