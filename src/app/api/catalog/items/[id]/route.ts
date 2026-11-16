import { NextResponse } from "next/server";
import { getCatalogItem, isCatalogId } from "@/server/catalog-items";

/** GET /api/catalog/items/:id — one catalogue item by its unique id. */
export async function GET(_req: Request, ctx: RouteContext<"/api/catalog/items/[id]">) {
  const { id } = await ctx.params;
  if (!isCatalogId(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  try {
    const item = await getCatalogItem(id);
    if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(item, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch (e) {
    console.error("catalog item api failed", (e as Error).message.slice(0, 200));
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
