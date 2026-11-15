"use server";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { createSession, destroySession, getCurrentStaff } from "@/server/auth/session";
import { verifyPassword } from "@/server/auth/password";
import { rateLimit } from "@/server/rate-limit";
import { currentClientHash } from "@/server/request";
import { audit } from "@/server/audit";
import { fail, type ActionState } from "@/server/admin/action-state";

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const password = String(fd.get("password") ?? "").slice(0, 200);
  if (!email || !password) return fail("Введите e-mail и пароль");
  const client = await currentClientHash();
  if (!(await rateLimit(`login:${client}`, 20, 900))) return fail("Слишком много попыток входа. Подождите 15 минут.");

  const user = await prisma.adminUser.findUnique({ where: { email } });
  // Same message for unknown e-mail and wrong password.
  const generic = fail("Неверный e-mail или пароль");
  if (!user || !user.isActive) {
    await verifyPassword(password, "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA"); // equalise timing
    return generic;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) return fail(`Учётная запись временно заблокирована после ${MAX_FAILS} неудачных попыток. Повторите позже.`);
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const fails = user.failedLoginCount + 1;
    await prisma.adminUser.update({
      where: { id: user.id },
      data: { failedLoginCount: fails >= MAX_FAILS ? 0 : fails, lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
    });
    if (fails >= MAX_FAILS) await audit(user.id, "auth.locked", "AdminUser", user.id, "Блокировка после неудачных попыток входа");
    return generic;
  }
  await prisma.adminUser.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await createSession(user.id);
  await audit(user.id, "auth.login", "AdminUser", user.id, "Вход в админ-панель");
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  const user = await getCurrentStaff();
  await destroySession();
  if (user) await audit(user.id, "auth.logout", "AdminUser", user.id, "Выход");
  redirect("/admin/login");
}
