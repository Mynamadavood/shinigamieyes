// Route matchers and cache constants for the service worker (D-15, HUD-10).
// Kept separate from sw.ts so they can be unit-tested without a worker scope.

export const TILE_CACHE = "tiles-v1";
export const GLYPH_CACHE = "glyphs-v1";
export const TILE_MAX_ENTRIES = 2500;
export const TILE_MAX_AGE_S = 60 * 24 * 60 * 60; // 60 days

// Navigation fallback must never swallow API, tile or glyph requests.
export const NAV_DENYLIST: RegExp[] = [/^\/api\//, /^\/tiles\//, /^\/glyphs\//];

/** Same-origin vector tile request (/tiles/{z}/{x}/{y}.mvt). */
export function isTileRequest(url: URL, origin: string): boolean {
  return url.origin === origin && url.pathname.startsWith("/tiles/");
}

/** Same-origin glyph range request (/glyphs/{font}/{range}.pbf). */
export function isGlyphRequest(url: URL, origin: string): boolean {
  return url.origin === origin && url.pathname.startsWith("/glyphs/");
}
