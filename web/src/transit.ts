export const TRANSIT_LAYERS = [
  "transit_stops",
  "transit_departures",
  "transit_vehicles",
  "transit_disruptions",
] as const;

export type TransitMode = "train" | "tram" | "bus";

export function isTransitLayer(id: string): boolean {
  return id.startsWith("transit_");
}

const ABBREV: Array<[RegExp, string]> = [
  [/\bStreet\b/g, "St"],
  [/\bRoad\b/g, "Rd"],
  [/\bAvenue\b/g, "Ave"],
  [/\bHighway\b/g, "Hwy"],
  [/\bParade\b/g, "Pde"],
  [/\bDrive\b/g, "Dr"],
  [/\bBoulevard\b/g, "Bvd"],
];

/** Tag-sized stop name: text before "/", no Station suffix or "#N", common suffixes abbreviated. */
export function shortStopName(name: string): string {
  let s = (name.split("/")[0] ?? "").trim();
  s = s.replace(/ Railway Station$/, "").replace(/ Station$/, "");
  s = s.replace(/ #\d+$/, "");
  for (const [re, to] of ABBREV) s = s.replace(re, to);
  return s.trim();
}

export function walkSecondsFor(distanceM: number): number {
  return Math.round(distanceM * 0.936);
}

export function walkMinText(walkS: number): string {
  return `${Math.max(1, Math.ceil(walkS / 60))} min`;
}

export function modeWord(mode: string): TransitMode {
  return mode === "train" ? "train" : mode === "bus" ? "bus" : "tram";
}

export function modeTitle(mode: string): "TRAIN STATION" | "TRAM STOP" | "BUS STOP" {
  const m = modeWord(mode);
  return m === "train" ? "TRAIN STATION" : m === "bus" ? "BUS STOP" : "TRAM STOP";
}

export function modeName(mode: string): "Train" | "Tram" | "Bus" {
  const m = modeWord(mode);
  return m === "train" ? "Train" : m === "bus" ? "Bus" : "Tram";
}
