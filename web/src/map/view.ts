import type { LocationState } from "../location";
import type { Profile } from "../types";
import type { MapView } from "./types";

export const CBD_DEFAULT = { lat: -37.8136, lon: 144.9631, zoom: 14, pitch: 0 };
export const PIN_AREA_ZOOM = 12;
export const FOLLOW = { zoom: 17, pitch: 60, bearing: 0 };

/** Location state to the map's camera target. A saved place shows only the 0.1 degree cell centre (area level, no exact marker). */
export function mapViewFor(s: LocationState, p: Profile | null): MapView {
  if (s.mode === "search" && s.search) {
    return { kind: "search", lat: s.search.lat, lon: s.search.lon, label: s.search.label };
  }
  if (s.mode === "gps" && s.lastFix) {
    return { kind: "gps", lat: s.lastFix.lat, lon: s.lastFix.lon, accuracy: s.lastFix.accuracy };
  }
  if (s.mode === "pin" && s.pin) {
    const lat = p?.location?.cell_lat;
    const lon = p?.location?.cell_lon;
    if (typeof lat === "number" && typeof lon === "number") {
      return { kind: "pin", lat, lon, label: s.pin.label };
    }
  }
  return { kind: "none" };
}
