import "server-only";
// Everything a catalogue listing page needs (catalogue, a section page, search): validated URL state, the page of
// products, per-section counts for the filter panel and what the data allows (prices, popularity).
import { getCategoryTree, descendantIds, type CategoryNode } from "./catalog";
import { countCatalogItemsByCategory, getCatalogFacts, listCatalogItems, type CatalogPage } from "./catalog-items";
import { getStorefrontState } from "./storefront";
import { parseCatalogQuery, type CatalogQuery } from "@/lib/catalog-params";
import { localeTags, localizedPath, type Locale } from "@/lib/i18n";
import type { CatalogFiltersConfig } from "@/components/catalog/CatalogItems";

type SP = Record<string, string | string[] | undefined>;

export interface CatalogListing {
  query: CatalogQuery;
  result: CatalogPage | null;
  failed: boolean;
  filters: CatalogFiltersConfig;
}

export async function loadCatalogListing({ locale, searchParams, section }: { locale: Locale; searchParams: SP; section?: CategoryNode }): Promise<CatalogListing> {
  const [tree, store, facts] = await Promise.all([getCategoryTree(locale), getStorefrontState(), getCatalogFacts().catch(() => null)]);
  const query = parseCatalogQuery(searchParams, { known: new Set(tree.bySlug.keys()) });
  // On a section page the section comes from the path; ?category= is ignored there.
  if (section) query.categories = [];
  const categoryIds = section ? descendantIds(section) : query.categories.flatMap((slug) => descendantIds(tree.bySlug.get(slug)!));
  const filterInput = { q: query.q, priceMin: query.priceMin, priceMax: query.priceMax, hasPrice: query.hasPrice, hasPhoto: query.hasPhoto };

  let result: CatalogPage | null = null;
  let failed = false;
  let counts = new Map<string, number>();
  try {
    [result, counts] = await Promise.all([
      listCatalogItems({ ...filterInput, categoryIds, sort: query.sort, page: query.page, locale }),
      countCatalogItemsByCategory(filterInput),
    ]);
  } catch (e) {
    failed = true;
    console.error("catalog listing failed", (e as Error).message.slice(0, 200));
  }

  // Top-level sections that hold catalogue products; counts follow the current search and filters.
  const countFor = (node: CategoryNode) => descendantIds(node).reduce((sum, id) => sum + (counts.get(id) ?? 0), 0);
  const nf = (n: number) => n.toLocaleString(localeTags[locale]);
  const sections = tree.roots
    .filter((r) => store.catalogCategoryCounts.has(r.id))
    .map((r) => {
      const count = countFor(r);
      return { slug: r.slug, name: r.name, count, countLabel: nf(count) };
    });
  const range = facts?.priceRange ?? null;

  return {
    query,
    result,
    failed,
    filters: {
      sectionMode: section ? "links" : "multi",
      sections,
      currentSection: section?.slug ?? null,
      sectionBase: localizedPath(locale, "/catalog"),
      allSectionsHref: localizedPath(locale, "/catalog"),
      pricesAvailable: facts?.pricesAvailable ?? false,
      priceRange: range ? { ...range, minLabel: nf(range.min), maxLabel: nf(range.max) } : null,
      popularityAvailable: facts?.popularityAvailable ?? false,
    },
  };
}
