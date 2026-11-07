import { describe, expect, it, vi } from "vitest";
import { LONGPRESS_MS, MOVE_TOLERANCE_PX, createLongPress } from "./longpress";

function setup() {
  let fn: (() => void) | null = null;
  const o = {
    onStart: vi.fn(),
    onCancel: vi.fn(),
    onFire: vi.fn(),
    setTimer: vi.fn((f: () => void, ms: number) => {
      fn = f;
      return ms;
    }),
    clearTimer: vi.fn(() => {
      fn = null;
    }),
  };
  const lp = createLongPress(o);
  return { o, lp, fire: () => fn?.() };
}

describe("longpress", () => {
  it("constants", () => {
    expect(LONGPRESS_MS).toBe(500);
    expect(MOVE_TOLERANCE_PX).toBe(10);
  });
  it("fires after 500 ms with the start point", () => {
    const { o, lp, fire } = setup();
    lp.touchStart([{ x: 5, y: 6 }], false);
    expect(o.onStart).toHaveBeenCalledWith(5, 6);
    expect(o.setTimer).toHaveBeenCalledWith(expect.any(Function), 500);
    fire();
    expect(o.onFire).toHaveBeenCalledWith(5, 6);
    expect(o.onCancel).not.toHaveBeenCalled();
  });
  it("cancels past 10 px, tolerates 9 px", () => {
    const a = setup();
    a.lp.touchStart([{ x: 0, y: 0 }], false);
    a.lp.touchMove([{ x: 11, y: 0 }]);
    expect(a.o.onCancel).toHaveBeenCalledTimes(1);
    a.fire();
    expect(a.o.onFire).not.toHaveBeenCalled();
    const b = setup();
    b.lp.touchStart([{ x: 0, y: 0 }], false);
    b.lp.touchMove([{ x: 9, y: 0 }]);
    b.fire();
    expect(b.o.onFire).toHaveBeenCalled();
  });
  it("a second finger cancels", () => {
    const { o, lp, fire } = setup();
    lp.touchStart([{ x: 0, y: 0 }], false);
    lp.touchStart([{ x: 0, y: 0 }, { x: 9, y: 9 }], false);
    expect(o.onCancel).toHaveBeenCalled();
    fire();
    expect(o.onFire).not.toHaveBeenCalled();
  });
  it("does not start on UI", () => {
    const { o, lp } = setup();
    lp.touchStart([{ x: 0, y: 0 }], true);
    expect(o.onStart).not.toHaveBeenCalled();
    expect(o.setTimer).not.toHaveBeenCalled();
  });
  it("map gesture and early release cancel; idle cancels are silent", () => {
    const a = setup();
    a.lp.touchStart([{ x: 0, y: 0 }], false);
    a.lp.mapGesture();
    expect(a.o.onCancel).toHaveBeenCalledTimes(1);
    const b = setup();
    b.lp.touchStart([{ x: 0, y: 0 }], false);
    b.lp.touchEnd();
    expect(b.o.onCancel).toHaveBeenCalledTimes(1);
    b.lp.touchEnd();
    expect(b.o.onCancel).toHaveBeenCalledTimes(1);
  });
});
