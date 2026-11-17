import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Regression: maplibre-gl.css loads after hud.css and sets .maplibregl-map { position: relative },
// which collapsed the full-screen map host to 0 px tall (black map, tags off-screen).
describe("map host CSS", () => {
  const css = readFileSync(resolve(process.cwd(), "src/styles/map.css"), "utf8");

  it("keeps the host fixed full-screen with a selector that outranks maplibre-gl.css", () => {
    const rule = css.match(/\.map-host\.maplibregl-map\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/position:\s*fixed/);
    expect(rule![1]).toMatch(/inset:\s*0/);
  });

  // Regression: <use> of /icons.svg does not inherit the sprite root's fill/stroke on iOS,
  // so an icon without its own fill:none + stroke filled black and vanished (blank recenter box).
  it("gives every sprite icon its own fill and stroke", () => {
    const rule = css.match(/\.recenter svg\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/fill:\s*none/);
    expect(rule![1]).toMatch(/stroke:\s*currentColor/);
  });
});

// Regression (WR-W4): a filled tag-in animation (fill-mode both/forwards) keeps opacity 1 after it
// ends and overrides .map-tag.vehicle.fading, so a stale vehicle never faded.
describe("tag CSS", () => {
  const css = readFileSync(resolve(process.cwd(), "src/styles/tags.css"), "utf8");

  it("does not hold the tag-in end value, so the vehicle fade can apply", () => {
    const rule = css.match(/(?:^|\n)\.map-tag\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    const anim = rule![1].match(/animation:\s*([^;]*);/);
    expect(anim).not.toBeNull();
    expect(anim![1]).toMatch(/tag-in/);
    expect(anim![1]).not.toMatch(/\b(both|forwards)\b/);
    expect(css).toMatch(/\.map-tag\.vehicle\.fading\s*\{[^}]*opacity:\s*var\(--o-fade\)/);
  });
});
