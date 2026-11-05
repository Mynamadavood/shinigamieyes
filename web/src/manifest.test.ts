import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { manifest } from "../pwa-manifest";

const root = resolve(__dirname, "..");
const html = readFileSync(resolve(root, "index.html"), "utf8");

describe("manifest", () => {
  it("is installable standalone black", () => {
    expect(manifest.id).toBe("/");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.background_color).toBe("#000000");
    expect(manifest.theme_color).toBe("#000000");
    expect(manifest.name).toBe("Shinigami Eyes");
    const sizes = manifest.icons.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(manifest.icons.some((i) => "purpose" in i && i.purpose === "maskable")).toBe(true);
  });
});

describe("index.html iOS head", () => {
  it("has the required tags", () => {
    expect(html).toContain("viewport-fit=cover");
    expect(html).toContain('name="apple-mobile-web-app-capable"');
    expect(html).toContain('name="mobile-web-app-capable"');
    expect(html).toMatch(/apple-mobile-web-app-status-bar-style"\s+content="black-translucent"/);
    expect(html).toMatch(/name="theme-color"\s+content="#000000"/);
    expect(html).toMatch(/rel="apple-touch-icon"\s+href="\/apple-touch-icon-180.png"/);
  });
  it("apple touch icon is 180x180", () => {
    const png = readFileSync(resolve(root, "public/apple-touch-icon-180.png"));
    expect(png.readUInt32BE(16)).toBe(180);
    expect(png.readUInt32BE(20)).toBe(180);
  });
});
