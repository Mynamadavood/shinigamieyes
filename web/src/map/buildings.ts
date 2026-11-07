import type { CardContent } from "./card";

export interface BuildingFeature {
  id?: number | string;
  properties?: Record<string, unknown> | null;
  geometry?: unknown;
}

/** The slice of maplibre's Map that the selector uses. */
export interface BuildingMap {
  setFeatureState(f: { source: string; sourceLayer: string; id: number | string }, s: Record<string, unknown>): void;
  removeFeatureState(f: { source: string; sourceLayer: string; id: number | string }, key?: string): void;
  getSource(id: string): unknown;
  addSource(id: string, spec: unknown): void;
  getLayer(id: string): unknown;
  addLayer(spec: unknown, before?: string): void;
}

const SOURCE = "protomaps";
const SOURCE_LAYER = "buildings";
const HOT_SOURCE = "building-hot";
const HOT_LAYER = "buildings-hot";

export function buildingHeight(props: Record<string, unknown> | null | undefined): number | null {
  const h = props?.height;
  return typeof h === "number" && Number.isFinite(h) && h > 0 ? h : null;
}

export function buildingCardContent(height: number | null): CardContent {
  const content: CardContent = {
    title: "BUILDING",
    secondary: [],
    // caveat rows render dim; the card has no label-less secondary row
    caveats: height === null ? ["No height data", "Source: OpenStreetMap"] : ["Source: OpenStreetMap"],
  };
  if (height !== null) content.primary = `Height: ${Math.round(height)} m`;
  return content;
}

/**
 * One selected building at a time, tinted red. Uses feature-state when the tile feature has an id;
 * otherwise (RESEARCH A3 unverified) falls back to a flat GeoJSON extrusion overlay.
 */
export class BuildingSelector {
  private prevId: number | string | null = null;
  private fallback = false;

  constructor(
    private readonly map: BuildingMap,
    private readonly hotColor: string = "#E0202A",
  ) {}

  usesFallback(): boolean {
    return this.fallback;
  }

  select(feature: BuildingFeature): void {
    this.clear();
    const id = feature.id;
    if (typeof id === "number" || (typeof id === "string" && id !== "")) {
      this.map.setFeatureState({ source: SOURCE, sourceLayer: SOURCE_LAYER, id }, { selected: true });
      this.prevId = id;
      return;
    }
    this.fallback = true;
    this.ensureOverlay();
    const src = this.map.getSource(HOT_SOURCE) as { setData(d: unknown): void } | undefined;
    src?.setData({
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: feature.properties ?? {}, geometry: feature.geometry }],
    });
  }

  clear(): void {
    if (this.prevId !== null) {
      this.map.removeFeatureState({ source: SOURCE, sourceLayer: SOURCE_LAYER, id: this.prevId }, "selected");
      this.prevId = null;
    }
    if (this.fallback) {
      const src = this.map.getSource(HOT_SOURCE) as { setData(d: unknown): void } | undefined;
      src?.setData({ type: "FeatureCollection", features: [] });
    }
  }

  private ensureOverlay(): void {
    if (!this.map.getSource(HOT_SOURCE)) {
      this.map.addSource(HOT_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    }
    if (!this.map.getLayer(HOT_LAYER)) {
      this.map.addLayer({
        id: HOT_LAYER,
        type: "fill-extrusion",
        source: HOT_SOURCE,
        paint: {
          "fill-extrusion-color": this.hotColor,
          "fill-extrusion-height": ["coalesce", ["get", "height"], 8],
          "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
          "fill-extrusion-opacity": 1,
          "fill-extrusion-vertical-gradient": false,
        },
      });
    }
  }
}
