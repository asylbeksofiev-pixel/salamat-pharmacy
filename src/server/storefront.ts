import "server-only";
// What the storefront can honestly offer right now, derived from the data (not from flags):
// * ordering — the cart and pickup requests work when at least one pharmacy accepts requests and there is
//   something to request: SKU-level products with confirmed prices, or catalogue products (public.pharmacy_products)
//   sent "to be confirmed" — the pharmacy confirms price and stock by phone (request mode, no online payment);
// * pricesConfirmed — at least one SKU has a confirmed price (texts that talk about prices on the site);
// * categories — category navigation is shown only for sections that actually contain products: SKU-level products
//   or catalogue products with a published section (catalog_item_categories, review_status auto/confirmed);
// * catalogCategoryCounts — catalogue products per section (subsections included), for tiles and filters;
// * catalogTotal — size of the public product list from public.pharmacy_products (hidden products are not counted).
import { cache } from "react";
import { prisma } from "./db";
import { env } from "./env";

export interface StorefrontState {
  orderingEnabled: boolean;
  pricesConfirmed: boolean;
  categoryIdsWithProducts: Set<string>;
  /** Catalogue products per section id, subsections included. */
  catalogCategoryCounts: Map<string, number>;
  catalogTotal: number | null;
}

const visibleVariant = () => ({
  isActive: true,
  product: { publicationStatus: "PUBLISHED" as const },
  ...(env.showDemoData ? {} : { OR: [{ sourceId: null }, { source: { isDemo: false } }] }),
});

export const getStorefrontState = cache(async (): Promise<StorefrontState> => {
  const [priced, accepting, products, categories, total, classified] = await Promise.all([
    prisma.price.findFirst({ where: { variant: visibleVariant(), pharmacy: { isActive: true } }, select: { id: true } }),
    prisma.pharmacy.findFirst({ where: { isActive: true, acceptsOrders: true }, select: { id: true } }),
    prisma.product.findMany({
      where: { publicationStatus: "PUBLISHED", categoryId: { not: null }, variants: { some: visibleVariant() } },
      select: { categoryId: true },
      distinct: ["categoryId"],
    }),
    prisma.category.findMany({ select: { id: true, parentId: true } }),
    prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM public.pharmacy_products p
      WHERE NOT EXISTS (SELECT 1 FROM "catalog_item_visibility" v WHERE v."product_id" = p."id" AND NOT v."is_public")`.then(
      (r) => Number(r[0]?.n ?? 0),
      () => null,
    ),
    // Published sections of catalogue products that still exist in the catalogue.
    prisma.$queryRaw<{ id: string; n: bigint }[]>`
      SELECT c."category_id" AS id, count(*) AS n
      FROM "catalog_item_categories" c JOIN public.pharmacy_products p ON p."id" = c."product_id"
      WHERE c."review_status" IN ('auto', 'confirmed') AND c."category_id" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "catalog_item_visibility" v WHERE v."product_id" = p."id" AND NOT v."is_public")
      GROUP BY 1`.then(
      (r) => r.map((x) => ({ id: x.id, n: Number(x.n) })),
      () => [] as { id: string; n: number }[],
    ),
  ]);
  // A section "has products" if it or any of its subsections does.
  const parent = new Map(categories.map((c) => [c.id, c.parentId]));
  const withProducts = new Set<string>();
  const ancestors = (id: string | null | undefined) => {
    const out: string[] = [];
    for (let cur = id, i = 0; cur && i < 10; i++, cur = parent.get(cur)) out.push(cur);
    return out;
  };
  for (const { categoryId } of products) for (const id of ancestors(categoryId)) withProducts.add(id);
  const catalogCategoryCounts = new Map<string, number>();
  for (const { id, n } of classified) {
    for (const a of ancestors(id)) {
      withProducts.add(a);
      catalogCategoryCounts.set(a, (catalogCategoryCounts.get(a) ?? 0) + n);
    }
  }
  const catalogRequests = !!accepting && (total ?? 0) > 0;
  return { orderingEnabled: !!priced || catalogRequests, pricesConfirmed: !!priced, categoryIdsWithProducts: withProducts, catalogCategoryCounts, catalogTotal: total };
});
