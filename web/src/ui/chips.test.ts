import { describe, expect, it, vi } from "vitest";
import type { Item, Layer, Profile } from "../types";
import { Chips, LayerToggles, chipsFor } from "./chips";

const NOW = 1_800_000_000_000;
const item = (layer: string, name: string, display: string, severity: number, extra: Record<string, unknown> = {}): Item => ({
  id: `${layer}:${name}`, layer, group: name, name, verb: "now", target_ts: null, kind: "environment", severity,
  detail: { display, chip: true, ...extra }, geom: null, fetched_at: NOW / 1000, stale_after_s: 3600, computed: false,
});
const layer = (id: string, items: Item[], status: Layer["status"] = "fresh"): Layer => ({ id, status, rev: 1, as_of: 1, attribution: "", items });
const prof = (layers: Layer[]): Profile => ({
  server_time: NOW / 1000, rev: 1, location: { source: "gps", lat: 1, lon: 1 },
  layers: Object.fromEntries(layers.map((l) => [l.id, l])),
});

describe("chipsFor (HUD-07)", () => {
  it("orders weather, UV, fire, pollen; keeps only chip items; validates the link", () => {
    const p = prof([
      layer("pollen", [item("pollen", "Grass pollen", "High", 2), item("pollen", "Thunderstorm asthma", "Low", 0)]),
      layer("fire_danger", [item("fire_danger", "Fire danger", "Extreme · Total Fire Ban", 3)]),
      layer("uv_now", [item("uv_now", "UV index now", "7 · High", 2)]),
      layer("weather", [
        item("weather", "Weather", "22° · Drizzle", 0, { link: "https://www.bom.gov.au/x" }),
        { ...item("weather", "Rain starts", "", 0), detail: { approx: true } },
      ]),
    ]);
    const c = chipsFor(p, NOW);
    expect(c.map((x) => x.name)).toEqual(["WX", "UV", "FIRE", "POLLEN", "ASTHMA"]);
    expect(c.map((x) => x.level)).toEqual([0, 2, 3, 2, 0]);
    expect(c[0].link).toBe("https://www.bom.gov.au/x");
    const bad = prof([layer("weather", [item("weather", "Weather", "x", 0, { link: "javascript:alert(1)" })])]);
    expect(chipsFor(bad, NOW)[0].link).toBeNull();
  });

  it("marks a stale layer", () => {
    expect(chipsFor(prof([layer("uv_now", [item("uv_now", "UV index now", "1", 0)], "stale")]), NOW)[0].stale).toBe(true);
  });
});

describe("Chips", () => {
  const vm = (level: number, value = "v") => [{ id: "f", name: "FIRE", value, level, stale: false, link: null }];

  it("bands by level and pulses only when the band rises", () => {
    const host = document.createElement("div");
    const chips = new Chips(host);
    chips.update(vm(1));
    const el = host.querySelector(".chip")!;
    expect(el.classList.contains("lvl-1")).toBe(true);
    expect(el.classList.contains("rise")).toBe(false); // first paint is not an escalation
    chips.update(vm(1, "other value"));
    expect(el.classList.contains("rise")).toBe(false);
    chips.update(vm(0));
    expect(el.classList.contains("rise")).toBe(false);
    chips.update(vm(3));
    expect(el.classList.contains("rise")).toBe(true);
    expect(el.classList.contains("lvl-3") && !el.classList.contains("lvl-1")).toBe(true);
    expect(host.querySelector(".chip")).toBe(el);
    chips.update([]);
    expect(host.hidden).toBe(true);
    expect(host.children).toHaveLength(0);
  });

  it("renders a link chip that opens outside the app", () => {
    const host = document.createElement("div");
    new Chips(host).update([{ id: "w", name: "WX", value: "22°", level: 0, stale: false, link: "https://r.example/" }]);
    const a = host.querySelector<HTMLAnchorElement>("a.chip")!;
    expect(a.href).toBe("https://r.example/");
    expect(a.rel).toBe("noopener noreferrer");
    expect(a.getAttribute("aria-label")).toBe("WX 22°, open rain radar");
  });
});

describe("LayerToggles", () => {
  it("shows pressed state and reports taps", () => {
    const host = document.createElement("div");
    const onToggle = vi.fn();
    const t = new LayerToggles(host, new Set(["fire"]), onToggle);
    const btn = (label: string) => [...host.querySelectorAll("button")].find((b) => b.textContent === label)!;
    expect(btn("Fire").getAttribute("aria-pressed")).toBe("false");
    expect(btn("Transit").getAttribute("aria-pressed")).toBe("true");
    btn("Transit").click();
    expect(onToggle).toHaveBeenCalledWith("transit");
    t.set(new Set());
    expect(btn("Fire").getAttribute("aria-pressed")).toBe("true");
  });
});
