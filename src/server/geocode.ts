import "server-only";
// Address → coordinates for "nearest pharmacy". Runs only on the server; the Yandex keys never reach the browser.
// Providers: the Yandex HTTP Geocoder (when YANDEX_GEOCODER_API_KEY is set) or the public OpenStreetMap Nominatim
// service (no key; its usage policy allows light use with an identifying User-Agent, at most 1 request per second,
// with caching). Suggestions while typing: Yandex Geosuggest (YANDEX_SUGGEST_API_KEY).
// Searches are limited to Astana and its suburbs. Addresses typed by visitors are never logged.
import { env } from "./env";
import { distanceKm } from "@/lib/geo";

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

export function geocoderProvider(): "yandex" | "nominatim" | "off" {
  if (env.geocoder.mode === "off") return "off";
  if (env.geocoder.yandexGeocoderKey) return "yandex";
  return "nominatim";
}

export function inArea(lat: number, lng: number): boolean {
  return lat >= AREA.south && lat <= AREA.north && lng >= AREA.west && lng <= AREA.east;
}

// Small in-memory cache (per server instance): repeated searches do not hit the provider again.
const cache = new Map<string, { at: number; value: GeoPoint[] }>();
const CACHE_TTL_MS = 24 * 3600_000;
const CACHE_MAX = 500;

function cacheGet(key: string): GeoPoint[] | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}
function cacheSet(key: string, value: GeoPoint[]) {
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

/** Up to this many addresses per search; several distinct ones are offered to the visitor to choose from. */
const MAX_CANDIDATES = 5;

async function nominatim(query: string, lang: string): Promise<GeoPoint[]> {
  await nominatimSlot();
  const params = new URLSearchParams({
    format: "jsonv2",
    limit: String(MAX_CANDIDATES),
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
  const out: GeoPoint[] = [];
  for (const hit of Array.isArray(data) ? data : []) {
    const lat = Number(hit?.lat);
    const lng = Number(hit?.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng) && inArea(lat, lng)) out.push({ lat, lng, label: String(hit.display_name ?? query) });
  }
  return out;
}

/** Yandex "kind" values precise enough to measure a distance from (not a whole city or region). */
const YANDEX_KINDS = new Set(["house", "street", "entrance", "metro", "district", "route", "station", "airport", "vegetation", "hydro", "other"]);
const YANDEX_LANG: Record<string, string> = { ru: "ru_RU", kk: "kk_KZ", en: "en_US" };

async function yandex(query: string, lang: string, uri?: string): Promise<GeoPoint[]> {
  const params = new URLSearchParams({
    apikey: env.geocoder.yandexGeocoderKey,
    format: "json",
    lang: YANDEX_LANG[lang.slice(0, 2)] ?? "ru_RU",
    results: uri ? "1" : String(MAX_CANDIDATES),
    bbox: `${AREA.west},${AREA.south}~${AREA.east},${AREA.north}`,
    rspn: "1",
  });
  if (uri) params.set("uri", uri);
  else params.set("geocode", query);
  const res = await fetch(`https://geocode-maps.yandex.ru/v1/?${params}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6000), cache: "no-store" });
  if (!res.ok) throw new GeocoderUnavailableError(`yandex ${res.status}`);
  const data = (await res.json()) as {
    response?: { GeoObjectCollection?: { featureMember?: { GeoObject?: { name?: string; description?: string; Point?: { pos?: string }; metaDataProperty?: { GeocoderMetaData?: { text?: string; kind?: string } } } }[] } };
  };
  const out: GeoPoint[] = [];
  for (const member of data.response?.GeoObjectCollection?.featureMember ?? []) {
    const obj = member?.GeoObject;
    const [lng, lat] = String(obj?.Point?.pos ?? "").split(" ").map(Number);
    const meta = obj?.metaDataProperty?.GeocoderMetaData;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inArea(lat, lng)) continue;
    // "locality"/"province"/"country" mean only the city was recognised: no honest distance from that.
    if (meta?.kind && !YANDEX_KINDS.has(meta.kind)) continue;
    const label = (meta?.text || [obj?.name, obj?.description].filter(Boolean).join(", ") || query).replace(/^Казахстан,\s*|^Қазақстан,\s*|^Kazakhstan,\s*/i, "");
    out.push({ lat, lng, label });
  }
  return out;
}

/** Candidates that are really different places: duplicates and points closer than 300 m to an earlier one are dropped. */
export function distinctPlaces(points: GeoPoint[], minKm = 0.3): GeoPoint[] {
  const out: GeoPoint[] = [];
  for (const p of points) {
    if (out.some((q) => q.label.toLowerCase() === p.label.toLowerCase() || distanceKm(p, q) < minKm)) continue;
    out.push(p);
  }
  return out.slice(0, MAX_CANDIDATES);
}

/** The best match for the address, or null (see geocodeCandidates). */
export async function geocodeAddress(raw: string, lang: "ru" | "kk" | "en", uri?: string | null): Promise<GeoPoint | null> {
  return (await geocodeCandidates(raw, lang, uri))[0] ?? null;
}

/**
 * Finds the address in Astana: up to 5 distinct places, best first (several = the visitor chooses). Empty when
 * nothing matches; throws GeocoderUnavailableError when the service cannot be reached or is switched off. A city name
 * is added once when the first attempt finds nothing. One provider request per search (two with the city added).
 */
export async function geocodeCandidates(raw: string, lang: "ru" | "kk" | "en", uri?: string | null): Promise<GeoPoint[]> {
  const provider = geocoderProvider();
  if (provider === "off") throw new GeocoderUnavailableError("off");
  const query = raw.replace(/\s+/g, " ").trim().slice(0, 120);
  // A picked Yandex suggestion carries its object URI: the geocoder resolves exactly that object.
  const byUri = provider === "yandex" && uri ? uri : null;
  const key = `${provider}:${lang}:${byUri ?? query.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;
  const find = provider === "yandex" ? yandex : nominatim;
  let result: GeoPoint[];
  try {
    if (byUri) {
      result = (await yandex(query, lang, byUri)).slice(0, 1).map((r) => ({ ...r, label: query || r.label }));
    } else result = await find(query, lang === "en" ? "en" : lang === "kk" ? "kk,ru" : "ru");
    if (!result.length && !/астан|astana|нұр-сұлтан|нур-султан/i.test(query)) result = await find(`${query}, Астана`, lang === "en" ? "en" : "ru");
  } catch (e) {
    if (e instanceof GeocoderUnavailableError) throw e;
    throw new GeocoderUnavailableError((e as Error).name);
  }
  result = distinctPlaces(result);
  cacheSet(key, result);
  return result;
}

export interface AddressSuggestion {
  /** Address as shown in the list (street and building, with the settlement when it is not Astana). */
  label: string;
  /** Coordinates when the provider returned them: then no second geocoding request is needed. */
  point: { lat: number; lng: number } | null;
  /** Yandex object URI: lets the geocoder resolve exactly the picked address. */
  uri: string | null;
}

/**
 * Address suggestions while typing: Yandex Geosuggest with its own server-side key (YANDEX_SUGGEST_API_KEY).
 * The public Nominatim service forbids autocomplete in its usage policy, so without the key there are no
 * suggestions and the visitor simply presses "Search". Results are limited to Astana and its suburbs.
 */
export function suggestionsAvailable(): boolean {
  return env.geocoder.mode !== "off" && !!env.geocoder.yandexSuggestKey;
}

const suggestCache = new Map<string, { at: number; value: AddressSuggestion[] }>();

export async function suggestAddresses(raw: string, lang: "ru" | "kk" | "en"): Promise<AddressSuggestion[]> {
  if (!suggestionsAvailable()) throw new GeocoderUnavailableError("suggest_off");
  const query = raw.replace(/\s+/g, " ").trim().slice(0, 120);
  const key = `${lang}:${query.toLowerCase()}`;
  const hit = suggestCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const params = new URLSearchParams({
    apikey: env.geocoder.yandexSuggestKey,
    text: query,
    lang: lang === "kk" ? "kk" : lang === "en" ? "en" : "ru",
    results: "6",
    ll: `${CENTER.lng},${CENTER.lat}`,
    spn: `${(AREA.east - AREA.west).toFixed(2)},${(AREA.north - AREA.south).toFixed(2)}`,
    strict_bounds: "1",
    types: "house,street",
    print_address: "1",
    attrs: "uri",
  });
  let data: { results?: { title?: { text?: string }; subtitle?: { text?: string }; address?: { formatted_address?: string }; uri?: string }[] };
  try {
    const res = await fetch(`https://suggest-maps.yandex.ru/v1/suggest?${params}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!res.ok) throw new GeocoderUnavailableError(`yandex suggest ${res.status}`);
    data = (await res.json()) as typeof data;
  } catch (e) {
    if (e instanceof GeocoderUnavailableError) throw e;
    throw new GeocoderUnavailableError((e as Error).name);
  }
  const seen = new Set<string>();
  const out: AddressSuggestion[] = [];
  for (const it of data.results ?? []) {
    const formatted = it.address?.formatted_address?.replace(/^(Казахстан|Қазақстан|Kazakhstan),\s*/i, "");
    const label = (formatted || [it.title?.text, it.subtitle?.text].filter(Boolean).join(", ")).trim();
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    const uri = typeof it.uri === "string" && it.uri.length <= 500 ? it.uri : null;
    out.push({ label: label.slice(0, 160), point: null, uri });
  }
  if (suggestCache.size >= CACHE_MAX) suggestCache.delete(suggestCache.keys().next().value!);
  suggestCache.set(key, { at: Date.now(), value: out });
  return out;
}
