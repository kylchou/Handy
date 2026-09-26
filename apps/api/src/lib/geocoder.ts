export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** Turns an address into coordinates. Returns null when it can't find it. */
export interface Geocoder {
  geocode(address: string): Promise<Coordinates | null>;
}

/** Used when lookups are turned off (GEOCODER=off) and in tests. */
export const noGeocoder: Geocoder = { geocode: async () => null };

/** If an address came in without coordinates, look them up. Otherwise returns the input as is. */
export async function fillCoordinates<T extends { address?: string | null; latitude?: number | null; longitude?: number | null }>(
  geocoder: Geocoder,
  input: T,
): Promise<T> {
  if (!input.address || input.latitude != null || input.longitude != null) return input;
  const found = await geocoder.geocode(input.address);
  return found ? { ...input, ...found } : input;
}

type FetchLike = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/**
 * OpenStreetMap's free geocoder. Their usage policy asks for at most one
 * request per second and a User-Agent that identifies the app, so lookups are
 * queued, cached, and sent with GEOCODER_CONTACT.
 * https://operations.osmfoundation.org/policies/nominatim/
 */
export class NominatimGeocoder implements Geocoder {
  private cache = new Map<string, Coordinates | null>();
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  constructor(
    private opts: {
      contact: string;
      baseUrl?: string;
      timeoutMs?: number;
      minIntervalMs?: number;
      fetch?: FetchLike;
      /** Called when a lookup fails, so the app can log it. */
      onError?: (err: unknown) => void;
    },
  ) {}

  async geocode(address: string): Promise<Coordinates | null> {
    const key = address.trim().toLowerCase().replace(/\s+/g, " ");
    if (!key) return null;
    if (this.cache.has(key)) return this.cache.get(key)!;

    // One at a time, spaced out, so we never go over their rate limit.
    const result = this.queue.then(() => this.lookup(address));
    this.queue = result.catch(() => undefined);
    const coords = await result;
    // Don't cache failures (timeouts etc.), only real answers.
    if (coords !== undefined) this.cache.set(key, coords);
    if (this.cache.size > 1000) this.cache.delete(this.cache.keys().next().value!);
    return coords ?? null;
  }

  /** Returns undefined if the lookup itself failed, null if the address wasn't found. */
  private async lookup(address: string): Promise<Coordinates | null | undefined> {
    const wait = this.lastRequestAt + (this.opts.minIntervalMs ?? 1000) - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequestAt = Date.now();

    const url = new URL("/search", this.opts.baseUrl ?? "https://nominatim.openstreetmap.org");
    url.searchParams.set("q", address);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "us");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 5000);
    try {
      const doFetch = this.opts.fetch ?? (fetch as unknown as FetchLike);
      const res = await doFetch(url.toString(), {
        headers: { "User-Agent": `Handy (${this.opts.contact})`, Accept: "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Nominatim responded ${String((res as { status?: number }).status ?? "")}`);
      const [hit] = (await res.json()) as Array<{ lat: string; lon: string }>;
      if (!hit) return null;
      const latitude = Number(hit.lat);
      const longitude = Number(hit.lon);
      return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
    } catch (err) {
      this.opts.onError?.(err);
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }
}
