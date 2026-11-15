"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { bool, guarded, str } from "@/server/admin/guard";
import { done, fail } from "@/server/admin/action-state";
import { hashPassword, passwordProblems } from "@/server/auth/password";
import { ROLE_CODES, type Role } from "@/server/auth/permissions";

function readRoles(fd: FormData): Role[] {
  return fd.getAll("roles").map(String).filter((r): r is Role => (ROLE_CODES as readonly string[]).includes(r));
}

async function activeSuperAdmins(excludeId?: string) {
  return prisma.adminUser.count({ where: { isActive: true, id: excludeId ? { not: excludeId } : undefined, roles: { some: { role: { code: "SUPER_ADMIN" } } } } });
}

export const createStaff = guarded("staff.manage", async (user, _prev: unknown, fd: FormData) => {
  const email = z.string().email("Некорректный e-mail").max(200).parse(str(fd, "email").toLowerCase());
  const name = z.string().min(1, "Укажите имя").max(120).parse(str(fd, "name"));
  const password = str(fd, "password");
  const problem = passwordProblems(password);
  if (problem) return fail(problem);
  const roles = readRoles(fd);
  if (!roles.length) return fail("Выберите хотя бы одну роль");
  if (await prisma.adminUser.findUnique({ where: { email } })) return fail("Сотрудник с таким e-mail уже есть");
  const roleRows = await prisma.role.findMany({ where: { code: { in: roles } } });
  const pharmacyIds = fd.getAll("pharmacyIds").map(String);
  const u = await prisma.adminUser.create({
    data: {
      email,
      name,
      passwordHash: await hashPassword(password),
      roles: { create: roleRows.map((r) => ({ roleId: r.id })) },
      pharmacies: { create: pharmacyIds.map((pharmacyId) => ({ pharmacyId })) },
    },
  });
  await audit(user.id, "staff.create", "AdminUser", u.id, `Создан сотрудник ${email}: ${roles.join(", ")}`, { roles, pharmacyIds });
  revalidatePath("/admin/staff");
  return done("Сотрудник создан");
});

export const updateStaff = guarded("staff.manage", async (user, id: string, _prev: unknown, fd: FormData) => {
  const target = await prisma.adminUser.findUnique({ where: { id }, include: { roles: { include: { role: true } } } });
  if (!target) return fail("Сотрудник не найден");
  const roles = readRoles(fd);
  const isActive = bool(fd, "isActive");
  if (!roles.length) return fail("Выберите хотя бы одну роль");
  const losesSuper = target.roles.some((r) => r.role.code === "SUPER_ADMIN") && (!roles.includes("SUPER_ADMIN") || !isActive);
  if (losesSuper && (await activeSuperAdmins(id)) === 0) return fail("Нельзя убрать последнего активного Super Admin");
  if (id === user.id && !isActive) return fail("Нельзя деактивировать собственную учётную запись");
  const roleRows = await prisma.role.findMany({ where: { code: { in: roles } } });
  const pharmacyIds = fd.getAll("pharmacyIds").map(String);
  const password = str(fd, "password");
  if (password) {
    const problem = passwordProblems(password);
    if (problem) return fail(problem);
  }
  await prisma.$transaction(async (tx) => {
    await tx.adminUserRole.deleteMany({ where: { adminUserId: id } });
    await tx.adminUserRole.createMany({ data: roleRows.map((r) => ({ adminUserId: id, roleId: r.id })) });
    await tx.adminUserPharmacy.deleteMany({ where: { adminUserId: id } });
    if (pharmacyIds.length) await tx.adminUserPharmacy.createMany({ data: pharmacyIds.map((pharmacyId) => ({ adminUserId: id, pharmacyId })) });
    await tx.adminUser.update({
      where: { id },
      data: { name: str(fd, "name").slice(0, 120) || target.name, isActive, ...(password ? { passwordHash: await hashPassword(password), failedLoginCount: 0, lockedUntil: null } : {}) },
    });
    // Role or status changes end existing sessions so they take effect immediately.
    await tx.adminSession.deleteMany({ where: { adminUserId: id, ...(id === user.id ? { NOT: { adminUserId: user.id } } : {}) } });
    await audit(user.id, "staff.update", "AdminUser", id, `${target.email}: роли ${roles.join(", ")}${isActive ? "" : ", деактивирован"}${password ? ", пароль изменён" : ""}`, { roles, pharmacyIds, isActive }, tx);
  });
  revalidatePath("/admin/staff");
  return done("Сохранено");
});
