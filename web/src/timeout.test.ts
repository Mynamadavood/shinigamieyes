import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withTimeout } from "./timeout";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("withTimeout", () => {
  it("resolves to the fallback when the promise never settles", async () => {
    const p = withTimeout(new Promise<number>(() => {}), 300, -1);
    await vi.advanceTimersByTimeAsync(301);
    await expect(p).resolves.toBe(-1);
  });
  it("resolves to the value when it settles first and clears the timer", async () => {
    const p = withTimeout(Promise.resolve(7), 300, -1);
    await expect(p).resolves.toBe(7);
    expect(vi.getTimerCount()).toBe(0);
  });
});
