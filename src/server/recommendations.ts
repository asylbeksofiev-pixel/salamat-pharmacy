import "server-only";
// Recommendations for a catalogue product page, from real catalogue data only (no invented links):
//   • similar — products whose name contains the same leading word (usually the active substance or the
//     product line: "Парацетамол …", "Аспирин …");
//   • also    — other products of the same catalogue section.
// Each list is one limited query (never the whole catalogue); the current product and duplicates are removed,
// and "also" never repeats what "similar" already shows. Any error gives empty lists: the page still works.
import { descendantIds, getCategoryTree } from "./catalog";
import { listCatalogItems, type CatalogItem } from "./catalog-items";
import type { Locale } from "@/lib/i18n";

export const RECOMMENDATION_LIMIT = 12;

/** Generic leading words that say nothing about what the product is. */
const GENERIC = new Set(["набор", "комплект", "средство", "товар", "тестовый", "test", "set", "new"]);

/** The leading word of a product name to look for similar products: letters only, at least 4 of them. */
export function similarityKey(name: string): string | null {
  const first = name
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[\s,.;:()«»"'/+-]+/)
    .find(Boolean);
  if (!first || !/^\p{L}{4,}$/u.test(first) || GENERIC.has(first)) return null;
  return first;
}

function without(items: CatalogItem[], exclude: Set<string>, limit: number): CatalogItem[] {
  const out: CatalogItem[] = [];
  for (const it of items) {
    if (exclude.has(it.id)) continue;
    exclude.add(it.id);
    out.push(it);
    if (out.length >= limit) break;
  }
  return out;
}

export async function productRecommendations(item: CatalogItem, locale: Locale): Promise<{ similar: CatalogItem[]; also: CatalogItem[] }> {
  const seen = new Set([item.id]);
  let similar: CatalogItem[] = [];
  let also: CatalogItem[] = [];
  const key = similarityKey(item.name);
  try {
    if (key) {
      const page = await listCatalogItems({ q: key, page: 1, pageSize: RECOMMENDATION_LIMIT + 1, locale, sort: "relevance" });
      // The search may fix the keyboard layout or match the article: keep only names that really share the word.
      similar = without(
        page.items.filter((x) => similarityKey(x.name) === key),
        seen,
        RECOMMENDATION_LIMIT,
      );
    }
  } catch (e) {
    console.error("similar products failed", (e as Error).message.slice(0, 200));
  }
  try {
    if (item.categorySlug) {
      const node = (await getCategoryTree(locale)).bySlug.get(item.categorySlug);
      if (node) {
        const page = await listCatalogItems({ categoryIds: descendantIds(node), page: 1, pageSize: RECOMMENDATION_LIMIT + similar.length + 1, locale });
        also = without(page.items, seen, RECOMMENDATION_LIMIT);
      }
    }
  } catch (e) {
    console.error("section products failed", (e as Error).message.slice(0, 200));
  }
  return { similar, also };
}
