import "server-only";
// What the storefront can honestly offer right now, derived from the data (not from flags):
// * ordering — online requests need SKU-level products with a confirmed price in at least one pharmacy;
// * categories — category navigation is shown only for sections that actually contain products;
// * catalogTotal — size of the product list from public.pharmacy_products.
import { cache } from "react";
import { prisma } from "./db";
import { env } from "./env";

export interface StorefrontState {
  orderingEnabled: boolean;
  categoryIdsWithProducts: Set<string>;
  catalogTotal: number | null;
}

const visibleVariant = () => ({
  isActive: true,
  product: { publicationStatus: "PUBLISHED" as const },
  ...(env.showDemoData ? {} : { OR: [{ sourceId: null }, { source: { isDemo: false } }] }),
});

export const getStorefrontState = cache(async (): Promise<StorefrontState> => {
  const [priced, products, categories, total] = await Promise.all([
    prisma.price.findFirst({ where: { variant: visibleVariant(), pharmacy: { isActive: true } }, select: { id: true } }),
    prisma.product.findMany({
      where: { publicationStatus: "PUBLISHED", categoryId: { not: null }, variants: { some: visibleVariant() } },
      select: { categoryId: true },
      distinct: ["categoryId"],
    }),
    prisma.category.findMany({ select: { id: true, parentId: true } }),
    prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM public.pharmacy_products`.then(
      (r) => Number(r[0]?.n ?? 0),
      () => null,
    ),
  ]);
  // A section "has products" if it or any of its subsections does.
  const parent = new Map(categories.map((c) => [c.id, c.parentId]));
  const withProducts = new Set<string>();
  for (const { categoryId } of products) {
    let cur: string | null | undefined = categoryId;
    for (let i = 0; cur && i < 10; i++) {
      withProducts.add(cur);
      cur = parent.get(cur);
    }
  }
  return { orderingEnabled: !!priced, categoryIdsWithProducts: withProducts, catalogTotal: total };
});
