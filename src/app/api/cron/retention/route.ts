import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runRetention } from "@/server/retention";

/** Daily retention job for Vercel Cron (vercel.json). Requires Authorization: Bearer $CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const result = await runRetention();
  return NextResponse.json(result);
}
