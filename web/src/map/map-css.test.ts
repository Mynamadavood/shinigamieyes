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
});
