import { NextResponse } from "next/server";
import { AccessDeniedError, requireStaff } from "@/server/auth/session";
import { exportCatalogCsv } from "@/server/import/pipeline";
import { audit } from "@/server/audit";

export async function GET() {
  let user;
  try {
    user = await requireStaff("catalog.import");
  } catch (e) {
    if (e instanceof AccessDeniedError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    throw e;
  }
  const csv = await exportCatalogCsv();
  await audit(user.id, "catalog.export", "Catalog", null, "Экспорт каталога в CSV");
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="salamat-catalog-${stamp}.csv"`, "Cache-Control": "no-store" },
  });
}
