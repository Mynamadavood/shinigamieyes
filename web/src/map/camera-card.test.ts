import { describe, expect, it } from "vitest";
import { cameraCardContent, fmtDistance, spokenDistance } from "./camera-card";
import type { Item } from "../types";

function item(group: string, detail: Record<string, unknown>): Item {
  return {
    id: "x", layer: "cameras_cctv", group, name: "Camera", verb: "", target_ts: null, kind: "static" as Item["kind"],
    severity: 0, detail, geom: { type: "Point", coordinates: [144.9, -37.8] }, fetched_at: 0, stale_after_s: null, computed: true,
  };
}

describe("fmtDistance", () => {
  it("rounds under 1000 m and uses km above", () => {
    expect(fmtDistance(41.6)).toBe("42 m");
    expect(fmtDistance(999.4)).toBe("999 m");
    expect(fmtDistance(1234)).toBe("1.2 km");
  });
  it("speaks metres and kilometres", () => {
    expect(spokenDistance(42)).toBe("42 metres");
    expect(spokenDistance(1234)).toBe("1.2 kilometres");
  });
});

describe("cameraCardContent", () => {
  it("builds the guard post card", () => {
    const c = cameraCardContent(item("guard", { operator: "Acme Security", phone: "1", name: "N" }), 30);
    expect(c.title).toBe("GUARD POST");
    expect(c.primary).toBe("30 m away");
    expect(c.secondary).toEqual([["Operator", "Acme Security"]]);
    expect(c.caveats).toEqual(["Source: OpenStreetMap", "Mapped, not exhaustive."]);
  });
  it("builds the CCTV card with optional rows", () => {
    const c = cameraCardContent(item("cctv", { direction: "north-east", operator: "Test Council" }), 42);
    expect(c.title).toBe("CCTV CAMERA");
    expect(c.primary).toBe("42 m away");
    expect(c.secondary).toEqual([["Direction", "north-east"], ["Operator", "Test Council"]]);
    expect(c.caveats).toEqual(["Source: OpenStreetMap", "Mapped, not exhaustive."]);
  });
  it("omits missing fields and never prints degrees or unknown", () => {
    const c = cameraCardContent(item("cctv", { direction: "45", camera_type: "  " }), 10);
    expect(c.secondary).toEqual([]);
    expect(JSON.stringify(c)).not.toMatch(/unknown/i);
  });
  it("builds speed and red-light cards with static-only copy", () => {
    const s = cameraCardContent(item("speed", { road: "Test Rd", suburb: "Testville" }), 640);
    expect(s.title).toBe("SPEED CAMERA");
    expect(s.primary).toBe("640 m away");
    expect(s.extra).toBe("Test Rd, Testville");
    expect(s.caveats).toEqual(["Source: OpenStreetMap", "Mapped, not exhaustive.", "Static info only."]);
    const r = cameraCardContent(item("redlight", {}), 900);
    expect(r.title).toBe("RED-LIGHT CAMERA");
    expect(r.extra).toBeUndefined();
    for (const c of [s, r, cameraCardContent(item("cctv", {}), 5)]) {
      expect(JSON.stringify(c)).not.toMatch(/ahead|approaching|alert|Victorian road safety/i);
    }
  });
});
