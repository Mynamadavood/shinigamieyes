import { describe, expect, it } from "vitest";
import {
  GLYPH_CACHE,
  NAV_DENYLIST,
  TILE_CACHE,
  TILE_MAX_AGE_S,
  TILE_MAX_ENTRIES,
  isGlyphRequest,
  isTileRequest,
} from "./sw-routes";

const O = "https://h";

describe("sw-routes", () => {
  it("matches same-origin tiles only", () => {
    expect(isTileRequest(new URL("https://h/tiles/15/1/2.mvt?v=9"), O)).toBe(true);
    expect(isTileRequest(new URL("https://h/api/tiles/meta"), O)).toBe(false);
    expect(isTileRequest(new URL("https://evil/tiles/1/1/1.mvt"), O)).toBe(false);
  });

  it("matches same-origin glyphs only", () => {
    expect(isGlyphRequest(new URL("https://h/glyphs/JetBrainsMono-Regular/0-255.pbf"), O)).toBe(true);
    expect(isGlyphRequest(new URL("https://evil/glyphs/a/0-255.pbf"), O)).toBe(false);
  });

  it("exposes cache constants", () => {
    expect(TILE_MAX_ENTRIES).toBe(2500);
    expect(TILE_MAX_AGE_S).toBe(5184000);
    expect(TILE_CACHE).toBe("tiles-v1");
    expect(GLYPH_CACHE).toBe("glyphs-v1");
  });

  it("denylist covers api, tiles, glyphs but not root", () => {
    const hit = (p: string) => NAV_DENYLIST.some((r) => r.test(p));
    expect(hit("/api/x")).toBe(true);
    expect(hit("/tiles/1/1/1.mvt")).toBe(true);
    expect(hit("/glyphs/a/0-255.pbf")).toBe(true);
    expect(hit("/")).toBe(false);
  });
});
