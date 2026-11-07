import { describe, expect, it } from "vitest";
import { createFollow } from "./follow";

describe("createFollow", () => {
  it("follows by default and eases on view change", () => {
    const f = createFollow();
    expect(f.following()).toBe(true);
    expect(f.on("viewChanged")).toEqual({ action: "easeTo", showRecenter: false });
  });
  it("user gesture turns follow off and reveals recenter", () => {
    const f = createFollow();
    expect(f.on("userGesture")).toEqual({ action: "none", showRecenter: true });
    expect(f.following()).toBe(false);
  });
  it("view change while off does nothing", () => {
    const f = createFollow();
    f.on("userGesture");
    expect(f.on("viewChanged")).toEqual({ action: "none", showRecenter: true });
  });
  it("recenter flies back and follows again", () => {
    const f = createFollow();
    f.on("userGesture");
    expect(f.on("recenter")).toEqual({ action: "flyTo", showRecenter: false });
    expect(f.following()).toBe(true);
  });
});
