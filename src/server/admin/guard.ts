import "server-only";
import { AccessDeniedError, requireStaff, type StaffUser } from "../auth/session";
import type { Permission } from "../auth/permissions";
import { fail, type ActionState } from "./action-state";
import { ZodError } from "zod";

/**
 * Wraps a server action: checks the permission on the server first, turns validation and access errors into
 * form messages. Every admin mutation goes through here.
 */
export function guarded<A extends unknown[]>(
  permission: Permission,
  fn: (user: StaffUser, ...args: A) => Promise<ActionState>,
): (...args: A) => Promise<ActionState> {
  return async (...args: A) => {
    let user: StaffUser;
    try {
      user = await requireStaff(permission);
    } catch (e) {
      if (e instanceof AccessDeniedError) return fail(e.message);
      throw e;
    }
    try {
      return await fn(user, ...args);
    } catch (e) {
      if (e instanceof AccessDeniedError) return fail(e.message);
      if (e instanceof ZodError) {
        const errors: Record<string, string> = {};
        for (const i of e.issues) errors[String(i.path[0] ?? "form")] ??= i.message;
        return fail("Проверьте поля формы", errors);
      }
      // Next.js redirect()/notFound() must propagate.
      if (e && typeof e === "object" && "digest" in e) throw e;
      console.error("admin action failed", (e as Error).message);
      return fail(`Ошибка: ${(e as Error).message}`.slice(0, 300));
    }
  };
}

export function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
export function optStr(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v === "" ? null : v;
}
export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}
export function optInt(fd: FormData, key: string): number | null {
  const v = str(fd, key).replace(/\s/g, "");
  if (!v) return null;
  if (!/^-?\d+$/.test(v)) throw new Error(`Поле ${key}: нужно целое число`);
  return Number(v);
}
