import "server-only";
import { prisma } from "./db";

/**
 * Fixed-window limiter stored in PostgreSQL, so it works across serverless instances.
 * Returns true when the call is allowed.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000);
  try {
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimitBucket" ("key", "windowStart", "count") VALUES (${key}, ${windowStart}, 1)
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimitBucket"."windowStart" < ${windowStart} THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
        "windowStart" = GREATEST("RateLimitBucket"."windowStart", ${windowStart})
      RETURNING "count"`;
    return (rows[0]?.count ?? 1) <= limit;
  } catch (e) {
    // Fail open on limiter errors: availability of the order form matters more than throttling.
    console.error("rate limit failure", (e as Error).message);
    return true;
  }
}

/** Cheap per-instance limiter for high-frequency endpoints (search suggestions). */
const memory = new Map<string, { start: number; count: number }>();
export function memoryRateLimit(key: string, limit: number, windowSeconds: number): boolean {
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || now - entry.start > windowSeconds * 1000) {
    memory.set(key, { start: now, count: 1 });
    if (memory.size > 10_000) memory.clear();
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

export async function cleanupRateLimits(olderThanHours = 24) {
  await prisma.rateLimitBucket.deleteMany({
    where: { windowStart: { lt: new Date(Date.now() - olderThanHours * 3600_000) } },
  });
}
