// Grading of NCT (nct.gov.kz) cards as candidates for a SALAMAT product. Pure functions.
//
// confirmed — the same item: identical GTIN (or NTIN/KZTIN), no contradiction in strength, form, volume or pack size,
//             every characteristic of the SALAMAT name confirmed, the brand of the SALAMAT name on the card, and the
//             names share at least half of the significant words.
//             A barcode identifies one trade item, so it also pins flavour/aroma/version.
// probable  — identical code but some characteristic is not stated on the card, or a name match with full word
//             coverage and confirmed characteristics. Needs a person.
// doubtful  — found by name, partly similar. Needs a person.
// mismatch  — contradicting strength/form/volume/pack size (another package) — kept for the record, never used.
// NCT grants no licence to reuse photos, so even "confirmed" means "needs the rights holder's permission".

import { classifyArticle, sameGtin } from "./barcode";
import { compareAttributes, describeAttributes, parseAttributes, type AttributeComparison, type PackAttributes } from "./attributes";
import { brandConfirmed, manufacturerMentioned, nameSimilarity, variantConflict, type NameSimilarity } from "./similarity";

export interface NctCard {
  id: number;
  name: string;
  gtin: string | null;
  ntin: string | null;
  kztin: string | null;
  images: string[];
  category: string | null;
  form: string | null;
  manufacturer: string | null;
  manufacturerBin?: string | null;
  country?: string | null;
  amountInPackage?: number | null;
  source?: number | null;
  externalId?: string | null;
  /** Full card fetched (manufacturer, BIN, pack amount known). */
  detailed?: boolean;
}

export type NctGrade = "confirmed" | "probable" | "doubtful" | "mismatch" | "unrelated";
export type NctMethod = "gtin_exact" | "ntin_exact" | "kztin_exact" | "name";

export interface NctAssessment {
  grade: NctGrade;
  method: NctMethod;
  score: number;
  reasons: string[];
  comparison: AttributeComparison;
  similarity: NameSimilarity;
  candidate: PackAttributes;
  manufacturerConfirmed: boolean;
}

export function nctUrl(id: number): string {
  return `https://nct.gov.kz/#/products/${id}`;
}

/** Text that states the card's form, strength, volume and pack size. */
function cardText(card: NctCard): string {
  const pack = card.amountInPackage && card.amountInPackage > 1 ? ` №${card.amountInPackage}` : "";
  return `${card.name} ${card.form ?? ""}${pack}`;
}

/**
 * @param sharedArticleConflicts other SALAMAT products with the same article but different characteristics
 *        (pharmacy_products.article is not unique): a barcode match cannot tell which of them the card shows.
 */
export function assessNctCard(product: { name: string; article: string | null }, card: NctCard, sharedArticleConflicts = 0): NctAssessment {
  const art = classifyArticle(product.article);
  const raw = (product.article ?? "").trim();
  const method: NctMethod =
    art.kind === "gtin" && sameGtin(card.gtin, art.gtin14)
      ? "gtin_exact"
      : raw && card.ntin && raw === card.ntin
        ? "ntin_exact"
        : raw && card.kztin && raw === card.kztin
          ? "kztin_exact"
          : "name";
  const exact = method !== "name";
  const mine = parseAttributes(product.name);
  const candidate = parseAttributes(cardText(card));
  const comparison = compareAttributes(mine, candidate);
  const similarity = nameSimilarity(product.name, card.name);
  const manufacturerConfirmed = manufacturerMentioned(product.name, card.manufacturer);
  // SALAMAT's table has no manufacturer column; the brand at the start of the name stands in for it.
  const brandOk = brandConfirmed(product.name, card.name, card.manufacturer);

  const reasons: string[] = [exact ? method : art.kind === "gtin" ? "barcode_not_on_card" : `article_${art.kind}`];
  for (const m of comparison.mismatches) reasons.push(`mismatch_${m.key}:${m.product}≠${m.candidate}`);
  for (const k of comparison.unverified) reasons.push(`unverified_${k}`);
  if (similarity.missing.length) reasons.push(`name_missing:${similarity.missing.slice(0, 4).join(",")}`);
  if (!exact && similarity.extra.length) reasons.push(`name_extra:${similarity.extra.slice(0, 4).join(",")}`);
  if (!brandOk) reasons.push("brand_not_on_card");
  reasons.push(manufacturerConfirmed ? "manufacturer_in_name" : "manufacturer_not_compared");
  if (!card.images.length) reasons.push("card_has_no_photo");
  // "ФАСОВКА": SALAMAT dispenses part of a pack in its own packaging — the manufacturer's box photo is not that item.
  const repack = /фасовк/i.test(product.name);
  if (repack) reasons.push("salamat_repack");
  // "в ассортименте": SALAMAT sells several flavours/colours under one article — a photo of one of them needs a person.
  const assortment = /ассорт/i.test(product.name);
  if (assortment) reasons.push("salamat_assortment");
  if (exact && sharedArticleConflicts > 0) reasons.push(`article_shared_with_${sharedArticleConflicts}_different_products`);
  const variant = variantConflict(similarity);
  if (variant) reasons.push(`variant_conflict:${variant.ours}≠${variant.theirs}`);

  let grade: NctGrade;
  if (comparison.status === "mismatch") grade = "mismatch";
  else if (exact) grade = comparison.status === "consistent" && similarity.coverage >= 0.5 && brandOk ? "confirmed" : "probable";
  else if (similarity.coverage >= 0.8 && similarity.reverse >= 0.6 && comparison.status === "consistent" && comparison.confirmed.length > 0) grade = "probable";
  else if (similarity.coverage >= 0.5) grade = "doubtful";
  else grade = "unrelated";
  if (repack && (grade === "confirmed" || grade === "probable")) grade = "doubtful";
  if (assortment && grade === "confirmed") grade = "probable";
  if (exact && sharedArticleConflicts > 0 && grade === "confirmed") grade = "probable";
  // Another flavour/colour/size: found by name it is another product; with the same barcode the data contradict each
  // other (wrong card or wrong SALAMAT name) and a person must decide.
  if (variant) grade = exact ? (grade === "confirmed" ? "probable" : grade) : grade === "unrelated" ? grade : "mismatch";

  const score =
    (exact ? 100 : 0) +
    similarity.coverage * 40 +
    similarity.reverse * 20 +
    comparison.confirmed.length * 6 -
    comparison.mismatches.length * 30 -
    comparison.unverified.length * 3 +
    (manufacturerConfirmed ? 5 : 0) +
    (card.images.length ? 2 : 0);
  return { grade, method, score: Math.round(score * 10) / 10, reasons, comparison, similarity, candidate, manufacturerConfirmed };
}

export const GRADE_ORDER: Record<NctGrade, number> = { confirmed: 0, probable: 1, doubtful: 2, mismatch: 3, unrelated: 4 };

/** The candidate's characteristics as manifest columns. */
export function attributeColumns(a: PackAttributes) {
  return { form: a.forms.join("/"), dosage: a.dosages.join("+"), volume: a.contents.join(", "), pack: a.counts.join("/"), summary: describeAttributes(a) };
}
