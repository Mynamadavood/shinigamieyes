/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<unknown> };

precacheAndRoute(self.__WB_MANIFEST as never);
cleanupOutdatedCaches();
clientsClaim();
self.skipWaiting();

registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), { denylist: [new RegExp("^/api/")] }),
);
