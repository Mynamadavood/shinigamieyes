export type ItemKind =
  | "place"
  | "infrastructure"
  | "transit_vehicle"
  | "aircraft"
  | "vessel"
  | "self"
  | "environment";

export interface Item {
  id: string;
  layer: string;
  group: string;
  name: string;
  verb: string;
  target_ts: number | null;
  kind: ItemKind;
  severity: number;
  detail: Record<string, unknown> | null;
  geom: unknown | null;
  fetched_at: number;
  stale_after_s: number | null;
  computed: boolean;
}

export type LayerStatus = "fresh" | "stale" | "pending" | "error" | "out_of_coverage";

export interface Layer {
  id: string;
  status: LayerStatus;
  rev: number;
  as_of: number | null;
  attribution: string;
  items: Item[];
}

export interface ProfileLocation {
  source: "gps" | "pin" | "search" | "default";
  lat: number | null;
  lon: number | null;
  place_id?: string | null;
  label?: string | null;
}

export interface Profile {
  server_time: number;
  rev: number;
  location: ProfileLocation;
  layers: Record<string, Layer>;
}
