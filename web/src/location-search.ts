export interface GeoResult {
  label: string;
  suburb: string | null;
  lat: number;
  lon: number;
}

export const SEARCH_TIMEOUT_MS = 4000;

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
