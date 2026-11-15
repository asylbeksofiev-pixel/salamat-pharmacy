import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { env } from "./env";

export function clientIpFrom(h: Headers): string {
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip")?.trim() || "unknown";
}

/** Non-reversible hash of the client IP: enough for rate limiting, not personal data in logs. */
export function hashIdentifier(value: string): string {
  return createHmac("sha256", env.appSecret || "unset").update(value).digest("hex").slice(0, 32);
}

export async function currentClientHash(): Promise<string> {
  const h = await headers();
  return hashIdentifier(clientIpFrom(h));
}

/** Same-origin check for state-changing route handlers (in addition to SameSite cookies). */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") !== "cross-site";
  try {
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
