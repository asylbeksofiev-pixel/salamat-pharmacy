import type { MetadataRoute } from "next";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { activePromotionWhere } from "@/server/catalog";
import { localizedPath } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

/** Only published, public pages. Demo products, drafts, cart/checkout/orders and the admin panel are excluded. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.appUrl;
  const entry = (path: string, lastModified?: Date): MetadataRoute.Sitemap[number] => ({
    url: `${base}${localizedPath("ru", path)}`,
    lastModified,
    alternates: { languages: { "ru-KZ": `${base}${localizedPath("ru", path)}`, "kk-KZ": `${base}${localizedPath("kk", path)}` } },
  });
  const [categories, products, pharmacies, promotions, pages] = await Promise.all([
    prisma.category.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true } }),
    prisma.product.findMany({
      where: { publicationStatus: "PUBLISHED", variants: { some: { isActive: true, OR: [{ sourceId: null }, { source: { isDemo: false } }] } } },
      select: { slug: true, updatedAt: true },
      take: 45000,
    }),
    prisma.pharmacy.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true } }),
    prisma.promotion.findMany({ where: activePromotionWhere(), select: { slug: true, updatedAt: true } }),
    prisma.contentPage.findMany({ where: { status: "PUBLISHED", requiresLegalReview: false }, select: { slug: true, updatedAt: true } }),
  ]);
  return [
    entry("/"),
    entry("/catalog"),
    entry("/pharmacies"),
    entry("/promotions"),
    ...pages.map((p) => entry(`/${p.slug}`, p.updatedAt)),
    ...categories.map((c) => entry(`/catalog/${c.slug}`, c.updatedAt)),
    ...products.map((p) => entry(`/product/${p.slug}`, p.updatedAt)),
    ...pharmacies.map((p) => entry(`/pharmacies/${p.slug}`, p.updatedAt)),
    ...promotions.map((p) => entry(`/promotions/${p.slug}`, p.updatedAt)),
  ];
}
