// Links to Yandex Maps and the official map widget (https://yandex.kz/map-widget/v1/), built from real pharmacy
// coordinates. No API key is needed for these URLs. Note the orders: `ll`, `pt` and `bbox` take "longitude,latitude";
// `rtext` (routes) takes "latitude,longitude".
import type { Locale } from "./i18n/config";
import type { LatLng } from "./geo";

const HOST = "https://yandex.kz";
const LANG: Record<Locale, string> = { ru: "ru_RU", kk: "kk_KZ", en: "en_US" };
/** Astana: the view when there is nothing to show. */
const ASTANA = { lat: 51.128, lng: 71.43 };

const c = (n: number) => n.toFixed(6);
const lonLat = (p: LatLng) => `${c(p.lng)},${c(p.lat)}`;

/**
 * Map with a marker for every pharmacy. With `focus` the map is centred on that pharmacy at street level,
 * otherwise it frames all of them. `full` gives the yandex.kz/maps page instead of the embeddable widget.
 */
export function yandexMapWidgetUrl(points: readonly LatLng[], locale: Locale, focus: LatLng | null = null, full = false): string {
  const params = new URLSearchParams({ lang: LANG[locale], l: "map" });
  if (points.length) params.set("pt", points.map((p) => `${lonLat(p)},pm2gnm`).join("~"));
  if (focus) {
    params.set("ll", lonLat(focus));
    params.set("z", "16");
  } else if (points.length === 1) {
    params.set("ll", lonLat(points[0]));
    params.set("z", "16");
  } else if (points.length > 1) {
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    const padLat = Math.max(0.005, (Math.max(...lats) - Math.min(...lats)) * 0.08);
    const padLng = Math.max(0.008, (Math.max(...lngs) - Math.min(...lngs)) * 0.08);
    params.set("bbox", `${c(Math.min(...lngs) - padLng)},${c(Math.min(...lats) - padLat)}~${c(Math.max(...lngs) + padLng)},${c(Math.max(...lats) + padLat)}`);
  } else {
    params.set("ll", lonLat(ASTANA));
    params.set("z", "11");
  }
  return `${HOST}/${full ? "maps/" : "map-widget/v1/"}?${params.toString().replace(/%2C/g, ",").replace(/%7E/gi, "~")}`;
}

/** The pharmacy on yandex.kz/maps with a marker. */
export function yandexPlaceUrl(p: LatLng, locale: Locale): string {
  return `${HOST}/maps/?pt=${lonLat(p)}&z=17&l=map&lang=${LANG[locale]}`;
}

/** Route to the pharmacy by car, from the given point or from "my location" (chosen in Yandex Maps). */
export function yandexRouteUrl(to: LatLng, from?: LatLng | null): string {
  const start = from ? `${c(from.lat)},${c(from.lng)}` : "";
  return `${HOST}/maps/?rtext=${start}~${c(to.lat)},${c(to.lng)}&rtt=auto`;
}

/** Search on yandex.kz/maps (for an address without coordinates). */
export function yandexSearchUrl(text: string): string {
  return `${HOST}/maps/?text=${encodeURIComponent(text)}`;
}
