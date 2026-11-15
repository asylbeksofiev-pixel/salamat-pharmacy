import "server-only";
import { prisma } from "./db";
import type { Prisma } from "@prisma/client";

/** Records who changed what. Never pass customer phone numbers or names in `diff`. */
export async function audit(
  adminUserId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  summary?: string,
  diff?: Prisma.InputJsonValue,
  tx: Prisma.TransactionClient = prisma,
) {
  await tx.auditLog.create({
    data: { adminUserId, action, entityType, entityId, summary: summary?.slice(0, 500), diff },
  });
}

/** Shallow diff of changed fields for the audit log. */
export function diffFields<T extends Record<string, unknown>>(before: T, after: Partial<T>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(after)) {
    const prev = before[k];
    const a = prev instanceof Date ? prev.toISOString() : prev;
    const b = v instanceof Date ? (v as Date).toISOString() : v;
    if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = { from: a ?? null, to: b ?? null };
  }
  return out;
}
