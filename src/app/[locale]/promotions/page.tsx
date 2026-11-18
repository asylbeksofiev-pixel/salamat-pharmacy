import { notFound } from "next/navigation";
import { getDictionary, isLocale, localizedPath } from "@/lib/i18n";
import { getActivePromotions } from "@/server/promotions";
import { pageMetadata } from "@/server/seo";
import { env } from "@/server/env";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { EmptyState } from "@/components/ui/Feedback";
import { ButtonLink } from "@/components/ui/Button";
import { PromotionCard, featuredPromotionIndex } from "@/components/catalog/Tiles";

export async function generateMetadata({ params }: PageProps<"/[locale]/promotions">) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return pageMetadata(locale, "/promotions", t.meta.promotionsTitle, t.meta.promotionsDescription);
}

export default async function PromotionsPage({ params }: PageProps<"/[locale]/promotions">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const promos = await getActivePromotions(locale);
  // Same promotions in the same order; only the most substantial one is shown larger, first.
  const fi = featuredPromotionIndex(promos);
  const first = promos[fi];
  const rest = promos.filter((_, i) => i !== fi);
  return (
    <div className="container-page py-6 md:py-8">
      <Breadcrumbs items={[{ label: t.common.home, href: localizedPath(locale, "/") }, { label: t.promotions.title }]} label={t.common.breadcrumbs} baseUrl={env.appUrl} />
      <h1 className="mt-4 text-[1.75rem] font-bold tracking-tight sm:text-[2.1rem]">{t.promotions.title}</h1>
      {first ? (
        <>
          <p className="mt-1 max-w-2xl text-muted">{t.promotions.intro}</p>
          <ul className="anim-list mt-6 grid gap-4 md:grid-cols-2">
            <li className="md:col-span-2">
              <PromotionCard p={first} t={t} locale={locale} featured />
            </li>
            {rest.map((p) => (
              <li key={p.slug}>
                <PromotionCard p={p} t={t} locale={locale} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <EmptyState
          className="mt-6"
          icon="tag"
          title={t.promotions.empty}
          text={t.promotions.emptyText}
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <ButtonLink href={localizedPath(locale, "/catalog")} variant="outline">
                {t.common.catalog}
              </ButtonLink>
              <ButtonLink href={localizedPath(locale, "/pharmacies")} variant="ghost" icon="pin">
                {t.common.pharmacies}
              </ButtonLink>
            </div>
          }
        />
      )}
    </div>
  );
}
