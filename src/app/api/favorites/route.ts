import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { listVariants } from "@/server/catalog";
import { PHARMACY_COOKIE } from "@/server/pharmacies";
import { isLocale } from "@/lib/i18n";

/** Cards for the favourites page (ids come from the visitor's browser). */
export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[a-z0-9]{10,40}$/i.test(s))
    .slice(0, 100);
  const locale = req.nextUrl.searchParams.get("locale");
  if (!ids.length) return NextResponse.json({ items: [] });
  const jar = await cookies();
  const pharmacyId = jar.get(PHARMACY_COOKIE)?.value ?? null;
  const res = await listVariants({ locale: isLocale(locale) ? locale : "ru", pharmacyId, variantIds: ids, filters: { sort: "name" }, pageSize: 100 });
  return NextResponse.json({ items: res.items }, { headers: { "Cache-Control": "no-store" } });
}
