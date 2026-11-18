// Distances on the map: great-circle (haversine) distance, accurate enough for choosing the nearest pharmacy.

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371.0088;
const rad = (deg: number) => (deg * Math.PI) / 180;

export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The closest point to `from`, or null when the list is empty. Ties keep the first item. */
export function nearest<T extends LatLng>(from: LatLng, points: readonly T[]): { point: T; km: number } | null {
  let best: { point: T; km: number } | null = null;
  for (const p of points) {
    const km = distanceKm(from, p);
    if (!best || km < best.km) best = { point: p, km };
  }
  return best;
}

/** "350 м" / "1,2 км" / "12 км" in the visitor's language. */
export function formatDistance(km: number, labels: { m: string; km: string }, locale: string): string {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} ${labels.m}`;
  const value = km < 10 ? km.toLocaleString(locale, { maximumFractionDigits: 1 }) : Math.round(km).toLocaleString(locale);
  return `${value} ${labels.km}`;
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}
