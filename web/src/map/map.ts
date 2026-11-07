import { Map as MlMap, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "../styles/map.css";
import { withTimeout } from "../timeout";
import type { Profile } from "../types";
import { DEFAULT_FONT, buildStyle, readStyleTokens } from "./style";
import type { MapDeps, MapHandle, MapView } from "./types";
import { CBD_DEFAULT, FOLLOW } from "./view";

const META_KEY = "tiles:meta";
const META_TIMEOUT_MS = 2000;
const EASE_MS = 400;
const OFFLINE_COPY = "Map tiles unavailable offline";
const DEFAULT_PEEK_PX = 144;

let workerSet = false;

/** Tile build id: fresh from the server, else the last stored value, else "0". */
async function resolveBuild(): Promise<string> {
  let fresh: string | null = null;
  try {
    const meta = await withTimeout(
      fetch("/api/tiles/meta").then(async (r) => (r.ok ? ((await r.json()) as unknown) : null)),
      META_TIMEOUT_MS,
      null,
    );
    if (meta && typeof meta === "object" && "build" in meta) {
      fresh = String((meta as { build: unknown }).build);
      try {
        localStorage.setItem(META_KEY, JSON.stringify(meta));
      } catch {
        /* storage full or blocked: not fatal */
      }
    }
  } catch {
    /* offline: fall through to the stored value */
  }
  if (fresh) return fresh;
  try {
    const stored = localStorage.getItem(META_KEY);
    if (stored) {
      const b = (JSON.parse(stored) as { build?: unknown }).build;
      if (b !== undefined && b !== null) return String(b);
    }
  } catch {
    /* corrupt entry */
  }
  return "0";
}

function bottomPadding(): number {
  const drawer = document.querySelector(".drawer");
  const h = drawer ? drawer.getBoundingClientRect().height : 0;
  if (h > 0) return h;
  const peek = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--drawer-peek"));
  return Number.isFinite(peek) ? peek : DEFAULT_PEEK_PX;
}

export async function createMap(deps: MapDeps): Promise<MapHandle | null> {
  if (!workerSet) {
    // same-origin worker asset: CSP stays `worker-src 'self'` (no blob:)
    setWorkerUrl(workerUrl);
    workerSet = true;
  }
  const build = await resolveBuild();
  const style = buildStyle(readStyleTokens(), deps.origin, build, DEFAULT_FONT);

  let map: MlMap;
  try {
    map = new MlMap({
      container: deps.host,
      style,
      center: [CBD_DEFAULT.lon, CBD_DEFAULT.lat],
      zoom: CBD_DEFAULT.zoom,
      pitch: CBD_DEFAULT.pitch,
      bearing: 0,
      maxPitch: 70,
      minZoom: 11,
      maxZoom: 19.5,
      renderWorldCopies: false,
      fadeDuration: 0,
      maxTileCacheSize: 100,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      canvasContextAttributes: { antialias: false, powerPreference: "high-performance" },
      attributionControl: { compact: true },
      cooperativeGestures: false,
    });
  } catch {
    deps.host.classList.add("no-webgl");
    return null;
  }

  const hint = document.createElement("div");
  hint.className = "map-offline-hint";
  hint.textContent = OFFLINE_COPY;
  hint.hidden = true;
  deps.host.appendChild(hint);

  let tileErrors = 0;
  let tileLoads = 0;
  // errors are swallowed and never logged: tile coordinates encode location
  map.on("error", (e: unknown) => {
    if ((e as { tile?: unknown }).tile) tileErrors += 1;
  });
  map.on("sourcedata", (e: unknown) => {
    if ((e as { tile?: unknown }).tile) {
      tileLoads += 1;
      hint.hidden = true;
    }
  });
  map.on("movestart", () => {
    tileErrors = 0;
    tileLoads = 0;
  });
  map.on("idle", () => {
    if (tileErrors >= 1 && tileLoads === 0) hint.hidden = false;
  });

  map.on("click", (e: { originalEvent?: MouseEvent }) => {
    const t = e.originalEvent?.target;
    if (t instanceof Element && t.closest(".map-tag")) return;
    deps.onMapTap();
  });

  const canvas = map.getCanvas();
  canvas.setAttribute("role", "application");
  canvas.setAttribute("aria-label", "3D map of your surroundings");
  canvas.addEventListener("webglcontextlost", (ev) => ev.preventDefault());
  canvas.addEventListener("webglcontextrestored", () => map.triggerRepaint());

  const onVisible = () => {
    if (document.visibilityState === "visible") {
      map.resize();
      map.triggerRepaint();
    }
  };
  document.addEventListener("visibilitychange", onVisible);

  let positioned = false;
  let profile: Profile | null = null;
  void profile; // consumed by 02-10 (tags)

  function setView(v: MapView): void {
    if (v.kind === "none") {
      if (!positioned) {
        map.jumpTo({ center: [CBD_DEFAULT.lon, CBD_DEFAULT.lat], zoom: CBD_DEFAULT.zoom, pitch: CBD_DEFAULT.pitch, bearing: 0 });
        positioned = true;
      }
      return;
    }
    const opts = {
      center: [v.lon, v.lat] as [number, number],
      zoom: FOLLOW.zoom,
      pitch: FOLLOW.pitch,
      bearing: FOLLOW.bearing,
      padding: { top: 0, left: 0, right: 0, bottom: bottomPadding() },
    };
    if (!positioned || deps.reducedMotion) map.jumpTo(opts);
    else map.easeTo({ ...opts, duration: EASE_MS });
    positioned = true;
  }

  return {
    setView,
    setProfile(p) {
      profile = p;
    },
    resize() {
      map.resize();
    },
    destroy() {
      document.removeEventListener("visibilitychange", onVisible);
      hint.remove();
      map.remove();
    },
  };
}
