import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary, isLocale, localizedPath } from "@/lib/i18n";
import { fmt, localeTags } from "@/lib/i18n/config";
import { formatPhone, telHref } from "@/lib/format";
import { getCategoryTree } from "@/server/catalog";
import { getPharmacies, getSelectedPharmacy, routeLinks } from "@/server/pharmacies";
import { getActivePromotions } from "@/server/promotions";
import { featuredItems } from "@/server/products";
import { listCatalogPreview, type CatalogItem } from "@/server/catalog-items";
import { getSettings } from "@/server/settings";
import { getStorefrontState } from "@/server/storefront";
import { CatalogSearchForm } from "@/components/catalog/CatalogSearchForm";
import { pageMetadata } from "@/server/seo";
import { HeroStats } from "@/components/site/HeroStats";
import { HeroVisual } from "@/components/site/HeroVisual";
import { HomeScrollMotion } from "@/components/site/HomeScrollMotion";
import { CategoryTile, PharmacyCard, PromotionCard } from "@/components/catalog/Tiles";
import { ProductGrid } from "@/components/catalog/ProductCard";
import { CatalogItemCard } from "@/components/catalog/CatalogItems";
import { CAROUSEL_ITEM, ProductCarousel } from "@/components/catalog/ProductCarousel";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/icons";

export async function generateMetadata({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return { ...pageMetadata(locale, "/", t.meta.defaultTitle, t.meta.defaultDescription), title: { absolute: t.meta.defaultTitle } };
}

function SectionTitle({ id, title, action, text }: { id: string; title: string; action?: React.ReactNode; text?: string }) {
  return (
    <div data-home-reveal className="mb-6 flex items-end justify-between gap-4 md:mb-8">
      <div className="min-w-0">
        <h2 id={id} className="text-[1.6rem] leading-tight font-bold tracking-tight text-balance text-ink sm:text-[2rem]">
          {title}
        </h2>
        {text ? <p className="mt-2 max-w-2xl text-[0.98rem] text-muted">{text}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Catalogue preview for the home page; on a database error the section still leads to the catalogue. */
async function catalogPreview(): Promise<CatalogItem[]> {
  try {
    return await listCatalogPreview(12);
  } catch (e) {
    console.error("catalog preview failed", (e as Error).message.slice(0, 200));
    return [];
  }
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const [tree, pharmacies, selected, promotions, settings, store, preview] = await Promise.all([
    getCategoryTree(locale),
    getPharmacies(locale),
    getSelectedPharmacy(locale),
    getActivePromotions(locale),
    getSettings(),
    getStorefrontState(),
    catalogPreview(),
  ]);
  // Only sections that really contain products; with no categorised products the block becomes a catalogue entry.
  const roots = tree.roots.filter((c) => store.categoryIdsWithProducts.has(c.id));
  const numberLocale = localeTags[locale];
  const featured = await featuredItems(locale, selected?.id ?? null);
  const href = (p: string) => localizedPath(locale, p);
  const shownPharmacies = selected ? [selected, ...pharmacies.filter((p) => p.id !== selected.id)].slice(0, 6) : pharmacies.slice(0, 6);

  return (
    <HomeScrollMotion>
      {/* Hero: what SALAMAT offers and where to start. Search lives in the header; the catalogue section below
          is the second way in, so the hero itself has no search field. */}
      <section className="relative overflow-hidden border-b border-line bg-[radial-gradient(120%_90%_at_85%_10%,var(--color-brand-100)_0%,transparent_55%),linear-gradient(180deg,var(--color-brand-50)_0%,#fff_100%)]">
        <div className="container-page grid items-center gap-8 pt-8 pb-11 sm:pt-12 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] md:gap-8 md:pb-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14 lg:py-20">
          <div className="sal-hero-copy relative z-10 flex flex-col items-start gap-5 md:gap-6">
            <p className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-white/90 px-3 py-1 text-sm font-semibold text-brand-800 shadow-[var(--shadow-card)]">
              <span className="size-2 rounded-full bg-accent-500" aria-hidden="true" />
              {t.meta.siteName}
            </p>
            <h1 className="max-w-[16ch] text-[2.25rem] leading-[1.05] font-extrabold tracking-[-0.025em] text-balance text-ink sm:text-[3.25rem] md:text-[2.9rem] lg:text-[3.75rem]">{t.home.heroTitle}</h1>
            <p className="max-w-[34rem] text-[1.05rem] leading-relaxed text-ink-soft sm:text-lg">{t.home.heroText}</p>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
              <ButtonLink href={href("/catalog")} size="lg" icon="grid" className="w-full sm:w-auto">
                {t.home.catalogCta}
              </ButtonLink>
              <ButtonLink href={href("/pharmacies")} size="lg" variant="outline" icon="pin" className="w-full sm:w-auto">
                {t.home.heroNearest}
              </ButtonLink>
            </div>
            <HeroStats
              className="mt-1 w-full max-w-xl sm:mt-3"
              locale={numberLocale}
              stats={[
                { term: t.common.pharmacies, value: pharmacies.length, caption: t.home.heroPoints },
                { term: t.common.about, value: settings.company.foundedYear, grouping: false, caption: t.home.heroSince },
                { term: "GPP", value: "GPP", caption: t.home.heroGpp },
              ]}
            />
          </div>
          {/* The SALAMAT mark: large on wide screens, a compact composition above the text on phones and tablets. */}
          <div className="sal-hero-visual relative order-first mx-auto w-full max-w-[11.5rem] sm:max-w-[14rem] md:order-none md:max-w-[17rem] lg:max-w-[34rem] lg:justify-self-center">
            <HeroVisual className="w-full">
              <div className="absolute top-[11%] -left-[6%] hidden max-w-[16rem] items-center gap-3 rounded-[var(--radius-lg)] bg-white/95 px-4 py-3 shadow-[var(--shadow-pop)] backdrop-blur lg:flex">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
                  <Icon name="pin" size={20} />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs text-muted">{selected ? t.header.yourPharmacy : t.header.cityAstana}</span>
                  <span className="block truncate text-sm font-semibold">{selected ? selected.address : fmt(t.pharmacy.count, { count: pharmacies.length })}</span>
                </span>
              </div>
              <div className="absolute -right-[22%] bottom-[6%] flex items-center gap-2 rounded-full bg-white/95 py-1.5 pr-3 pl-1.5 shadow-[var(--shadow-pop)] backdrop-blur md:right-[-2%] md:bottom-[-4%] lg:right-[-4%] lg:bottom-[13%] lg:gap-3 lg:rounded-[var(--radius-lg)] lg:px-4 lg:py-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-50 text-accent-600 lg:size-10">
                  <Icon name={store.orderingEnabled ? "store" : "phone"} size={18} />
                </span>
                <span className="text-xs font-semibold whitespace-nowrap lg:text-sm">{store.orderingEnabled ? t.checkout.pickup : t.items.ask}</span>
              </div>
            </HeroVisual>
          </div>
        </div>
      </section>

      {/* Catalogue: a few real products (stable order, not "popular") and the way into the full catalogue. */}
      <section aria-labelledby="h-cat" className="container-page py-12 md:py-16">
        <div data-home-reveal className="mb-6 flex flex-col gap-5 md:mb-8 md:flex-row md:items-end md:justify-between md:gap-10">
          <div className="min-w-0">
            {store.catalogTotal ? (
              <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-800">
                <Icon name="box" size={16} />
                {fmt(t.home.catalogCount, { count: store.catalogTotal.toLocaleString(numberLocale) })}
              </p>
            ) : null}
            <h2 id="h-cat" className="text-[1.6rem] leading-tight font-bold tracking-tight text-ink sm:text-[2rem]">
              {t.home.catalogTitle}
            </h2>
            <p className="mt-2 max-w-xl text-[0.98rem] text-muted">{t.home.catalogText}</p>
          </div>
          <div className="w-full md:max-w-md lg:max-w-lg">
            <CatalogSearchForm action={href("/catalog")} q="" />
          </div>
        </div>
        {/* Up to 12 real products in a swipeable row; the buttons appear only when something is hidden. */}
        {preview.length ? (
          <div data-home-reveal>
            <ProductCarousel
              label={t.home.carouselLabel}
              prevLabel={t.home.carouselPrev}
              nextLabel={t.home.carouselNext}
              action={
                <ButtonLink href={href("/catalog")} size="lg" iconRight="chevronRight" className="w-full sm:w-auto sm:min-w-64">
                  {t.request.viewAll}
                </ButtonLink>
              }
            >
              {preview.map((item, i) => (
                <li key={item.id} className={CAROUSEL_ITEM}>
                  <CatalogItemCard item={item} t={t} locale={locale} priority={i < 2} />
                </li>
              ))}
            </ProductCarousel>
          </div>
        ) : (
          <>
            <p data-home-reveal className="rounded-[var(--radius-xl)] border border-dashed border-line-strong bg-surface/60 px-5 py-8 text-center text-muted">
              {t.request.catalogEmpty}
            </p>
            <div className="mt-6 flex justify-center">
              <ButtonLink href={href("/catalog")} size="lg" iconRight="chevronRight" className="w-full sm:w-auto sm:min-w-64">
                {t.request.viewAll}
              </ButtonLink>
            </div>
          </>
        )}
      </section>

      {/* Category navigation only for sections that really contain products. */}
      {roots.length ? (
        <section aria-labelledby="h-sections" className="container-page pb-12 md:pb-16">
          <SectionTitle
            id="h-sections"
            title={t.home.categoriesTitle}
            action={
              <Link href={href("/catalog")} className="hidden items-center gap-1 text-sm font-semibold text-brand-700 hover:underline sm:inline-flex">
                {t.catalog.allCategories}
                <Icon name="chevronRight" size={16} />
              </Link>
            }
          />
          <ul className="sal-home-grid grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {roots.map((c) => (
              <li key={c.slug} data-home-reveal>
                <CategoryTile slug={c.slug} name={c.name} iconKey={c.iconKey} locale={locale} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Promotions: only confirmed, active ones; the block is hidden when there are none. */}
      {promotions.length ? (
        <section aria-labelledby="h-promo" className="container-page pb-12 md:pb-16">
          <SectionTitle
            id="h-promo"
            title={t.home.promotionsTitle}
            action={
              <Link href={href("/promotions")} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
                {t.common.showAll}
                <Icon name="chevronRight" size={16} />
              </Link>
            }
          />
          <ul className="sal-home-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {promotions.slice(0, 3).map((p) => (
              <li key={p.slug} data-home-reveal>
                <PromotionCard p={p} t={t} locale={locale} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Editorial picks: only products explicitly chosen by staff. */}
      {featured.length ? (
        <section aria-labelledby="h-feat" className="container-page pb-12 md:pb-16">
          <SectionTitle id="h-feat" title={t.home.featuredTitle} text={t.home.featuredNote} />
          <ProductGrid items={featured} t={t} locale={locale} pharmacyPhone={selected?.phones[0]} />
        </section>
      ) : null}

      {/* How it works */}
      <section aria-labelledby="h-how" className="bg-surface py-12 md:py-16">
        <div className="container-page">
          <SectionTitle id="h-how" title={t.home.howTitle} />
          {/* Information cards (not links): hover lift and a calm reaction of the number and icon (.sal-step). */}
          <ol className="sal-steps sal-home-grid grid gap-4 lg:grid-cols-3 lg:gap-5">
            {[
              { n: 1, title: t.home.how1Title, text: t.home.how1Text, icon: "search" as const },
              { n: 2, title: t.home.how2Title, text: t.home.how2Text, icon: "cart" as const },
              { n: 3, title: t.home.how3Title, text: t.home.how3Text, icon: "phone" as const },
            ].map((s) => (
              <li key={s.n} data-home-reveal className="sal-step relative flex gap-4 overflow-hidden rounded-[var(--radius-xl)] border border-line/70 bg-white p-5 shadow-[var(--shadow-card)] sm:p-6">
                <span className="sal-step-num relative z-[1] grid size-12 shrink-0 place-items-center rounded-full bg-brand-600 text-lg font-bold text-white tabular-nums">{s.n}</span>
                <span className="relative z-[1] min-w-0 pr-8">
                  <span className="block text-[1.05rem] font-semibold text-ink">{s.title}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-muted">{s.text}</span>
                </span>
                <span className="sal-step-icon absolute top-4 right-4 grid size-9 place-items-center rounded-full bg-brand-50 text-brand-600" aria-hidden="true">
                  <Icon name={s.icon} size={18} />
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Pharmacies */}
      <section aria-labelledby="h-ph" className="container-page py-12 md:py-16">
        <SectionTitle
          id="h-ph"
          title={t.home.pharmaciesTitle}
          action={
            <Link href={href("/pharmacies")} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
              {t.home.pharmaciesAll} ({pharmacies.length})
              <Icon name="chevronRight" size={16} />
            </Link>
          }
        />
        <ul className="sal-home-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shownPharmacies.map((p) => (
            <li key={p.id} data-home-reveal>
              <PharmacyCard p={p} t={t} locale={locale} selected={selected?.id === p.id} routes={routeLinks(p)} />
            </li>
          ))}
        </ul>
      </section>

      {/* About + help */}
      <section className="container-page grid gap-4 pb-4 lg:grid-cols-[1.4fr_1fr]">
        <div aria-labelledby="h-about" data-home-reveal className="relative overflow-hidden rounded-[var(--radius-2xl)] bg-brand-800 p-6 text-white sm:p-10">
          <svg className="absolute -top-16 -right-16 h-72 w-72 text-white/10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
            <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z" />
          </svg>
          <h2 id="h-about" className="relative text-2xl font-bold">{t.home.aboutTitle}</h2>
          <p className="relative mt-3 max-w-2xl text-white/85">{t.home.aboutText}</p>
          <Link href={href("/about")} className="relative mt-6 inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] bg-white px-4 font-semibold text-brand-800 hover:bg-brand-50">
            {t.common.more}
            <Icon name="chevronRight" size={18} />
          </Link>
        </div>
        <div aria-labelledby="h-help" data-home-reveal className="flex flex-col justify-between gap-6 rounded-[var(--radius-2xl)] border border-line bg-white p-6 sm:p-8">
          <div>
            <h2 id="h-help" className="text-2xl font-bold text-ink">{t.home.helpTitle}</h2>
            <p className="mt-2 text-muted">{t.home.helpText}</p>
          </div>
          <div className="flex flex-col gap-3">
            <a href={telHref(settings.helpline.phone)} className="flex items-center gap-3 rounded-[var(--radius-lg)] bg-brand-50 p-4 text-brand-800 hover:bg-brand-100">
              <Icon name="phone" />
              <span>
                <span className="block text-xs">{t.common.helpline}</span>
                <span className="block text-lg font-bold">{formatPhone(settings.helpline.phone)}</span>
              </span>
            </a>
            <Link href={href("/help")} className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">
              {t.home.faqLink}
              <Icon name="chevronRight" size={16} />
            </Link>
          </div>
        </div>
      </section>
      <p className="sr-only">{fmt(t.pharmacy.count, { count: pharmacies.length })}</p>
    </HomeScrollMotion>
  );
}
