import "server-only";
import { prisma } from "./db";
import { activePromotionWhere, listVariants, type VariantCard } from "./catalog";
import { pickLocalized, type Locale } from "@/lib/i18n";

export interface PromotionView {
  slug: string;
  title: string;
  description: string | null;
  terms: string | null;
  imageUrl: string | null;
  type: "DISCOUNT" | "BONUS" | "OTHER";
  benefitValue: number | null;
  benefitUnit: "KZT" | "PERCENT" | null;
  startsAt: string;
  endsAt: string | null;
  state: "active" | "ended" | "upcoming";
  /** Whole days until the end (rounded up), null without an end date. */
  daysLeft: number | null;
  appliesToAllPharmacies: boolean;
  pharmacies: { slug: string; address: string }[];
  categories: { slug: string; name: string }[];
  variantIds: string[];
}

function stateOf(p: { startsAt: Date; endsAt: Date | null }, now: Date): PromotionView["state"] {
  if (p.startsAt > now) return "upcoming";
  if (p.endsAt && p.endsAt <= now) return "ended";
  return "active";
}

const include = {
  pharmacies: { include: { pharmacy: { select: { slug: true, addressRu: true, addressKk: true, isActive: true } } } },
  categories: { include: { category: { select: { slug: true, nameRu: true, nameKk: true } } } },
  variants: { select: { variantId: true } },
} as const;

type Row = NonNullable<Awaited<ReturnType<typeof findOne>>>;
function findOne(slug: string) {
  return prisma.promotion.findUnique({ where: { slug }, include });
}

function toView(p: Row, locale: Locale, now: Date): PromotionView {
  return {
    slug: p.slug,
    title: pickLocalized(locale, p.titleRu, p.titleKk),
    description: locale === "kk" ? (p.descriptionKk ?? p.descriptionRu) : p.descriptionRu,
    terms: locale === "kk" ? (p.termsKk ?? p.termsRu) : p.termsRu,
    imageUrl: p.imageUrl,
    type: p.type,
    benefitValue: p.benefitValue,
    benefitUnit: p.benefitUnit,
    startsAt: p.startsAt.toISOString(),
    endsAt: p.endsAt?.toISOString() ?? null,
    state: stateOf(p, now),
    daysLeft: p.endsAt ? Math.ceil((p.endsAt.getTime() - now.getTime()) / 86_400_000) : null,
    appliesToAllPharmacies: p.appliesToAllPharmacies,
    pharmacies: p.pharmacies
      .filter((x) => x.pharmacy.isActive)
      .map((x) => ({ slug: x.pharmacy.slug, address: pickLocalized(locale, x.pharmacy.addressRu, x.pharmacy.addressKk) })),
    categories: p.categories.map((c) => ({ slug: c.category.slug, name: pickLocalized(locale, c.category.nameRu, c.category.nameKk) })),
    variantIds: p.variants.map((v) => v.variantId),
  };
}

export async function getActivePromotions(locale: Locale): Promise<PromotionView[]> {
  const now = new Date();
  const rows = await prisma.promotion.findMany({ where: activePromotionWhere(now), include, orderBy: [{ startsAt: "desc" }] });
  return rows.map((r) => toView(r, locale, now));
}

/** Published promotion by slug (also ended ones, shown as "ended" and not indexed). */
export async function getPromotion(slug: string, locale: Locale): Promise<PromotionView | null> {
  if (!slug || slug.length > 200) return null;
  const p = await findOne(slug);
  if (!p || p.status !== "PUBLISHED") return null;
  return toView(p, locale, new Date());
}

export async function promotionItems(p: PromotionView, locale: Locale, pharmacyId: string | null): Promise<VariantCard[]> {
  if (!p.variantIds.length) return [];
  const res = await listVariants({ locale, pharmacyId, variantIds: p.variantIds, filters: { sort: "name" }, pageSize: 48 });
  return res.items;
}
