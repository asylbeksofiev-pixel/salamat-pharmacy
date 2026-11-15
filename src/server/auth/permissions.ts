// Role-based access control. Checked on the server for every admin page, action and API route.
export const ROLE_CODES = ["SUPER_ADMIN", "CATALOG_MANAGER", "BRANCH_MANAGER", "OPERATOR", "CONTENT_MANAGER"] as const;
export type Role = (typeof ROLE_CODES)[number];

export const PERMISSIONS = [
  "dashboard.view",
  "catalog.read",
  "catalog.write",
  "catalog.import",
  "pharmacies.read",
  "pharmacies.write",
  "prices.read",
  "prices.write",
  "orders.read",
  "orders.write",
  "orders.contacts",
  "promotions.write",
  "content.write",
  "staff.manage",
  "settings.manage",
  "audit.read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  CATALOG_MANAGER: "Менеджер каталога",
  BRANCH_MANAGER: "Менеджер филиала",
  OPERATOR: "Оператор",
  CONTENT_MANAGER: "Контент-менеджер",
};

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  SUPER_ADMIN: PERMISSIONS,
  CATALOG_MANAGER: ["dashboard.view", "catalog.read", "catalog.write", "catalog.import", "pharmacies.read", "prices.read"],
  BRANCH_MANAGER: ["dashboard.view", "catalog.read", "pharmacies.read", "pharmacies.write", "prices.read", "prices.write"],
  OPERATOR: ["dashboard.view", "catalog.read", "pharmacies.read", "prices.read", "orders.read", "orders.write", "orders.contacts"],
  CONTENT_MANAGER: ["dashboard.view", "catalog.read", "promotions.write", "content.write"],
};

/** Permissions limited to the staff member's assigned pharmacies (unless Super Admin). */
const BRANCH_SCOPED: readonly Permission[] = ["pharmacies.write", "prices.write", "orders.read", "orders.write", "orders.contacts"];

export interface StaffIdentity {
  id: string;
  roles: Role[];
  pharmacyIds: string[];
}

export function permissionsFor(roles: readonly Role[]): Set<Permission> {
  const set = new Set<Permission>();
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r] ?? []) set.add(p);
  return set;
}

export function can(user: StaffIdentity, permission: Permission): boolean {
  return permissionsFor(user.roles).has(permission);
}

/**
 * Pharmacy scope for a permission: "all", or the list of pharmacy ids the user may act on.
 * Branch managers are always limited to assigned pharmacies; operators are limited only if assigned.
 */
export function pharmacyScope(user: StaffIdentity, permission: Permission): "all" | string[] {
  if (user.roles.includes("SUPER_ADMIN")) return "all";
  if (!BRANCH_SCOPED.includes(permission)) return "all";
  if (permission === "pharmacies.write" || permission === "prices.write") {
    // Catalog managers do not get branch writes at all; branch managers only for their branches.
    return user.pharmacyIds;
  }
  return user.pharmacyIds.length > 0 ? user.pharmacyIds : "all";
}

export function canAccessPharmacy(user: StaffIdentity, permission: Permission, pharmacyId: string): boolean {
  if (!can(user, permission)) return false;
  const scope = pharmacyScope(user, permission);
  return scope === "all" || scope.includes(pharmacyId);
}
