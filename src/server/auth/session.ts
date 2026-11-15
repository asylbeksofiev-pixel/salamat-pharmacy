import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "../db";
import { env } from "../env";
import { can, pharmacyScope, type Permission, type Role, type StaffIdentity } from "./permissions";

export const SESSION_COOKIE = "salamat_admin";
const SESSION_HOURS = 12;

export interface StaffUser extends StaffIdentity {
  email: string;
  name: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(adminUserId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600_000);
  await prisma.adminSession.create({ data: { tokenHash: hashToken(token), adminUserId, expiresAt } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.adminSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Resolves the signed-in staff member, or null. Cached per request. */
export const getCurrentStaff = cache(async (): Promise<StaffUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      adminUser: {
        include: { roles: { include: { role: true } }, pharmacies: { select: { pharmacyId: true } } },
      },
    },
  });
  if (!session || session.expiresAt < new Date() || !session.adminUser.isActive) return null;
  // Sliding expiry, at most one write per 10 minutes.
  if (Date.now() - session.lastSeenAt.getTime() > 10 * 60_000) {
    await prisma.adminSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_HOURS * 3600_000) },
    });
  }
  const u = session.adminUser;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    roles: u.roles.map((r) => r.role.code as Role),
    pharmacyIds: u.pharmacies.map((p) => p.pharmacyId),
  };
});

export class AccessDeniedError extends Error {
  constructor(message = "Недостаточно прав для этого действия") {
    super(message);
    this.name = "AccessDeniedError";
  }
}

/** For pages: redirects to login when signed out, to /admin?denied=1 when the permission is missing. */
export async function requireStaffPage(permission?: Permission): Promise<StaffUser> {
  const user = await getCurrentStaff();
  if (!user) redirect("/admin/login");
  if (permission && !can(user, permission)) redirect("/admin?denied=1");
  return user;
}

/** For server actions and API routes: throws instead of redirecting. */
export async function requireStaff(permission: Permission): Promise<StaffUser> {
  const user = await getCurrentStaff();
  if (!user) throw new AccessDeniedError("Требуется вход");
  if (!can(user, permission)) throw new AccessDeniedError();
  return user;
}

export async function requirePharmacyAccess(permission: Permission, pharmacyId: string): Promise<StaffUser> {
  const user = await requireStaff(permission);
  const scope = pharmacyScope(user, permission);
  if (scope !== "all" && !scope.includes(pharmacyId)) throw new AccessDeniedError("Нет доступа к этой аптеке");
  return user;
}
