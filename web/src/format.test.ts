import { describe, expect, it } from "vitest";
import { fmtCountdown } from "./format";

describe("fmtCountdown", () => {
  it.each([
    [0, "00:00"],
    [-5, "00:00"],
    [7, "00:07"],
    [1122, "18:42"],
    [3599, "59:59"],
    [3600, "1h 0m"],
    [11520, "3h 12m"],
    [86399, "23h 59m"],
    [86400, "1d 0h"],
    [1231200, "14d 6h"],
    [59.9, "00:59"],
  ])("%s -> %s", (sec, out) => {
    expect(fmtCountdown(sec)).toBe(out);
  });
});
