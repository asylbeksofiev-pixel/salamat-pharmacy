import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { geocodeAddress, geocoderProvider, GeocoderUnavailableError, inArea, type GeoPoint } from "@/server/geocode";
import { memoryRateLimit } from "@/server/rate-limit";
import { clientIpFrom, hashIdentifier, isSameOrigin } from "@/server/request";
import { distanceKm } from "@/lib/geo";

const body = z.object({
  address: z.string().trim().min(3).max(160),
  locale: z.enum(["ru", "kk", "en"]).default("ru"),
  /** Coordinates of an address suggestion the visitor picked (from /api/pharmacy/address-suggest). */
  point: z.object({ lat: z.number().finite(), lng: z.number().finite() }).optional(),
  /** Yandex object URI of a picked suggestion: the geocoder resolves exactly that object. */
  uri: z.string().startsWith("ymapsbm1://").max(500).optional(),
});

/**
 * Nearest pharmacies to an address typed by the visitor. The address is geocoded on the server (the key stays
 * here) and sent in the request body, not the URL; it is not logged or stored. Distances are straight-line
 * distances between coordinates (haversine), nearest first. A picked suggestion already has coordinates: then the
 * geocoder is not called again (the point must lie in Astana and its suburbs).
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!memoryRateLimit(`nearest:${hashIdentifier(clientIpFrom(req.headers))}`, 12, 60)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "too_short" }, { status: 400 });
  try {
    const given = parsed.data.point;
    if (given && !inArea(given.lat, given.lng)) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const point: GeoPoint | null = given ? { ...given, label: parsed.data.address } : await geocodeAddress(parsed.data.address.slice(0, 120), parsed.data.locale, parsed.data.uri);
    if (!point) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const pharmacies = await prisma.pharmacy.findMany({
      where: { isActive: true, latitude: { not: null }, longitude: { not: null }, city: { isActive: true } },
      select: { id: true, latitude: true, longitude: true },
    });
    const results = pharmacies
      .map((p) => ({ id: p.id, km: distanceKm(point, { lat: Number(p.latitude), lng: Number(p.longitude) }) }))
      .sort((a, b) => a.km - b.km)
      .map((r) => ({ id: r.id, km: Math.round(r.km * 100) / 100 }));
    return NextResponse.json(
      { point: { lat: point.lat, lng: point.lng }, label: point.label, provider: geocoderProvider(), results },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    // No address in the log — only the kind of failure.
    console.error("nearest pharmacy lookup failed", e instanceof GeocoderUnavailableError ? `geocoder: ${e.message}` : (e as Error).name);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
