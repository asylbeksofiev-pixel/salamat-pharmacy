import { NextResponse, type NextRequest } from "next/server";
import { CATALOG_MAX_QUERY, listCatalogItems } from "@/server/catalog-items";
import { memoryRateLimit } from "@/server/rate-limit";
import { clientIpFrom, hashIdentifier } from "@/server/request";

/**
 * GET /api/catalog/items?q=&page=&pageSize=
 * Paginated catalogue (default 24, max 48 per page) with search by name and article.
 * Runs on the server; the browser never receives database credentials.
 */
export async function GET(req: NextRequest) {
  if (!memoryRateLimit(`catalog:${hashIdentifier(clientIpFrom(req.headers))}`, 240, 60)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  if (q.length > CATALOG_MAX_QUERY) return NextResponse.json({ error: "query_too_long" }, { status: 400 });
  const page = /^\d{1,6}$/.test(sp.get("page") ?? "") ? Number(sp.get("page")) : 1;
  const pageSize = /^\d{1,3}$/.test(sp.get("pageSize") ?? "") ? Number(sp.get("pageSize")) : undefined;
  try {
    const res = await listCatalogItems({ q, page, pageSize });
    return NextResponse.json(res, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch (e) {
    console.error("catalog api failed", (e as Error).message.slice(0, 200));
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
