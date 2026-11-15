// Loads the demo catalogue through the real import pipeline. Development and tests only.
//   npm run db:demo            load / refresh demo data and demo staff accounts
//   npm run db:demo -- --remove  delete demo products, promotions and demo staff
import { prisma } from "../src/server/db";
import { createImportPreview, applyImport } from "../src/server/import/pipeline";
import type { DataProvider } from "../src/server/import/providers";
import { hashPassword } from "../src/server/auth/password";
import { demoRecords } from "./demo-data";

const DEMO_SOURCE = "demo";
const STAFF = [
  { email: "admin@salamat.local", name: "Демо Super Admin", roles: ["SUPER_ADMIN"], pharmacies: [] as string[] },
  { email: "operator@salamat.local", name: "Демо Оператор", roles: ["OPERATOR"], pharmacies: [] },
  { email: "catalog@salamat.local", name: "Демо Менеджер каталога", roles: ["CATALOG_MANAGER"], pharmacies: [] },
  { email: "branch@salamat.local", name: "Демо Менеджер филиала", roles: ["BRANCH_MANAGER"], pharmacies: ["SAL-01", "SAL-02"] },
  { email: "content@salamat.local", name: "Демо Контент-менеджер", roles: ["CONTENT_MANAGER"], pharmacies: [] },
];

async function remove() {
  const src = await prisma.dataSource.findUnique({ where: { code: DEMO_SOURCE } });
  if (src) {
    const variants = await prisma.productVariant.findMany({ where: { sourceId: src.id }, select: { productId: true } });
    await prisma.productVariant.deleteMany({ where: { sourceId: src.id } });
    await prisma.product.deleteMany({ where: { id: { in: variants.map((v) => v.productId) }, variants: { none: {} } } });
  }
  await prisma.promotion.deleteMany({ where: { slug: { startsWith: "demo-" } } });
  await prisma.category.deleteMany({ where: { parentId: { not: null }, products: { none: {} }, children: { none: {} }, sortOrder: 100 } });
  await prisma.adminUser.deleteMany({ where: { email: { in: STAFF.map((s) => s.email) } } });
  console.log("Demo data removed.");
}

async function load() {
  const pharmacies = await prisma.pharmacy.findMany({ orderBy: { sortOrder: "asc" }, select: { code: true, id: true } });
  if (!pharmacies.length) throw new Error("Run `npm run db:seed` first: no pharmacies found");
  const records = demoRecords(pharmacies.map((p) => p.code));
  const provider: DataProvider = {
    code: DEMO_SOURCE,
    name: "Демо-набор (вымышленные товары и цены)",
    kind: "FILE_IMPORT",
    fetchRecords: async () => ({ headers: Object.keys(records[0]), records, truncated: false }),
  };
  const { jobId, missingColumns } = await createImportPreview({ provider, fileName: "demo-data (generated)", publishNew: true, adminUserId: null, isDemo: true });
  if (missingColumns.length) throw new Error(`missing columns ${missingColumns.join(",")}`);
  await applyImport(jobId, null);
  const job = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
  console.log(`Demo import: created ${job.createdCount}, updated ${job.updatedCount}, skipped ${job.skippedCount}, rejected ${job.rejectedCount}`);

  // Make sure demo products are published (an earlier run may have created them as drafts).
  const src = await prisma.dataSource.findUniqueOrThrow({ where: { code: DEMO_SOURCE } });
  const productIds = (await prisma.productVariant.findMany({ where: { sourceId: src.id }, select: { productId: true } })).map((v) => v.productId);
  await prisma.product.updateMany({ where: { id: { in: productIds } }, data: { publicationStatus: "PUBLISHED" } });
  // Editorial picks for the home page.
  const picks = await prisma.product.findMany({ where: { id: { in: productIds }, name: { in: ["Витамин D3", "Тонометр автоматический", "Магний B6", "Зубная паста"] } } });
  await prisma.product.updateMany({ where: { id: { in: picks.map((p) => p.id) } }, data: { featuredAt: new Date() } });

  // Promotions: one active bonus, one expired discount (expired ones must not be shown as active).
  const d3 = await prisma.productVariant.findFirst({ where: { externalId: "D-0010", sourceId: src.id } });
  const mg = await prisma.productVariant.findFirst({ where: { externalId: "D-0012", sourceId: src.id } });
  const day = 86400_000;
  await prisma.promotion.deleteMany({ where: { slug: { startsWith: "demo-" } } });
  if (d3) {
    await prisma.promotion.create({
      data: {
        slug: "demo-bonus-vitamin-d3",
        titleRu: "Демо: бонус за витамин D3",
        titleKk: "Демо: D3 дәруменіне бонус",
        descriptionRu: "Пример бонусной акции для проверки интерфейса. Бонус не уменьшает цену товара.",
        descriptionKk: "Интерфейсті тексеруге арналған бонустық акцияның мысалы. Бонус тауар бағасын азайтпайды.",
        termsRu: "Демонстрационная акция. Не более 2 упаковок в одной заявке.",
        type: "BONUS",
        benefitValue: 300,
        benefitUnit: "KZT",
        startsAt: new Date(Date.now() - day),
        endsAt: new Date(Date.now() + 30 * day),
        status: "PUBLISHED",
        appliesToAllPharmacies: true,
        variants: { create: { variantId: d3.id } },
      },
    });
  }
  if (mg) {
    await prisma.promotion.create({
      data: {
        slug: "demo-expired-discount",
        titleRu: "Демо: завершённая скидка на магний",
        type: "DISCOUNT",
        benefitValue: 10,
        benefitUnit: "PERCENT",
        startsAt: new Date(Date.now() - 20 * day),
        endsAt: new Date(Date.now() - day),
        status: "PUBLISHED",
        appliesToAllPharmacies: true,
        variants: { create: { variantId: mg.id } },
      },
    });
  }

  // Demo staff accounts (one per role).
  const password = process.env.DEMO_STAFF_PASSWORD || "salamat-demo-2026";
  const hash = await hashPassword(password);
  const roles = await prisma.role.findMany();
  for (const s of STAFF) {
    const user = await prisma.adminUser.upsert({
      where: { email: s.email },
      create: { email: s.email, name: s.name, passwordHash: hash },
      update: { passwordHash: hash, isActive: true, failedLoginCount: 0, lockedUntil: null },
    });
    await prisma.adminUserRole.deleteMany({ where: { adminUserId: user.id } });
    await prisma.adminUserRole.createMany({ data: s.roles.map((code) => ({ adminUserId: user.id, roleId: roles.find((r) => r.code === code)!.id })) });
    await prisma.adminUserPharmacy.deleteMany({ where: { adminUserId: user.id } });
    const ids = pharmacies.filter((p) => s.pharmacies.includes(p.code)).map((p) => p.id);
    if (ids.length) await prisma.adminUserPharmacy.createMany({ data: ids.map((pharmacyId) => ({ adminUserId: user.id, pharmacyId })) });
  }
  console.log(`Demo staff: ${STAFF.map((s) => s.email).join(", ")} — password: ${password}`);
  console.log("Set SHOW_DEMO_DATA=true to show demo products on the public site.");
}

async function main() {
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
    throw new Error("Refusing to load demo data with NODE_ENV=production");
  }
  if (process.argv.includes("--remove")) await remove();
  else await load();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
