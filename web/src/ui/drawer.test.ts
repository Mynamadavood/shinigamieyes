import { afterEach, describe, expect, it, vi } from "vitest";
import { Drawer, FLICK_V, snapTarget } from "./drawer";
import { mountShell } from "./shell";

const P = { peek: 144, half: 400, full: 800 };

describe("snapTarget", () => {
  it("FLICK_V is 0.5", () => expect(FLICK_V).toBe(0.5));
  it("nearest", () => {
    expect(snapTarget(160, 0, P)).toBe("peek");
    expect(snapTarget(380, 0, P)).toBe("half");
    expect(snapTarget(700, 0.4, P)).toBe("full");
  });
  it("flick up goes to next point up", () => expect(snapTarget(250, 0.6, P)).toBe("half"));
  it("flick down goes to next point down", () => expect(snapTarget(600, -0.6, P)).toBe("half"));
});

function setup() {
  const root = document.createElement("div");
  document.body.append(root);
  const s = mountShell(root);
  const snaps: string[] = [];
  const d = new Drawer(s.drawer, { onSnap: (x) => snaps.push(x) });
  const handle = s.drawer.querySelector(".drawer-handle") as HTMLElement;
  return { d, handle, snaps };
}
function ptr(type: string, y: number): Event {
  const e = new Event(type, { bubbles: true });
  Object.assign(e, { clientY: y, pointerId: 1 });
  return e;
}

describe("Drawer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it("handle tap cycles peek/half and updates aria", () => {
    const { d, handle } = setup();
    expect(handle.getAttribute("aria-expanded")).toBe("false");
    expect(handle.getAttribute("aria-label")).toBe("Expand next up");
    handle.dispatchEvent(ptr("pointerdown", 500));
    handle.dispatchEvent(ptr("pointerup", 500));
    expect(d.state()).toBe("half");
    expect(handle.getAttribute("aria-expanded")).toBe("true");
    expect(handle.getAttribute("aria-label")).toBe("Collapse next up");
    handle.dispatchEvent(ptr("pointerdown", 500));
    handle.dispatchEvent(ptr("pointerup", 500));
    expect(d.state()).toBe("peek");
  });

  it("flick up snaps higher and calls onSnap", () => {
    let t = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => t);
    const { d, handle, snaps } = setup();
    handle.dispatchEvent(ptr("pointerdown", 700));
    t = 1100;
    handle.dispatchEvent(ptr("pointermove", 400));
    handle.dispatchEvent(ptr("pointerup", 400));
    expect(d.state()).not.toBe("peek");
    expect(snaps.length).toBe(1);
  });
});
