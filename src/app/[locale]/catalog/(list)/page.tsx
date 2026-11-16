import { notFound } from "next/navigation";
import { getDictionary, isLocale, localizedPath } from "@/lib/i18n";
import { getCategoryTree } from "@/server/catalog";
import { listCatalogItems, type CatalogPage } from "@/server/catalog-items";
import { pageMetadata } from "@/server/seo";
import { env } from "@/server/env";
import { CatalogItemsView } from "@/components/catalog/CatalogItems";
import { CategoryTile } from "@/components/catalog/Tiles";

function readParams(sp: Record<string, string | string[] | undefined>) {
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const page = typeof sp.page === "string" && /^\d{1,6}$/.test(sp.page) ? Math.max(1, Number(sp.page)) : 1;
  return { q, page };
}

export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]/catalog">) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  const { q, page } = readParams(await searchParams);
  return pageMetadata(locale, "/catalog", t.meta.catalogTitle, t.meta.catalogDescription, { noindex: !!q || page > 1 });
}

export default async function CatalogPage({ params, searchParams }: PageProps<"/[locale]/catalog">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const { q, page } = readParams(await searchParams);
  const tree = await getCategoryTree(locale);
  let result: CatalogPage | null = null;
  let failed = false;
  try {
    result = await listCatalogItems({ q, page });
  } catch (e) {
    failed = true;
    console.error("catalog items failed", (e as Error).message.slice(0, 200));
  }
  return (
    <CatalogItemsView
      locale={locale}
      t={t}
      title={t.catalog.title}
      crumbs={[{ label: t.common.home, href: localizedPath(locale, "/") }, { label: t.catalog.title }]}
      basePath={localizedPath(locale, "/catalog")}
      q={q}
      result={result}
      failed={failed}
      baseUrl={env.appUrl}
      after={
        tree.roots.length ? (
          <section aria-labelledby="catalog-sections" className="mt-12">
            <h2 id="catalog-sections" className="mb-4 text-xl font-bold">
              {t.items.categoriesTitle}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tree.roots.map((c) => (
                <li key={c.slug}>
                  <CategoryTile slug={c.slug} name={c.name} iconKey={c.iconKey} locale={locale} />
                </li>
              ))}
            </ul>
          </section>
        ) : null
      }
    />
  );
}
