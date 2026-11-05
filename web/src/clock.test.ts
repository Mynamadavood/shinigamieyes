import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { measureOffset, nowMs, setOffset } from "./clock";

describe("clock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setOffset(0);
  });
  afterEach(() => vi.useRealTimers());

  it("measures offset from RTT midpoint", () => {
    expect(measureOffset(1000, 999_000, 999_200)).toBe(900);
  });
  it("nowMs applies the offset", () => {
    vi.setSystemTime(5_000_000);
    setOffset(1100);
    expect(nowMs()).toBe(5_001_100);
  });
  it("remaining is recomputed from absolute time after a silent background", () => {
    vi.setSystemTime(10_000_000);
    const target = nowMs() + 600_000;
    vi.setSystemTime(10_000_000 + 600_000);
    expect(Math.max(0, target - nowMs())).toBe(0);
  });
});
