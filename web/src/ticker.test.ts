import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setOffset } from "./clock";
import { startTicker } from "./ticker";

describe("startTicker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setOffset(0);
    vi.setSystemTime(1_000_500);
  });
  afterEach(() => vi.useRealTimers());

  it("aligns to the next whole second then ticks each 1000 ms", () => {
    const fn = vi.fn();
    const stop = startTicker(fn);
    expect(fn).toHaveBeenCalledTimes(1); // initial paint
    vi.advanceTimersByTime(499);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(6);
    expect(fn).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(3);
    stop();
  });

  it("ticks immediately on visibilitychange (visible), pageshow, focus", () => {
    const fn = vi.fn();
    const stop = startTicker(fn);
    fn.mockClear();
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(fn).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("pageshow"));
    window.dispatchEvent(new Event("focus"));
    expect(fn).toHaveBeenCalledTimes(3);
    stop();
  });

  it("does not tick on visibilitychange while hidden", () => {
    const fn = vi.fn();
    const stop = startTicker(fn);
    fn.mockClear();
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(fn).not.toHaveBeenCalled();
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    stop();
  });

  it("stop clears timer and listeners", () => {
    const fn = vi.fn();
    const stop = startTicker(fn);
    stop();
    fn.mockClear();
    vi.advanceTimersByTime(5000);
    window.dispatchEvent(new Event("focus"));
    expect(fn).not.toHaveBeenCalled();
  });
});
