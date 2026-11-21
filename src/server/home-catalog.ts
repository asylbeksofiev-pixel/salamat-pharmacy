import "server-only";
// The home page "Catalogue" carousel: a varied selection of real products (see src/config/home-catalog.ts).
//   1. pinned ids from the config, if public;
//   2. then one product at a time from each section in turn (photos first, stable pseudo-random order), skipping a
//      brand or a product (other size) that is already shown;
//   3. if sections are too small (e.g. a fresh database without sections), the stable catalogue preview fills the rest.
// One bounded query per step; the whole catalogue never leaves the database.
import { HOME_CATALOG, type HomeCatalogConfig } from "@/config/home-catalog";
import { productFeatures } from "@/lib/product-features";
import type { Locale } from "@/lib/i18n";
import { getCategoryTree } from "./catalog";
import { listCatalogItemsByIds, listCatalogPreview, listHomeCandidates, type CatalogItem } from "./catalog-items";

export function spreadAcrossSections<T extends CatalogItem & { sectionId: string }>(
  candidates: T[],
  sectionOrder: string[],
  size: number,
  taken: CatalogItem[] = [],
): CatalogItem[] {
  const out: CatalogItem[] = [...taken];
  const ids = new Set(out.map((i) => i.id));
  const brands = new Set<string>();
  const bases = new Set<string>();
  for (const i of out) {
    const f = productFeatures(i.name);
    if (f.key) brands.add(f.key);
    bases.add(f.base);
  }
  const queues = new Map<string, T[]>();
  for (const c of candidates) {
    if (!queues.has(c.sectionId)) queues.set(c.sectionId, []);
    queues.get(c.sectionId)!.push(c);
  }
  const order = [...sectionOrder.filter((s) => queues.has(s)), ...[...queues.keys()].filter((s) => !sectionOrder.includes(s)).sort()];
  let progress = true;
  while (out.length < size && progress) {
    progress = false;
    for (const section of order) {
      if (out.length >= size) break;
      const q = queues.get(section)!;
      while (q.length) {
        const c = q.shift()!;
        const f = productFeatures(c.name);
        if (ids.has(c.id) || (f.key && brands.has(f.key)) || bases.has(f.base)) continue;
        ids.add(c.id);
        if (f.key) brands.add(f.key);
        bases.add(f.base);
        const { sectionId: _section, ...item } = c;
        void _section;
        out.push(item);
        progress = true;
        break;
      }
    }
  }
  return out;
}

export async function homeCatalogSelection(locale: Locale, config: HomeCatalogConfig = HOME_CATALOG): Promise<CatalogItem[]> {
  const size = Math.max(1, Math.min(24, config.size));
  const excluded = new Set(config.excluded);
  const pinned = (await listCatalogItemsByIds(config.pinned.filter((id) => !excluded.has(id)), locale)).slice(0, size);
  if (pinned.length >= size) return pinned;
  const tree = await getCategoryTree(locale);
  const sectionOrder = config.sectionOrder.map((slug) => tree.bySlug.get(slug)?.id).filter((id): id is string => !!id);
  const candidates = (await listHomeCandidates({ perSection: 24, seed: config.seed, locale })).filter((c) => !excluded.has(c.id));
  let items = spreadAcrossSections(candidates, sectionOrder, size, pinned);
  if (items.length < size) {
    const seen = new Set(items.map((i) => i.id));
    const fill = (await listCatalogPreview(size * 2, locale)).filter((i) => !seen.has(i.id) && !excluded.has(i.id));
    items = [...items, ...fill].slice(0, size);
  }
  return items;
}
