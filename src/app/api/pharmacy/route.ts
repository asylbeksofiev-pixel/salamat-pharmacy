import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { PHARMACY_COOKIE } from "@/server/pharmacies";
import { isSameOrigin } from "@/server/request";
import { env } from "@/server/env";

const body = z.object({ pharmacyId: z.string().min(1).max(40).nullable() });

/** Stores the visitor's pharmacy choice in a cookie (no personal data). */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const res = NextResponse.json({ ok: true });
  if (parsed.data.pharmacyId === null) {
    res.cookies.delete(PHARMACY_COOKIE);
    return res;
  }
  const exists = await prisma.pharmacy.findFirst({ where: { id: parsed.data.pharmacyId, isActive: true }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "not_found" }, { status: 404 });
  res.cookies.set(PHARMACY_COOKIE, exists.id, { path: "/", maxAge: 60 * 60 * 24 * 180, sameSite: "lax", httpOnly: false, secure: env.cookieSecure });
  return res;
}
