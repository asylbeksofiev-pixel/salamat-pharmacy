import "server-only";
import { prisma } from "./db";
import { env } from "./env";
import { getSettings } from "./settings";
import { activePromotionWhere, getCategoryTree, categoryPath, listVariants, promosForVariants, type CategoryNode, type PromoBadge, type VariantCard } from "./catalog";
import { computeOffer, isConfirmedAvailable, type Offer, type PrescriptionValue } from "@/lib/offer";
import { pickLocalized, pickLocalizedOptional, type Locale } from "@/lib/i18n";

export interface VariantDetail {
  id: string;
  slug: string;
  fullName: string;
  dosage: string | null;
  form: string | null;
  volume: string | null;
  packageSize: string | null;
  barcode: string | null;
  salamatSku: string | null;
  prescriptionStatus: PrescriptionValue;
  imageUrl: string | null;
  lastVerifiedAt: string | null;
  offer: Offer;
  availableAt: { pharmacyId: string; slug: string; address: string; priceKzt: number | null; low: boolean }[];
  promos: PromoBadge[];
}

export interface ProductDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  brandName: string | null;
  manufacturer: string | null;
  category: CategoryNode | null;
  categoryPath: CategoryNode[];
  variants: VariantDetail[];
  isDemo: boolean;
  updatedAt: string;
}

function visibleVariantWhere() {
  return {
    isActive: true,
    ...(env.showDemoData ? {} : { OR: [{ sourceId: null }, { source: { isDemo: false } }] }),
  };
}

export async function getProduct(slug: string, locale: Locale, pharmacyId: string | null): Promise<ProductDetail | null> {
  if (!slug || slug.length > 200) return null;
  const settings = await getSettings();
  const policy = settings.offerPolicy;
  const now = new Date();
  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      brand: true,
      variants: {
        where: visibleVariantWhere(),
        orderBy: [{ fullName: "asc" }],
        include: {
          source: { select: { isDemo: true } },
          prices: { where: { pharmacy: { isActive: true } }, include: { pharmacy: { select: { id: true, slug: true, addressRu: true, addressKk: true, sortOrder: true } } } },
          inventories: { where: { pharmacy: { isActive: true } } },
        },
      },
    },
  });
  if (!product || product.publicationStatus !== "PUBLISHED" || product.variants.length === 0) return null;

  const tree = await getCategoryTree(locale);
  const category = product.categoryId ? (tree.byId.get(product.categoryId) ?? null) : null;
  const promos = await promosForVariants(
    product.variants.map((v) => ({ id: v.id, categoryId: product.categoryId })),
    pharmacyId,
    locale,
  );
  const pharmacies = await prisma.pharmacy.findMany({
    where: { isActive: true },
    select: { id: true, slug: true, addressRu: true, addressKk: true, sortOrder: true },
    orderBy: [{ sortOrder: "asc" }],
  });

  const variants: VariantDetail[] = product.variants.map((v) => {
    const price = pharmacyId ? v.prices.find((p) => p.pharmacyId === pharmacyId) : undefined;
    const inv = pharmacyId ? v.inventories.find((i) => i.pharmacyId === pharmacyId) : undefined;
    const availableAt = pharmacies
      .map((ph) => {
        const i = v.inventories.find((x) => x.pharmacyId === ph.id);
        if (!i || !isConfirmedAvailable(i, policy, now)) return null;
        const p = v.prices.find((x) => x.pharmacyId === ph.id);
        const priceFresh = p && now.getTime() - p.sourceUpdatedAt.getTime() <= policy.priceStaleHours * 3600_000;
        return {
          pharmacyId: ph.id,
          slug: ph.slug,
          address: pickLocalized(locale, ph.addressRu, ph.addressKk),
          priceKzt: priceFresh ? p!.priceKzt : null,
          low: i.status === "LOW_STOCK" || (i.quantity !== null && i.quantity <= policy.lowStockThreshold),
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
    return {
      id: v.id,
      slug: v.slug,
      fullName: v.fullName,
      dosage: v.dosage,
      form: v.form,
      volume: v.volume,
      packageSize: v.packageSize,
      barcode: v.barcode,
      salamatSku: v.salamatSku,
      prescriptionStatus: v.prescriptionStatus,
      imageUrl: v.imageUrl,
      lastVerifiedAt: v.lastVerifiedAt?.toISOString() ?? null,
      offer: computeOffer({
        hasPharmacy: !!pharmacyId,
        price: price ? { priceKzt: price.priceKzt, oldPriceKzt: price.oldPriceKzt, sourceUpdatedAt: price.sourceUpdatedAt } : null,
        inventory: inv ? { status: inv.status, quantity: inv.quantity, sourceUpdatedAt: inv.sourceUpdatedAt } : null,
        prescriptionStatus: v.prescriptionStatus,
        policy,
        now,
      }),
      availableAt,
      promos: promos.get(v.id) ?? [],
    };
  });

  return {
    id: product.id,
    slug: product.slug,
    name: pickLocalized(locale, product.name, product.nameKk),
    description: pickLocalizedOptional(locale, product.descriptionRu, product.descriptionKk),
    brandName: product.brand?.name ?? null,
    manufacturer: product.manufacturer,
    category,
    categoryPath: category ? categoryPath(category, tree.byId) : [],
    variants,
    isDemo: product.variants.some((v) => v.source?.isDemo),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export async function sameCategoryItems(product: ProductDetail, locale: Locale, pharmacyId: string | null): Promise<VariantCard[]> {
  if (!product.category) return [];
  const res = await listVariants({
    locale,
    pharmacyId,
    categoryIds: [product.category.id],
    filters: { sort: "name" },
    pageSize: 9,
  });
  return res.items.filter((i) => i.productSlug !== product.slug).slice(0, 8);
}

/** Editorial picks for the home page: only products a staff member explicitly marked. */
export async function featuredItems(locale: Locale, pharmacyId: string | null): Promise<VariantCard[]> {
  const featured = await prisma.product.findMany({
    where: { featuredAt: { not: null }, publicationStatus: "PUBLISHED" },
    select: { id: true },
    orderBy: { featuredAt: "desc" },
    take: 8,
  });
  if (!featured.length) return [];
  const ids = featured.map((f) => f.id);
  const variants = await prisma.productVariant.findMany({
    where: { productId: { in: ids }, ...visibleVariantWhere() },
    select: { id: true },
    distinct: ["productId"],
  });
  const res = await listVariants({ locale, pharmacyId, variantIds: variants.map((v) => v.id), filters: { sort: "name" }, pageSize: 8 });
  return res.items;
}

export async function activePromotionsCount(): Promise<number> {
  return prisma.promotion.count({ where: activePromotionWhere() });
}
