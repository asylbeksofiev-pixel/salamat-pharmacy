import { NextResponse, type NextRequest } from "next/server";
import { CATALOG_MAX_QUERY, listCatalogItems, listCatalogItemsByIds } from "@/server/catalog-items";
import { descendantIds, getCategoryTree } from "@/server/catalog";
import { parseCatalogQuery } from "@/lib/catalog-params";
import { memoryRateLimit } from "@/server/rate-limit";
import { clientIpFrom, hashIdentifier } from "@/server/request";

/**
 * GET /api/catalog/items?q=&category=&priceMin=&priceMax=&hasPrice=1&hasPhoto=1&sort=&page=&pageSize=
 * Paginated catalogue (default 24, max 48 per page): search by name and article, sections (several = OR),
 * price range, "with price" and "with photo" filters, sorting. Same parameter rules as the catalogue pages
 * (src/lib/catalog-params.ts). Runs on the server; the browser never receives database credentials.
 */
export async function GET(req: NextRequest) {
  if (!memoryRateLimit(`catalog:${hashIdentifier(clientIpFrom(req.headers))}`, 240, 60)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const sp = req.nextUrl.searchParams;
  // ?ids=1,2,3 — items for the favourites page (kept in the visitor's browser).
  if (sp.has("ids")) {
    const ids = (sp.get("ids") ?? "").split(",").map((s) => s.trim()).slice(0, 100);
    try {
      return NextResponse.json({ items: await listCatalogItemsByIds(ids) }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      console.error("catalog ids api failed", (e as Error).message.slice(0, 200));
      return NextResponse.json({ error: "unavailable" }, { status: 503 });
    }
  }
  if ((sp.get("q") ?? "").trim().length > CATALOG_MAX_QUERY) return NextResponse.json({ error: "query_too_long" }, { status: 400 });
  const pageSize = /^\d{1,3}$/.test(sp.get("pageSize") ?? "") ? Number(sp.get("pageSize")) : undefined;
  try {
    const tree = await getCategoryTree("ru");
    const query = parseCatalogQuery(sp, { known: new Set(tree.bySlug.keys()) });
    const categoryIds = query.categories.flatMap((slug) => descendantIds(tree.bySlug.get(slug)!));
    const res = await listCatalogItems({ ...query, categoryIds, pageSize });
    return NextResponse.json(res, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch (e) {
    console.error("catalog api failed", (e as Error).message.slice(0, 200));
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
