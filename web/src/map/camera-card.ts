import type { Item } from "../types";
import type { CardContent } from "./card";

const MAX_TEXT = 80;

/** "42 m" under 1000 (nearest metre), else "1.2 km". */
export function fmtDistance(m: number): string {
  const v = Math.max(0, m);
  if (Math.round(v) < 1000) return `${Math.round(v)} m`;
  return `${(v / 1000).toFixed(1)} km`;
}

/** Spoken form for aria-labels: "42 metres", "1.2 kilometres". */
export function spokenDistance(m: number): string {
  const v = Math.max(0, m);
  if (Math.round(v) < 1000) {
    const n = Math.round(v);
    return `${n} ${n === 1 ? "metre" : "metres"}`;
  }
  return `${(v / 1000).toFixed(1)} kilometres`;
}

function text(detail: Record<string, unknown> | null, key: string): string | null {
  const v = detail?.[key];
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, MAX_TEXT) : null;
}

/** Card copy for a camera item. Distance is computed on the client from the live fix. */
export function cameraCardContent(item: Item, distanceM: number): CardContent {
  const d = item.detail;
  const primary = `${fmtDistance(distanceM)} away`;
  if (item.group === "speed" || item.group === "redlight") {
    const road = text(d, "road");
    const suburb = text(d, "suburb");
    const place = [road, suburb].filter((s): s is string => s !== null).join(", ");
    return {
      title: item.group === "speed" ? "SPEED CAMERA" : "RED-LIGHT CAMERA",
      primary,
      ...(place ? { extra: place } : {}),
      secondary: [],
      caveats: ["Source: OpenStreetMap", "Mapped, not exhaustive.", "Static info only."],
    };
  }
  const secondary: Array<[string, string]> = [];
  const type = text(d, "camera_type");
  // directions are words ("north-east"); a bare number would be degrees, which the card never shows
  const dir = text(d, "direction");
  const operator = text(d, "operator");
  const surveillance = text(d, "surveillance");
  if (type) secondary.push(["Type", type]);
  if (dir && !/^[\d.\s]+$/.test(dir)) secondary.push(["Direction", dir]);
  if (operator) secondary.push(["Operator", operator]);
  if (surveillance) secondary.push(["Surveillance", surveillance]);
  return {
    title: "CCTV CAMERA",
    primary,
    secondary,
    caveats: ["Source: OpenStreetMap", "Mapped, not exhaustive."],
  };
}
