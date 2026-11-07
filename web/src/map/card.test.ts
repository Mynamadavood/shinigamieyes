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

describe("leaderPoints", () => {
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
