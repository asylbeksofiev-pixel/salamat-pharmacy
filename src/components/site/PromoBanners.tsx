// Home page section "Offers and discounts". Banners come from src/config/promo-banners.ts (files in public/promo/).
// Banners are 16:9 (2:1 frame from 1024 px; an optional separate phone file); both go through next/image
// optimisation. The frame keeps its aspect ratio before the image loads, so nothing jumps.
// A banner may carry a caption (title, text, button) over the empty part of the picture, in every language.
// Without banners the section shows a neutral placeholder that links to the promotions page — no invented offers.
import Link from "next/link";
import { getImageProps } from "next/image";
import type { Dictionary, Locale } from "@/lib/i18n";
import { dataLang, localizedPath } from "@/lib/i18n/config";
import { bannerSrc, PROMO_BANNER_SIZE, type PromoBanner } from "@/config/promo-banners";
import { PromoCarousel } from "./PromoCarousel";
import { Icon } from "../icons";

function BannerPicture({ banner, locale, first }: { banner: PromoBanner; locale: Locale; first: boolean }) {
  const alt = banner.alt[locale];
  const common = { alt, sizes: "(min-width: 1320px) 1272px, 100vw", quality: 90 };
  const {
    props: { srcSet: desktop },
  } = getImageProps({ ...common, ...PROMO_BANNER_SIZE.desktop, src: bannerSrc(banner.desktop, locale) });
  const {
    props: { srcSet: mobile, ...img },
  } = getImageProps({ ...common, ...PROMO_BANNER_SIZE.mobile, src: bannerSrc(banner.mobile, locale), loading: first ? "eager" : "lazy" });
  return (
    <picture>
      <source media="(min-width: 1024px)" srcSet={desktop} sizes={common.sizes} />
      {/* eslint-disable-next-line jsx-a11y/alt-text -- art direction via getImageProps (optimised srcSet); alt is in the props */}
      <img {...img} srcSet={mobile} draggable={false} className="absolute inset-0 size-full object-cover" lang={dataLang(locale, alt)} />
    </picture>
  );
}

function bannerHref(href: string, locale: Locale): { href: string; external: boolean } {
  if (/^https?:\/\//i.test(href)) return { href, external: true };
  return { href: localizedPath(locale, href), external: false };
}

export function PromoBanners({ banners, t, locale }: { banners: PromoBanner[]; t: Dictionary; locale: Locale }) {
  if (!banners.length) {
    return (
      <div className="relative overflow-hidden rounded-[var(--radius-2xl)] border border-brand-100 bg-[radial-gradient(90%_120%_at_100%_0%,var(--color-brand-100)_0%,transparent_60%),var(--color-brand-50)] px-5 py-7 sm:px-8 sm:py-9">
        <span className="absolute -right-6 -bottom-8 text-brand-200/70" aria-hidden="true">
          <Icon name="tag" size={160} />
        </span>
        <div className="relative flex max-w-xl flex-col items-start gap-3">
          <span className="grid size-11 place-items-center rounded-full bg-white text-brand-700 shadow-[var(--shadow-card)]">
            <Icon name="gift" size={22} />
          </span>
          <p className="text-xl font-bold text-ink sm:text-2xl">{t.home.promoEmptyTitle}</p>
          <p className="text-ink-soft">{t.home.promoEmptyText}</p>
          <Link href={localizedPath(locale, "/promotions")} className="mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-md)] bg-white px-4 font-semibold text-brand-800 shadow-[var(--shadow-card)] hover:bg-brand-100">
            {t.home.promoEmptyCta}
            <Icon name="chevronRight" size={18} />
          </Link>
        </div>
      </div>
    );
  }
  return (
    <PromoCarousel id="promo-track">
      {banners.map((b, i) => {
        const frame = (
          <span className="relative block aspect-[16/9] w-full overflow-hidden bg-surface lg:aspect-[2/1]">
            <BannerPicture banner={b} locale={locale} first={i === 0} />
          </span>
        );
        const link = b.href ? bannerHref(b.href, locale) : null;
        const external = link?.external ? { target: "_blank", rel: "noopener noreferrer" } : {};
        const slide = "relative flex w-full shrink-0 snap-start snap-always flex-col bg-white md:block";
        // With a caption: title, text and one button over the empty left part of the picture (below it on phones).
        // The button's link covers the whole slide, so the picture is clickable too, with a single tab stop.
        if (b.caption && link) {
          const c = b.caption;
          const title = c.title[locale];
          return (
            <div key={b.id} role="group" aria-roledescription={t.home.promoSlideRole} className={slide}>
              {frame}
              <div className="flex flex-1 flex-col items-start gap-2 px-5 pt-4 pb-5 md:pointer-events-none md:absolute md:inset-y-0 md:left-0 md:w-[46%] md:justify-center md:bg-[linear-gradient(90deg,rgb(255_255_255/0.75),rgb(255_255_255/0.45)_70%,transparent)] md:py-6 md:pr-4 md:pl-[5%] lg:gap-3">
                <h3 className="text-xl leading-tight font-bold tracking-tight text-balance text-brand-900 md:text-2xl lg:text-[2.1rem] xl:text-[2.5rem]" lang={dataLang(locale, title)}>
                  {title}
                </h3>
                {c.text ? <p className="max-w-md text-sm leading-relaxed text-ink-soft lg:text-base">{c.text[locale]}</p> : null}
                {link.external ? (
                  <a href={link.href} {...external} className={CTA}>
                    {c.cta[locale]}
                    <Icon name="chevronRight" size={18} />
                  </a>
                ) : (
                  <Link href={link.href} className={CTA}>
                    {c.cta[locale]}
                    <Icon name="chevronRight" size={18} />
                  </Link>
                )}
              </div>
            </div>
          );
        }
        return (
          <div key={b.id} role="group" aria-roledescription={t.home.promoSlideRole} className={slide}>
            {link ? (
              link.external ? (
                <a href={link.href} {...external} className="block focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-brand-600">
                  {frame}
                </a>
              ) : (
                <Link href={link.href} className="block focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-brand-600">
                  {frame}
                </Link>
              )
            ) : (
              frame
            )}
          </div>
        );
      })}
    </PromoCarousel>
  );
}

const CTA =
  "pointer-events-auto mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-md)] bg-brand-600 px-5 font-semibold text-white transition-colors " +
  "after:absolute after:inset-0 after:content-[''] hover:bg-brand-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-600";
