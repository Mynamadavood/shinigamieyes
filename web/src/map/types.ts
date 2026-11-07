import type { Profile } from "../types";

export interface StyleTokens {
  bg: string;
  land: string;
  water: string;
  park: string;
  roadMinor: string;
  roadMajor: string;
  rail: string;
  building: string;
  buildingHot: string;
  mapLabel: string;
  frame: string;
}

export type MapView =
  | { kind: "gps"; lat: number; lon: number; accuracy: number }
  | { kind: "search"; lat: number; lon: number; label: string }
  | { kind: "pin"; lat: number; lon: number; label: string }
  | { kind: "none" };

export interface MapDeps {
  host: HTMLElement;
  controls: HTMLElement;
  origin: string;
  reducedMotion: boolean;
  onLongPress(p: { lat: number; lon: number }): void;
  onUseGps(): void;
  onMapTap(): void;
}

export interface MapHandle {
  setView(v: MapView): void;
  setProfile(p: Profile | null): void;
  resize(): void;
  destroy(): void;
}
