/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { ExpirationPlugin } from "workbox-expiration";
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import {
  GLYPH_CACHE,
  NAV_DENYLIST,
  TILE_CACHE,
  TILE_MAX_AGE_S,
  TILE_MAX_ENTRIES,
  isGlyphRequest,
  isTileRequest,
} from "./sw-routes";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<unknown> };

precacheAndRoute(self.__WB_MANIFEST as never);
cleanupOutdatedCaches();
clientsClaim();
self.skipWaiting();

// D-15: tiles David has seen stay available offline. 200 only (204 = outside extract).
registerRoute(
  ({ url }) => isTileRequest(url, self.location.origin),
  new CacheFirst({
    cacheName: TILE_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({
        maxEntries: TILE_MAX_ENTRIES,
        maxAgeSeconds: TILE_MAX_AGE_S,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);

// Glyph ranges are small and immutable; cache without expiry.
registerRoute(
  ({ url }) => isGlyphRequest(url, self.location.origin),
  new CacheFirst({
    cacheName: GLYPH_CACHE,
    plugins: [new CacheableResponsePlugin({ statuses: [200] })],
  }),
);

registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), { denylist: NAV_DENYLIST }),
);
