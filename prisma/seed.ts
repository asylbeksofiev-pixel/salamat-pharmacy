// Production-safe seed: reference data only (roles, official source, branches, categories, pages, FAQ, settings).
// Idempotent: existing records edited in the admin panel are not overwritten (create-only upserts).
import { PrismaClient } from "@prisma/client";
import { BRANCHES, BRANCHES_SOURCE, CATEGORIES, CITIES, FAQ, OFFICIAL_SOURCE, PAGES, PHARMACIES, ROLES } from "./seed-data";
import { hashPassword, passwordProblems } from "../src/server/auth/password";
import { DEFAULT_SETTINGS } from "../src/server/settings-defaults";

const prisma = new PrismaClient();

async function main() {
  for (const r of ROLES) {
    await prisma.role.upsert({ where: { code: r.code }, create: r, update: { nameRu: r.nameRu, description: r.description } });
  }

  const source = await prisma.dataSource.upsert({
    where: { code: OFFICIAL_SOURCE.code },
    create: { ...OFFICIAL_SOURCE, kind: "OFFICIAL_SITE", verifiedAt: new Date("2026-11-14T12:00:00Z"), notes: "Сайт на Tilda, последняя публикация 10.04.2025 — сведения требуют подтверждения" },
    update: {},
  });
  await prisma.dataSource.upsert({
    where: { code: "manual" },
    create: { code: "manual", name: "Ввод сотрудником в админ-панели", kind: "MANUAL" },
    update: {},
  });

  const branchSource = await prisma.dataSource.upsert({
    where: { code: BRANCHES_SOURCE.code },
    create: { code: BRANCHES_SOURCE.code, name: BRANCHES_SOURCE.name, kind: "MANUAL", verifiedAt: new Date(BRANCHES_SOURCE.verifiedAt), notes: "prisma/data/branches.json" },
    update: {},
  });

  const cityIds = new Map<string, string>();
  for (const c of CITIES) {
    const city = await prisma.city.upsert({ where: { slug: c.slug }, create: c, update: {} });
    cityIds.set(c.slug, city.id);
  }

  for (const [i, p] of PHARMACIES.entries()) {
    const branch = p.branchId ? BRANCHES.find((b) => b.id === p.branchId) : undefined;
    if (p.branchId && !branch) throw new Error(`branches.json has no id ${p.branchId} (${p.code})`);
    await prisma.pharmacy.upsert({
      where: { code: p.code },
      create: {
        code: p.code,
        slug: p.slug,
        cityId: cityIds.get(p.city ?? "astana")!,
        addressRu: p.addressRu,
        sourceAddress: p.sourceAddress,
        phones: p.phones,
        latitude: branch?.lat ?? null,
        longitude: branch?.lng ?? null,
        isActive: p.isActive ?? true,
        acceptsOrders: p.isActive ?? true,
        sortOrder: i + 1,
        sourceId: p.fromBranchList ? branchSource.id : source.id,
        internalNote: p.internalNote ?? (p.fromBranchList ? null : "Адрес и телефон с salamatfarmacia.kz — подтвердить; часы работы не указаны"),
        verifiedAt: p.fromBranchList ? new Date(BRANCHES_SOURCE.verifiedAt) : null,
      },
      update: {},
    });
  }

  for (const [i, c] of CATEGORIES.entries()) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      create: { ...c, sortOrder: (i + 1) * 10 },
      update: {},
    });
  }

  for (const p of PAGES) {
    await prisma.contentPage.upsert({ where: { slug: p.slug }, create: { ...p, status: "PUBLISHED" }, update: {} });
  }

  if ((await prisma.fAQItem.count()) === 0) {
    await prisma.fAQItem.createMany({ data: FAQ.map((f, i) => ({ ...f, sortOrder: (i + 1) * 10 })) });
  }

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.siteSetting.upsert({ where: { key }, create: { key, value: value as object }, update: {} });
  }

  // First Super Admin from environment variables (never hard-coded).
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    const problem = passwordProblems(password);
    if (problem) throw new Error(`ADMIN_PASSWORD: ${problem}`);
    const role = await prisma.role.findUniqueOrThrow({ where: { code: "SUPER_ADMIN" } });
    const existing = await prisma.adminUser.findUnique({ where: { email } });
    if (!existing) {
      await prisma.adminUser.create({
        data: {
          email,
          name: process.env.ADMIN_NAME || "Администратор",
          passwordHash: await hashPassword(password),
          roles: { create: { roleId: role.id } },
        },
      });
      console.log(`Super Admin created: ${email}`);
    }
  } else if ((await prisma.adminUser.count()) === 0) {
    console.log("No staff accounts yet. Create one with: npm run admin:create -- --email you@example.kz --name \"Имя\" --role SUPER_ADMIN");
  }
  console.log(`Seed done: ${PHARMACIES.length} pharmacies, ${CATEGORIES.length} categories, ${PAGES.length} pages.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
