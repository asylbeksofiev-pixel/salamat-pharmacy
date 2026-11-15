import { NextResponse, type NextRequest } from "next/server";
import { suggest } from "@/server/catalog";
import { memoryRateLimit } from "@/server/rate-limit";
import { clientIpFrom, hashIdentifier } from "@/server/request";
import { MAX_QUERY_LENGTH } from "@/lib/search-normalize";
import { isLocale } from "@/lib/i18n";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const locale = req.nextUrl.searchParams.get("locale");
  if (q.length < 2) return NextResponse.json({ items: [] });
  if (q.length > MAX_QUERY_LENGTH) return NextResponse.json({ items: [], error: "too_long" }, { status: 400 });
  const key = `suggest:${hashIdentifier(clientIpFrom(req.headers))}`;
  if (!memoryRateLimit(key, 60, 60)) return NextResponse.json({ items: [], error: "rate_limited" }, { status: 429 });
  try {
    const res = await suggest(q, isLocale(locale) ? locale : "ru");
    return NextResponse.json(res, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (e) {
    console.error("suggest failed", (e as Error).message);
    return NextResponse.json({ items: [], error: "unavailable" }, { status: 503 });
  }
}
