import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { PHARMACY_COOKIE } from "@/server/pharmacies";
import { isSameOrigin } from "@/server/request";
import { env } from "@/server/env";

/** No-JavaScript fallback for choosing a pharmacy: form POST → cookie → back to the same page. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const id = String(form?.get("pharmacyId") ?? "").slice(0, 40);
  const backRaw = String(form?.get("back") ?? "/pharmacies");
  // Only same-site relative paths, never "//host" or absolute URLs.
  const back = backRaw.startsWith("/") && !backRaw.startsWith("//") ? backRaw.slice(0, 500) : "/pharmacies";
  const pharmacy = id ? await prisma.pharmacy.findFirst({ where: { id, isActive: true }, select: { id: true } }) : null;
  const res = NextResponse.redirect(new URL(back, req.url), 303);
  if (pharmacy) {
    res.cookies.set(PHARMACY_COOKIE, pharmacy.id, { path: "/", maxAge: 60 * 60 * 24 * 180, sameSite: "lax", httpOnly: false, secure: env.cookieSecure });
  }
  return res;
}
