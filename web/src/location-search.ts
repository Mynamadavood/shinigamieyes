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

export const SUGGEST_TIMEOUT_MS = 4000;

/** Type-ahead suggestions (server proxies Photon). `signal` cancels a superseded query. */
export async function suggestAddress(
  q: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<GeoResult[]> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), SUGGEST_TIMEOUT_MS);
  const onAbort = () => ctl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetchImpl(`/api/suggest?q=${encodeURIComponent(q)}`, {
      signal: ctl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`suggest ${res.status}`);
    return (await res.json()) as GeoResult[];
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
