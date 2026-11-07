import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { manifest } from "./pwa-manifest";

export default defineConfig({
  build: {
    // Never inline fonts as data: URLs; the CSP has font-src 'self' (no data:), so small
    // @fontsource subsets were blocked. Other small assets keep the default rule.
    assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined),
  },
  plugins: [
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: false,
      manifest,
      injectManifest: {
        globPatterns: [
          "**/*.{js,css,html,woff2,png,webmanifest,svg}",
          "glyphs/*/0-255.pbf",
          "glyphs/*/8192-8447.pbf",
        ],
      },
    }),
  ],
  server: {
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: false },
      "/tiles": { target: "http://127.0.0.1:8000", changeOrigin: false },
    },
  },
});
