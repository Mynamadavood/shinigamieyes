import { describe, expect, it } from "vitest";
import { ringRadiusPx } from "./accuracy-ring";
import { createFigureElement, createPinElement } from "./marker-figure";

describe("ringRadiusPx", () => {
  it("is null at or below 10 m", () => {
    expect(ringRadiusPx(5, -37.8, 17)).toBeNull();
    expect(ringRadiusPx(10, -37.8, 17)).toBeNull();
  });
  it("clamps to 16..150", () => {
    expect(ringRadiusPx(12, -37.8, 17)).toBeGreaterThanOrEqual(16);
    expect(ringRadiusPx(5000, -37.8, 19)).toBe(150);
  });
  it("grows with zoom", () => {
    const a = ringRadiusPx(100, -37.8, 15)!;
    const b = ringRadiusPx(100, -37.8, 17)!;
    expect(b).toBeGreaterThan(a);
  });
});

describe("markers", () => {
  it("figure svg", () => {
    const el = createFigureElement();
    const svg = el.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 32 32");
    expect(svg.getAttribute("class")).toBe("marker-figure");
    expect(svg.getAttribute("aria-label")!.startsWith("Your position")).toBe(true);
  });
  it("pin has a centre hole", () => {
    const el = createPinElement();
    expect(el.classList.contains("marker-pin")).toBe(true);
    expect(el.querySelector("svg circle")).not.toBeNull();
  });
});
