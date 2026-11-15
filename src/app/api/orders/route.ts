import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { createOrder } from "@/server/orders/create";
import { notifyOperators } from "@/server/orders/notify";
import { currentClientHash, isSameOrigin } from "@/server/request";
import { env } from "@/server/env";
import { ORDER_COOKIE_PREFIX } from "@/server/orders/constants";

/** Creates a pickup request. Idempotent by idempotencyKey; prices are re-checked on the server. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const raw = await req.json().catch(() => null);
  try {
    const result = await createOrder(raw, await currentClientHash());
    if (!result.ok) {
      const { ok: _ok, ...rest } = result;
      void _ok;
      return NextResponse.json(rest, { status: result.status });
    }
    if (!result.duplicate) after(() => notifyOperators(result.orderId));
    // Lets this browser see the request summary on the success page (no contact data is shown there).
    const jar = await cookies();
    jar.set(`${ORDER_COOKIE_PREFIX}${result.publicId}`, "1", { path: "/", maxAge: 60 * 60 * 24 * 7, httpOnly: true, sameSite: "lax", secure: env.cookieSecure });
    return NextResponse.json({ publicId: result.publicId, duplicate: result.duplicate }, { status: result.duplicate ? 200 : 201 });
  } catch (e) {
    // No personal data in logs.
    console.error("order creation failed", (e as Error).name, (e as Error).message.slice(0, 200));
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
