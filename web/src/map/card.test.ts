import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Card, placeCard } from "./card";
import { leaderPoints } from "./leader";

const VP = { w: 400, h: 800 };
const SAFE = { top: 60, bottom: 140 };
const CARD = { w: 224, h: 100 };

describe("placeCard", () => {
  it("prefers the right, vertically centred", () => {
    const p = placeCard({ x: 50, y: 300, w: 32, h: 32 }, CARD, VP, SAFE);
    expect(p).toEqual({ x: 98, y: 266, side: "right" });
  });
  it("flips left when the right edge would pass the viewport margin", () => {
    const p = placeCard({ x: 300, y: 300, w: 32, h: 32 }, CARD, VP, SAFE);
    expect(p.side).toBe("left");
    expect(p.x).toBe(300 - 16 - 224);
  });
  it("shifts y inside the safe band", () => {
    expect(placeCard({ x: 50, y: 10, w: 32, h: 32 }, CARD, VP, SAFE).y).toBe(60);
    expect(placeCard({ x: 50, y: 780, w: 32, h: 32 }, CARD, VP, SAFE).y).toBe(800 - 140 - 100);
  });
  it("goes above when neither side fits", () => {
    const p = placeCard({ x: 150, y: 400, w: 32, h: 32 }, CARD, { w: 300, h: 800 }, SAFE);
    expect(p.side).toBe("above");
    expect(p.y).toBe(400 - 16 - 100);
    expect(p.x).toBeGreaterThanOrEqual(16);
  });
});

describe("placeCard avoidance", () => {
  const tag = { x: 300, y: 300, w: 32, h: 32 };
  const blockRight = { x: 350, y: 300, w: 40, h: 32 };
  const blockLeft = { x: 250, y: 300, w: 40, h: 32 };
  it("goes left when the right slot is covered", () => {
    expect(placeCard(tag, CARD, { w: 700, h: 800 }, SAFE, 16, [blockRight]).side).toBe("left");
  });
  it("goes above when right and left are covered", () => {
    const p = placeCard(tag, CARD, { w: 700, h: 800 }, SAFE, 16, [blockRight, blockLeft]);
    expect(p.side).toBe("above");
  });
  it("goes below when right, left and above are covered", () => {
    const above = { x: 200, y: 200, w: 200, h: 40 };
    const p = placeCard(tag, CARD, { w: 700, h: 800 }, SAFE, 16, [blockRight, blockLeft, above]);
    expect(p).toMatchObject({ side: "below", y: 300 + 32 + 16 });
  });
  it("prefers the previous side on a tie", () => {
    const t = { x: 300, y: 300, w: 32, h: 32 };
    expect(placeCard(t, CARD, { w: 700, h: 800 }, SAFE, 16, [], "left").side).toBe("left");
    expect(placeCard(t, CARD, { w: 700, h: 800 }, SAFE, 16, [], undefined).side).toBe("right");
  });
  it("falls back to clamped above when nothing fits", () => {
    const p = placeCard({ x: 10, y: 20, w: 32, h: 32 }, CARD, { w: 200, h: 200 }, SAFE);
    expect(p.side).toBe("above");
    expect(p.y).toBe(60);
  });
});

describe("leaderPoints", () => {
  it("runs from the tag bottom edge to a card below", () => {
    const p = leaderPoints({ x: 96, y: 100, w: 32, h: 32 }, { x: 0, y: 148, w: 224, h: 100 });
    expect(p.y1).toBe(132);
    expect(p.y2).toBe(148);
    expect(p.x2).toBe(112);
  });
  it("runs from the tag edge to the card's near edge midpoint", () => {
    const p = leaderPoints({ x: 0, y: 100, w: 32, h: 32 }, { x: 48, y: 80, w: 224, h: 100 });
    expect(p).toEqual({ x1: 32, y1: 116, x2: 48, y2: 130 });
  });
});

describe("Card", () => {
  let anchor: HTMLElement;
  let card: Card;
  beforeEach(() => {
    document.body.innerHTML = "";
    anchor = document.createElement("div");
    anchor.tabIndex = 0;
    document.body.append(anchor);
    card = new Card(document.body);
  });
  afterEach(() => card.destroy());

  const content = {
    title: "CCTV CAMERA",
    primary: "42 m away",
    secondary: [["Type", "dome"]] as Array<[string, string]>,
    caveats: ["Source: OpenStreetMap"],
  };

  it("opens as a labelled dialog and renders text only", () => {
    card.open(anchor, { ...content, title: "<b>x</b>" });
    const d = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(card.isOpen()).toBe(true);
    expect(d.getAttribute("aria-label")).toBe("<b>x</b>");
    expect(d.querySelector("b")).toBeNull();
    expect(d.textContent).toContain("Type: dome");
  });

  it("places the card left when another tag covers the right slot", () => {
    const rect = (x: number, y: number, w: number, h: number) =>
      ({ left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, x, y, toJSON() {} }) as DOMRect;
    anchor.className = "map-tag";
    const icon = document.createElement("div");
    icon.className = "tag-icon";
    anchor.append(icon);
    vi.spyOn(icon, "getBoundingClientRect").mockReturnValue(rect(600, 300, 32, 32));
    const other = document.createElement("div");
    other.className = "map-tag";
    const oi = document.createElement("div");
    oi.className = "tag-icon";
    other.append(oi);
    document.body.append(other);
    vi.spyOn(oi, "getBoundingClientRect").mockReturnValue(rect(660, 300, 32, 32));
    Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true });
    card.open(anchor, content);
    const root = document.querySelector<HTMLElement>(".card")!;
    expect(parseInt(root.style.left, 10)).toBeLessThan(600);
  });

  it("marks near cards and calls onClose once", () => {
    const onClose = vi.fn();
    card.open(anchor, content, { near: true, onClose });
    expect(document.querySelector(".card")!.classList.contains("near")).toBe(true);
    card.close();
    card.close();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(card.isOpen()).toBe(false);
  });

  it("Escape closes and focus returns to the anchor", () => {
    card.open(anchor, content);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(card.isOpen()).toBe(false);
    expect(document.activeElement).toBe(anchor);
  });

  it("opening another card closes the first one's selection", () => {
    const first = vi.fn();
    card.open(anchor, content, { onClose: first });
    card.open(anchor, content);
    expect(first).toHaveBeenCalledTimes(1);
    expect(card.isOpen()).toBe(true);
  });

  it("an outside pointerdown closes; one inside does not", () => {
    card.open(anchor, content);
    document.querySelector(".card")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(card.isOpen()).toBe(true);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(card.isOpen()).toBe(false);
  });
});

describe("Card sections", () => {
  let anchor: HTMLElement;
  let card: Card;
  const base = { title: "TRAM STOP", secondary: [] as Array<[string, string]>, caveats: ["Source: PTV"] };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-15T00:00:00.000Z"));
    document.body.innerHTML = "";
    anchor = document.createElement("div");
    anchor.tabIndex = 0;
    document.body.append(anchor);
    card = new Card(document.body);
  });
  afterEach(() => {
    card.destroy();
    vi.useRealTimers();
  });
  const target = () => Date.now() + 192_500;
  const secs = (t: number) => [
    {
      head: "96 to St Kilda Beach",
      lines: [
        { cls: ["live"], countTargetMs: t, mark: { text: "LIVE", cls: "live" }, note: "delayed 3 min", warn: 1 as const },
        { cls: ["missed"], countTargetMs: t + 60_000, mark: { text: "LIVE", cls: "live" }, note: "too late" },
        { cls: ["cancelled"], countTargetMs: t + 90_000, chip: "CANCELLED" },
      ],
    },
    { cls: "stale", lines: [{ cls: [], text: "Departures 3m old" }] },
  ];

  it("renders heads, lines, chips and classes", () => {
    card.open(anchor, { ...base, extra: "27 m", sections: secs(target()) });
    const root = document.querySelector<HTMLElement>(".card")!;
    expect(root.querySelector(".card-dep-head")!.textContent).toBe("96 to St Kilda Beach");
    expect(root.querySelectorAll(".card-dep")).toHaveLength(4);
    expect(root.querySelector(".card-dep.missed")).not.toBeNull();
    expect(root.querySelector(".dep-chip")!.textContent).toBe("CANCELLED");
    expect(root.querySelector(".dep-warn")).not.toBeNull();
    expect(root.querySelector(".dep-mark")!.textContent).toBe("LIVE");
    expect(root.querySelector(".card-dep-group.stale")).not.toBeNull();
    expect(root.querySelector(".dep-count")!.textContent).toBe("03:12");
    expect(root.querySelector(".card-extra")!.nextElementSibling!.className).toContain("card-sections");
    expect(root.getAttribute("style") ?? "").not.toContain("max-h");
  });

  it("ticks the same node once a second and stops on close", () => {
    card.open(anchor, { ...base, sections: secs(target()) });
    const c = document.querySelector<HTMLElement>(".dep-count")!;
    expect(c.textContent).toBe("03:12");
    vi.advanceTimersByTime(1100);
    expect(document.querySelector(".dep-count")).toBe(c);
    expect(c.textContent).toBe("03:11");
    card.close();
    vi.advanceTimersByTime(5000);
    expect(c.textContent).toBe("03:11");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("replace keeps the root and restarts ticking for the new targets", () => {
    card.open(anchor, { ...base, sections: secs(target()) });
    const root = document.querySelector(".card")!;
    card.replace({ ...base, title: "TRAM STOP", extra: "new", sections: secs(Date.now() + 60_500) });
    expect(document.querySelector(".card")).toBe(root);
    expect(card.isOpen()).toBe(true);
    expect(root.querySelector(".card-extra")!.textContent).toBe("new");
    const c = root.querySelector<HTMLElement>(".dep-count")!;
    expect(c.textContent).toBe("01:00");
    vi.advanceTimersByTime(1100);
    expect(c.textContent).toBe("00:59");
  });

  it("scrolls the groups block when it is taller than the space", () => {
    const sec = secs(target());
    const orig = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const h = this.classList.contains("card-sections") ? 600 : this.classList.contains("card") ? 700 : 0;
      return { ...orig.call(this), height: h, width: 224 } as DOMRect;
    });
    card.open(anchor, { ...base, sections: sec });
    const g = document.querySelector<HTMLElement>(".card-sections")!;
    expect(g.classList.contains("scroll")).toBe(true);
    expect(g.style.getPropertyValue("--card-max-h")).toMatch(/px$/);
    expect(document.querySelector(".card")!.getAttribute("style") ?? "").not.toContain("--card-max-h");
    vi.restoreAllMocks();
  });

  it("dims a line that becomes uncatchable and hides a departed one between frames (WR-W2)", () => {
    const now = Date.now();
    card.open(anchor, {
      ...base,
      sections: [
        {
          head: "96 to St Kilda Beach",
          lines: [
            { cls: ["live"], countTargetMs: now + 5_000, mark: { text: "LIVE", cls: "live" }, goneAtMs: now + 20_000 },
            {
              cls: ["live"], countTargetMs: now + 60_000, mark: { text: "LIVE", cls: "live" }, note: "plat 4",
              missAtMs: now + 3_000, goneAtMs: now + 75_000,
            },
          ],
        },
      ],
    });
    const lines = document.querySelectorAll<HTMLElement>(".card-dep");
    expect(lines[1].classList.contains("missed")).toBe(false);
    expect(lines[1].querySelector(".dep-note")!.textContent).toBe("plat 4");
    vi.advanceTimersByTime(4_000);
    expect(lines[1].classList.contains("missed")).toBe(true);
    expect(lines[1].querySelector(".dep-note")!.textContent).toBe("too late");
    expect(lines[0].hidden).toBe(false);
    vi.advanceTimersByTime(17_000);
    expect(lines[0].hidden).toBe(true);
    expect(document.querySelector<HTMLElement>(".card-dep-group")!.hidden).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(lines[1].hidden).toBe(true);
    expect(document.querySelector<HTMLElement>(".card-dep-group")!.hidden).toBe(true);
  });

  it("replace keeps the scroll position of the groups block (WR-W2)", () => {
    card.open(anchor, { ...base, sections: secs(target()) });
    document.querySelector<HTMLElement>(".card-sections")!.scrollTop = 120;
    card.replace({ ...base, sections: secs(target()) });
    expect(document.querySelector<HTMLElement>(".card-sections")!.scrollTop).toBe(120);
  });

  it("cards without sections do not start a ticker", () => {
    card.open(anchor, { ...base });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("text lines with a warn glyph", () => {
  it("renders the glyph before the text", () => {
    const card = new Card(document.body);
    card.open(document.body, {
      title: "T", secondary: [], caveats: [],
      sections: [{ lines: [{ cls: ["card-alert", "stop"], warn: 3, text: "Trams replaced" }] }],
    });
    const el = document.querySelector(".card-alert")!;
    expect(el.querySelector("svg.dep-warn.stop")).not.toBeNull();
    expect(el.textContent).toBe("Trams replaced");
    card.destroy();
  });
});
