import "server-only";
// Address → coordinates for "nearest pharmacy". Runs only on the server; the 2GIS key never reaches the browser.
// Providers: 2GIS (when TWOGIS_API_KEY is set) or the public OpenStreetMap Nominatim service (no key; its usage
// policy allows light use with an identifying User-Agent, at most 1 request per second, with caching).
// Searches are limited to Astana and its suburbs. Addresses typed by visitors are never logged.
import { env } from "./env";

export interface GeoPoint {
  lat: number;
  lng: number;
  /** Address as the geocoder understood it (shown so the visitor can check it). */
  label: string;
}

export class GeocoderUnavailableError extends Error {}

/** Astana with the suburbs where SALAMAT has pharmacies (Ilyinka, Zhibek Zholy). */
const AREA = { west: 71.0, south: 50.85, east: 72.0, north: 51.4 };
const CENTER = { lat: 51.128, lng: 71.43 };

export function geocoderProvider(): "2gis" | "nominatim" | "off" {
  if (env.geocoder.mode === "off") return "off";
  if (env.geocoder.twoGisKey) return "2gis";
  return "nominatim";
}

export function inArea(lat: number, lng: number): boolean {
  return lat >= AREA.south && lat <= AREA.north && lng >= AREA.west && lng <= AREA.east;
}

// Small in-memory cache (per server instance): repeated searches do not hit the provider again.
const cache = new Map<string, { at: number; value: GeoPoint | null }>();
const CACHE_TTL_MS = 24 * 3600_000;
const CACHE_MAX = 500;

function cacheGet(key: string): GeoPoint | null | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}
function cacheSet(key: string, value: GeoPoint | null) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), value });
}

// Nominatim: at most one request per second from this instance.
let nextSlot = 0;
async function nominatimSlot() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + 1100;
  if (wait > 3000) throw new GeocoderUnavailableError("busy");
  if (wait) await new Promise((r) => setTimeout(r, wait));
}

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(6000), cache: "no-store" });
  if (!res.ok) throw new GeocoderUnavailableError(`status ${res.status}`);
  return res.json();
}

async function nominatim(query: string, lang: string): Promise<GeoPoint | null> {
  await nominatimSlot();
  const params = new URLSearchParams({
    format: "jsonv2",
    limit: "1",
    countrycodes: "kz",
    bounded: "1",
    viewbox: `${AREA.west},${AREA.north},${AREA.east},${AREA.south}`,
    "accept-language": lang,
    q: query,
  });
  const data = (await fetchJson(`https://nominatim.openstreetmap.org/search?${params}`, {
    "User-Agent": `SALAMAT pharmacy site (${env.appUrl})`,
    Referer: env.appUrl,
  })) as { lat?: string; lon?: string; display_name?: string }[];
  const hit = Array.isArray(data) ? data[0] : undefined;
  if (!hit?.lat || !hit.lon) return null;
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) && inArea(lat, lng) ? { lat, lng, label: String(hit.display_name ?? query) } : null;
}

async function twoGis(query: string, lang: string): Promise<GeoPoint | null> {
  const params = new URLSearchParams({
    q: query,
    fields: "items.point,items.full_name",
    location: `${CENTER.lng},${CENTER.lat}`,
    page_size: "1",
    locale: lang === "kk" ? "kk_KZ" : lang === "en" ? "en_KZ" : "ru_KZ",
    key: env.geocoder.twoGisKey,
  });
  const data = (await fetchJson(`https://catalog.api.2gis.com/3.0/items/geocode?${params}`)) as {
    meta?: { code?: number };
    result?: { items?: { point?: { lat?: number; lon?: number }; full_name?: string; name?: string }[] };
  };
  if (data.meta?.code && data.meta.code !== 200 && data.meta.code !== 404) throw new GeocoderUnavailableError(`2gis ${data.meta.code}`);
  const hit = data.result?.items?.[0];
  const lat = hit?.point?.lat;
  const lng = hit?.point?.lon;
  if (typeof lat !== "number" || typeof lng !== "number" || !inArea(lat, lng)) return null;
  return { lat, lng, label: hit?.full_name || hit?.name || query };
}

/**
 * Finds the address in Astana. Returns null when nothing matches; throws GeocoderUnavailableError when the
 * service cannot be reached or is switched off. A city name is added once when the first attempt finds nothing.
 */
export async function geocodeAddress(raw: string, lang: "ru" | "kk" | "en"): Promise<GeoPoint | null> {
  const provider = geocoderProvider();
  if (provider === "off") throw new GeocoderUnavailableError("off");
  const query = raw.replace(/\s+/g, " ").trim().slice(0, 120);
  const key = `${provider}:${lang}:${query.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;
  const find = provider === "2gis" ? twoGis : nominatim;
  let result: GeoPoint | null;
  try {
    result = await find(query, lang === "en" ? "en" : lang === "kk" ? "kk,ru" : "ru");
    if (!result && !/астан|astana|нұр-сұлтан|нур-султан/i.test(query)) result = await find(`${query}, Астана`, lang === "en" ? "en" : "ru");
  } catch (e) {
    if (e instanceof GeocoderUnavailableError) throw e;
    throw new GeocoderUnavailableError((e as Error).name);
  }
  cacheSet(key, result);
  return result;
}

export interface AddressSuggestion {
  /** Address as shown in the list (street and building, with the settlement when it is not Astana). */
  label: string;
  /** Coordinates when the provider returned them: then no second geocoding request is needed. */
  point: { lat: number; lng: number } | null;
}

/**
 * Address suggestions while typing. Only 2GIS offers them (Suggest API, same server-side key); the public
 * Nominatim service forbids autocomplete in its usage policy, so without a 2GIS key there are no suggestions
 * and the visitor simply presses "Search". Results outside Astana and its suburbs are dropped.
 */
export function suggestionsAvailable(): boolean {
  return geocoderProvider() === "2gis";
}

const suggestCache = new Map<string, { at: number; value: AddressSuggestion[] }>();

export async function suggestAddresses(raw: string, lang: "ru" | "kk" | "en"): Promise<AddressSuggestion[]> {
  if (!suggestionsAvailable()) throw new GeocoderUnavailableError("suggest_off");
  const query = raw.replace(/\s+/g, " ").trim().slice(0, 120);
  const key = `${lang}:${query.toLowerCase()}`;
  const hit = suggestCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const params = new URLSearchParams({
    q: query,
    suggest_type: "address",
    location: `${CENTER.lng},${CENTER.lat}`,
    fields: "items.point,items.full_address_name",
    page_size: "6",
    locale: lang === "kk" ? "kk_KZ" : lang === "en" ? "en_KZ" : "ru_KZ",
    key: env.geocoder.twoGisKey,
  });
  let data: {
    meta?: { code?: number };
    result?: { items?: { point?: { lat?: number; lon?: number }; full_name?: string; address_name?: string; full_address_name?: string; name?: string }[] };
  };
  try {
    data = (await fetchJson(`https://catalog.api.2gis.com/3.0/suggests?${params}`)) as typeof data;
  } catch (e) {
    if (e instanceof GeocoderUnavailableError) throw e;
    throw new GeocoderUnavailableError((e as Error).name);
  }
  if (data.meta?.code && data.meta.code !== 200 && data.meta.code !== 404) throw new GeocoderUnavailableError(`2gis ${data.meta.code}`);
  const seen = new Set<string>();
  const out: AddressSuggestion[] = [];
  for (const it of data.result?.items ?? []) {
    const label = (it.full_address_name || it.full_name || it.address_name || it.name || "").trim();
    if (!label || seen.has(label.toLowerCase())) continue;
    const lat = it.point?.lat;
    const lng = it.point?.lon;
    const point = typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null;
    if (point && !inArea(point.lat, point.lng)) continue;
    seen.add(label.toLowerCase());
    out.push({ label: label.slice(0, 160), point });
  }
  if (suggestCache.size >= CACHE_MAX) suggestCache.delete(suggestCache.keys().next().value!);
  suggestCache.set(key, { at: Date.now(), value: out });
  return out;
}
