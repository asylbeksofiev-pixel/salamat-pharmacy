import { describe, expect, it } from "vitest";
import { can, canAccessPharmacy, pharmacyScope, type StaffIdentity } from "@/server/auth/permissions";

const user = (roles: StaffIdentity["roles"], pharmacyIds: string[] = []): StaffIdentity => ({ id: "u", roles, pharmacyIds });

describe("role permissions", () => {
  it("operator cannot manage staff, roles or settings", () => {
    const op = user(["OPERATOR"]);
    expect(can(op, "staff.manage")).toBe(false);
    expect(can(op, "settings.manage")).toBe(false);
    expect(can(op, "catalog.import")).toBe(false);
    expect(can(op, "orders.write")).toBe(true);
    expect(can(op, "orders.contacts")).toBe(true);
  });
  it("content manager cannot see order contacts", () => {
    expect(can(user(["CONTENT_MANAGER"]), "orders.contacts")).toBe(false);
    expect(can(user(["CONTENT_MANAGER"]), "promotions.write")).toBe(true);
  });
  it("combines several roles", () => {
    const u = user(["OPERATOR", "CONTENT_MANAGER"]);
    expect(can(u, "orders.read") && can(u, "content.write")).toBe(true);
  });
  it("limits branch managers to assigned pharmacies", () => {
    const bm = user(["BRANCH_MANAGER"], ["p1"]);
    expect(canAccessPharmacy(bm, "prices.write", "p1")).toBe(true);
    expect(canAccessPharmacy(bm, "prices.write", "p2")).toBe(false);
    expect(can(bm, "catalog.write")).toBe(false);
  });
  it("catalog managers have no branch price writes", () => {
    expect(canAccessPharmacy(user(["CATALOG_MANAGER"]), "prices.write", "p1")).toBe(false);
  });
  it("operators see all orders unless pharmacies are assigned", () => {
    expect(pharmacyScope(user(["OPERATOR"]), "orders.read")).toBe("all");
    expect(pharmacyScope(user(["OPERATOR"], ["p3"]), "orders.read")).toEqual(["p3"]);
  });
  it("super admin can do everything everywhere", () => {
    const sa = user(["SUPER_ADMIN"]);
    expect(can(sa, "staff.manage")).toBe(true);
    expect(canAccessPharmacy(sa, "prices.write", "any")).toBe(true);
  });
});
