export interface GeoResult {
  label: string;
  suburb: string | null;
  lat: number;
  lon: number;
}

// Server worst case: up to 3 s queued for the 1 req/s Nominatim slot + 4 s upstream.
export const SEARCH_TIMEOUT_MS = 9000;

export async function searchAddress(
  q: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GeoResult[]> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), SEARCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`/api/geocode?q=${encodeURIComponent(q)}`, {
      signal: ctl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`geocode ${res.status}`);
    return (await res.json()) as GeoResult[];
  } finally {
    clearTimeout(timer);
  }
}
