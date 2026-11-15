import { NextResponse } from "next/server";
import { AccessDeniedError, requireStaff } from "@/server/auth/session";
import { errorReportCsv } from "@/server/import/pipeline";
import { prisma } from "@/server/db";

export async function GET(_req: Request, ctx: RouteContext<"/api/admin/import/[id]/report">) {
  try {
    await requireStaff("catalog.import");
  } catch (e) {
    if (e instanceof AccessDeniedError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    throw e;
  }
  const { id } = await ctx.params;
  const job = await prisma.importJob.findUnique({ where: { id }, select: { id: true } });
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const csv = await errorReportCsv(id);
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="import-${id}-errors.csv"`, "Cache-Control": "no-store" },
  });
}
