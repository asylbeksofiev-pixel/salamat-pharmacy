// Decision rules for product photos. Pure functions: no network, no database.
//
// A photo is accepted automatically only when ALL of these hold:
//   * the candidate's barcode equals the product's article, and the article is a valid global GTIN;
//   * every package characteristic in the product name (strength, form, volume, pack size) is confirmed by the candidate;
//   * the source grants a right to reuse the photo (SALAMAT/manufacturer files, an open licence, or written permission);
//   * the image passed the file checks;
//   * the barcode is not shared by products with different characteristics.
// The one exception: a file SALAMAT assigned to a product id is accepted unless its stated characteristics contradict the name.
// Anything less goes to manual review; no candidate means "missing". Similar packages are never substituted.

import { classifyArticle, sameGtin, type ArticleCheck } from "./barcode";
import { compareAttributes, describeAttributes, parseAttributes, type AttributeComparison } from "./attributes";

export type ReviewStatus = "approved" | "needs_review" | "missing" | "rejected";
export type MatchMethod = "assigned_by_salamat" | "barcode_exact" | "name_search" | "none";

/** Where a candidate photo comes from and on what terms it may be reused. */
export interface SourceRights {
  /** Short source code: salamat, off, obf, opf, nct. */
  source: string;
  sourceName: string;
  /** Licence or permission, e.g. "CC BY-SA 3.0", "Фото предоставлено SALAMAT", "Не предоставлено". */
  license: string;
  /** Credit line required by the licence; null when none is required. */
  attribution: string | null;
  /** True only when reuse on a commercial site is confirmed. */
  reuseAllowed: boolean;
}

export interface Candidate {
  rights: SourceRights;
  /** Page that shows the product and the photo (for people to verify). */
  sourcePage: string;
  /** Direct URL of the original image; null when the source has a card but no usable photo. */
  imageUrl: string | null;
  barcode: string | null;
  name: string | null;
  manufacturer: string | null;
  /** Extra text that states form, strength, volume or pack size (quantity, form fields of the source). */
  details: string | null;
  /** SALAMAT itself assigned this file to the product id (stronger than a barcode match). */
  assignedToProduct?: boolean;
}

export interface ImageCheck {
  ok: boolean;
  /** Problems that block publication (wrong type, too small, blank…). */
  errors: string[];
  /** Problems a person should look at (low resolution, unusual proportions…). */
  warnings: string[];
  width?: number;
  height?: number;
  sha256?: string;
}

export interface Decision {
  reviewStatus: ReviewStatus;
  matchMethod: MatchMethod;
  /** 0…1, how sure the match is (not a probability; used for sorting the review queue). */
  confidence: number;
  reasons: string[];
  comparison: AttributeComparison | null;
  productAttributes: string;
  candidateAttributes: string;
}

export interface ProductRef {
  id: string;
  article: string | null;
  name: string;
}

export interface DecideInput {
  product: ProductRef;
  candidate: Candidate | null;
  image: ImageCheck | null;
  /** Other products with the same article whose characteristics differ (from the read-only catalogue). */
  conflictingDuplicates?: number;
  /** The same image file was found for products with different characteristics. */
  sharedImageConflict?: boolean;
}

export function articleCheck(p: ProductRef): ArticleCheck {
  return classifyArticle(p.article);
}

export function decide(input: DecideInput): Decision {
  const { product, candidate, image } = input;
  const productAttrs = parseAttributes(product.name);
  const productAttributes = describeAttributes(productAttrs);
  const art = classifyArticle(product.article);
  if (!candidate) {
    return {
      reviewStatus: "missing",
      matchMethod: "none",
      confidence: 0,
      reasons: [art.kind === "gtin" ? "no_candidate_found" : `article_${art.kind}`],
      comparison: null,
      productAttributes,
      candidateAttributes: "",
    };
  }

  const reasons: string[] = [];
  const assigned = !!candidate.assignedToProduct && candidate.rights.source === "salamat";
  const barcodeExact = art.kind === "gtin" && sameGtin(candidate.barcode, art.gtin14);
  const exact = assigned || barcodeExact;
  const candAttrs = parseAttributes([candidate.name, candidate.details].filter(Boolean).join(" "));
  const comparison = compareAttributes(productAttrs, candAttrs);

  if (!exact) reasons.push(art.kind === "gtin" ? "barcode_not_confirmed" : `article_${art.kind}`);
  if (comparison.status === "mismatch") reasons.push(...comparison.mismatches.map((m) => `mismatch_${m.key}:${m.product}≠${m.candidate}`));
  if (comparison.status === "insufficient" && !assigned) reasons.push(...comparison.unverified.map((k) => `unverified_${k}`));
  if (!candidate.rights.reuseAllowed) reasons.push("reuse_rights_not_confirmed");
  if (!candidate.imageUrl) reasons.push("source_has_no_photo");
  if (image && !image.ok) reasons.push(...image.errors.map((e) => `image_${e}`));
  if (image?.warnings.length) reasons.push(...image.warnings.map((w) => `image_${w}`));
  if (input.conflictingDuplicates && !assigned) reasons.push(`article_shared_with_${input.conflictingDuplicates}_different_products`);
  if (input.sharedImageConflict && !assigned) reasons.push("same_image_for_different_products");

  let confidence = assigned ? 0.9 : barcodeExact ? 0.6 : 0.2;
  if (comparison.status === "consistent") confidence += exact ? 0.3 + Math.min(comparison.confirmed.length, 3) * 0.03 : 0.15;
  else if (comparison.status === "insufficient") confidence += assigned ? 0.05 : 0.1 + comparison.confirmed.length * 0.03;
  else confidence -= assigned ? 0.4 : 0.15;
  confidence = Math.max(0, Math.min(1, Math.round(confidence * 100) / 100));

  const imageOk = !!image && image.ok && image.warnings.length === 0;
  const attributesOk = comparison.status === "consistent" || (assigned && comparison.status === "insufficient");
  const auto =
    exact &&
    attributesOk &&
    candidate.rights.reuseAllowed &&
    !!candidate.imageUrl &&
    imageOk &&
    (assigned || (!input.conflictingDuplicates && !input.sharedImageConflict));

  // A file that cannot be an image of anything (wrong type, blank, broken) is rejected outright.
  const unusable = !!image && !image.ok && image.errors.some((e) => /^(not_image|unsupported_type|blank|corrupt)/.test(e));
  return {
    reviewStatus: auto ? "approved" : unusable && exact ? "rejected" : "needs_review",
    matchMethod: assigned ? "assigned_by_salamat" : barcodeExact ? "barcode_exact" : "name_search",
    confidence,
    reasons,
    comparison,
    productAttributes,
    candidateAttributes: describeAttributes(candAttrs),
  };
}

/** Priority of sources: SALAMAT/manufacturer files first, then NCT with permission, then open-licence databases. */
export function sourceRank(c: Candidate): number {
  if (c.rights.source === "salamat") return 0;
  if (c.rights.source === "nct" && c.rights.reuseAllowed) return 1;
  if (c.rights.reuseAllowed) return 2;
  return 3;
}

/** Products with the same article but different characteristics must not share a photo by mistake. */
export function conflictingDuplicates(product: ProductRef, sameArticle: ProductRef[]): number {
  const mine = describeAttributes(parseAttributes(product.name));
  return sameArticle.filter((o) => o.id !== product.id && describeAttributes(parseAttributes(o.name)) !== mine).length;
}
