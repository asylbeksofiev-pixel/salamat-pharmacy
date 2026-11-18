import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BRANCHES, PHARMACIES, PLACEHOLDER_PHONES } from "../../prisma/seed-data";
import { distanceKm, formatDistance, nearest } from "@/lib/geo";

const digits = (phone: string) => "+" + phone.replace(/\D/g, "");
const migration = readFileSync("prisma/migrations/20261118120000_branch_list_update/migration.sql", "utf8");

describe("branch list (prisma/data/branches.json)", () => {
  const active = PHARMACIES.filter((p) => p.isActive !== false);

  it("has 17 active branches, each with its own coordinates from branches.json", () => {
    expect(BRANCHES).toHaveLength(17);
    expect(active).toHaveLength(17);
    const ids = active.map((p) => p.branchId);
    expect(new Set(ids).size).toBe(17);
    expect(ids.every((id) => BRANCHES.some((b) => b.id === id))).toBe(true);
  });

  it("closed SAL-06 and SAL-07 are inactive, and SAL-07 no longer has +77025314485", () => {
    const closed = PHARMACIES.filter((p) => p.isActive === false).map((p) => p.code);
    expect(closed.sort()).toEqual(["SAL-06", "SAL-07"]);
    expect(PHARMACIES.find((p) => p.code === "SAL-07")?.phones).toEqual([]);
    const owners = PHARMACIES.filter((p) => p.phones.includes("+77025314485"));
    expect(owners.map((p) => p.addressRu)).toEqual(["пр. Мәңгілік Ел, д. 24"]);
  });

  it("adds the five new addresses", () => {
    const addresses = active.map((p) => p.addressRu);
    for (const a of ["пр. Мәңгілік Ел, д. 24", "ул. Ж. Нажимеденова, д. 13", "ул. Есет батыра, д. 11 (Ильинка 2)", "с. Жибек Жолы, ул. Курманова, д. 8/3", "пр. Туран, д. 55, н.п. 8"]) {
      expect(addresses).toContain(a);
    }
  });

  it("every phone in branches.json is on its branch, except the placeholder; no phone is shared by two branches", () => {
    for (const p of active) {
      const b = BRANCHES.find((x) => x.id === p.branchId)!;
      const phone = digits(b.phone);
      if (PLACEHOLDER_PHONES.includes(phone)) expect(p.phones, p.code).not.toContain(phone);
      else expect(p.phones, p.code).toContain(phone);
    }
    const all = active.flatMap((p) => p.phones);
    expect(new Set(all).size).toBe(all.length);
    expect(all).not.toContain("+77000000000");
  });

  it("the migration uses exactly the coordinates from branches.json", () => {
    for (const p of active) {
      const b = BRANCHES.find((x) => x.id === p.branchId)!;
      const values = new RegExp(`'${p.code}'[^\\n]*?${String(b.lat).replace(".", "\\.")}, ${String(b.lng).replace(".", "\\.")}`);
      const update = new RegExp(`"latitude" = ${String(b.lat).replace(".", "\\.")}, "longitude" = ${String(b.lng).replace(".", "\\.")}, [^\\n]*'${p.code}'`);
      expect(values.test(migration) || update.test(migration), p.code).toBe(true);
    }
  });
});

describe("geo helpers", () => {
  it("measures distances and finds the nearest point", () => {
    // Two branches on Mangilik El (24 and 21) are a few hundred metres apart.
    const a = { lat: 51.1146949, lng: 71.4345743 };
    const b = { lat: 51.1129062, lng: 71.430604 };
    expect(distanceKm(a, b)).toBeGreaterThan(0.25);
    expect(distanceKm(a, b)).toBeLessThan(0.4);
    expect(nearest({ lat: 51.115, lng: 71.433 }, [b, a])?.point).toBe(a);
    expect(nearest(a, [])).toBeNull();
  });

  it("formats distances for people", () => {
    const l = { m: "м", km: "км" };
    expect(formatDistance(0.1149, l, "ru-KZ")).toBe("110 м");
    expect(formatDistance(1.234, l, "ru-KZ")).toBe("1,2 км");
    expect(formatDistance(23.6, l, "ru-KZ")).toBe("24 км");
  });
});
