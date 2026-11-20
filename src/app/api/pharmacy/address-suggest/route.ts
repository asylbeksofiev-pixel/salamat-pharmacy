import { NextResponse } from "next/server";
import { z } from "zod";
import { GeocoderUnavailableError, suggestAddresses, suggestionsAvailable } from "@/server/geocode";
import { memoryRateLimit } from "@/server/rate-limit";
import { clientIpFrom, hashIdentifier, isSameOrigin } from "@/server/request";

const body = z.object({
  q: z.string().trim().min(3).max(120),
  locale: z.enum(["ru", "kk", "en"]).default("ru"),
});

/**
 * Address suggestions for "nearest pharmacy" (Yandex Geosuggest; the key stays on the server). The text goes in
 * the request body, is not logged or stored. Without YANDEX_SUGGEST_API_KEY the endpoint answers 404 and the page does not
 * call it (the public Nominatim service does not allow autocomplete).
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!suggestionsAvailable()) return NextResponse.json({ error: "unsupported" }, { status: 404 });
  if (!memoryRateLimit(`addr-suggest:${hashIdentifier(clientIpFrom(req.headers))}`, 60, 60)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ items: [] }, { headers: { "Cache-Control": "no-store" } });
  try {
    const items = await suggestAddresses(parsed.data.q, parsed.data.locale);
    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("address suggestions failed", e instanceof GeocoderUnavailableError ? `geocoder: ${e.message}` : (e as Error).name);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
