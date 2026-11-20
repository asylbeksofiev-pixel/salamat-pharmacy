// Home page section "Offers and discounts". Banners come from src/config/promo-banners.ts (files in public/promo/).
// Banners are 16:9 (2:1 frame from 1024 px; an optional separate phone file); both go through next/image
// optimisation. The frame keeps its aspect ratio before the image loads, so nothing jumps.
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
  const common = { alt, sizes: "(min-width: 1320px) 1272px, 100vw" };
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
        return (
          <li key={b.id} role="group" aria-roledescription={t.home.promoSlideRole} className="w-full shrink-0 snap-start snap-always">
            {link ? (
              link.external ? (
                <a href={link.href} target="_blank" rel="noopener noreferrer" className="block focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-brand-600">
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
          </li>
        );
      })}
    </PromoCarousel>
  );
}
