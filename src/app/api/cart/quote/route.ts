import { NextResponse } from "next/server";
import { buildQuote } from "@/server/orders/quote";
import { quoteRequestSchema } from "@/lib/order-schema";
import { isLocale } from "@/lib/i18n";
import { memoryRateLimit } from "@/server/rate-limit";
import { clientIpFrom, hashIdentifier } from "@/server/request";

/** Server-side recalculation of the cart for a pharmacy using current confirmed prices and stock. */
export async function POST(req: Request) {
  if (!memoryRateLimit(`quote:${hashIdentifier(clientIpFrom(req.headers))}`, 120, 60)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const raw = await req.json().catch(() => null);
  const parsed = quoteRequestSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const locale = raw && isLocale(raw.locale) ? raw.locale : "ru";
  try {
    const quote = await buildQuote({ pharmacyId: parsed.data.pharmacyId, items: parsed.data.items, locale });
    return NextResponse.json(quote, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("quote failed", (e as Error).message);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
