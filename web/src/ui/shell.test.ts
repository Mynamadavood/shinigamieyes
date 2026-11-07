import { describe, expect, it } from "vitest";
import { mountShell } from "./shell";

describe("mountShell", () => {
  it("returns connected slots in map, hud, drawer order", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const s = mountShell(root);
    for (const v of Object.values(s)) expect(v.isConnected).toBe(true);
    expect(s.titleText.textContent).toBe("SHINIGAMI EYES");
    const kids = [...root.children];
    expect(kids.indexOf(s.mapHost)).toBeLessThan(kids.indexOf(s.hud));
    expect(kids.indexOf(s.hud)).toBeLessThan(kids.indexOf(s.drawer));
  });
});
