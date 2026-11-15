import "@fontsource-variable/onest";
import "../globals.css";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { getDictionary, isLocale, localeTags, locales, type Locale } from "@/lib/i18n";
import { getCategoryTree } from "@/server/catalog";
import { getPharmacies, getSelectedPharmacy } from "@/server/pharmacies";
import { getSettings } from "@/server/settings";
import { env } from "@/server/env";
import { prisma } from "@/server/db";
import { SiteProvider, type PickerPharmacy } from "@/components/site/SiteProvider";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { MobileBottomNav } from "@/components/site/HeaderParts";
import { Icon } from "@/components/icons";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return {
    metadataBase: new URL(env.appUrl),
    title: { default: t.meta.defaultTitle, template: `%s — SALAMAT` },
    description: t.meta.defaultDescription,
    applicationName: "SALAMAT",
    robots: env.allowIndexing ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      type: "website",
      siteName: t.meta.siteName,
      locale: localeTags[locale].replace("-", "_"),
      images: [{ url: "/brand/og-image.png", width: 1200, height: 630, alt: "SALAMAT" }],
    },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#007a3d",
  width: "device-width",
  initialScale: 1,
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const [tree, pharmacies, selected, settings, city] = await Promise.all([
    getCategoryTree(locale),
    getPharmacies(locale),
    getSelectedPharmacy(locale),
    getSettings(),
    prisma.city.findFirst({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const toPicker = (p: (typeof pharmacies)[number]): PickerPharmacy => ({
    id: p.id,
    slug: p.slug,
    address: p.address,
    phones: p.phones,
    open: p.openStatus ? p.openStatus.open : null,
    acceptsOrders: p.acceptsOrders,
  });
  const categories = tree.roots.map((c) => ({ slug: c.slug, name: c.name, iconKey: c.iconKey, children: c.children.map((x) => ({ slug: x.slug, name: x.name })) }));
  const cityName = city ? (locale === "kk" ? (city.nameKk ?? city.nameRu) : city.nameRu) : t.header.cityAstana;

  return (
    <html lang={localeTags[locale]} className="h-full">
      <body className="flex min-h-full flex-col">
        <a href="#main" className="sr-only z-[100] rounded-md bg-brand-700 px-4 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
          {t.common.skipToContent}
        </a>
        <SiteProvider
          locale={locale}
          t={t}
          pharmacy={selected ? toPicker(selected) : null}
          pharmacies={pharmacies.map(toPicker)}
          helpline={settings.helpline.phone}
          showDemo={env.showDemoData}
        >
          {env.showDemoData ? (
            <div className="bg-warn-50 text-warn-700">
              <p className="container-page flex items-start gap-2 py-2 text-sm font-medium">
                <Icon name="alert" size={18} className="mt-px shrink-0" />
                {t.common.demoBanner}
              </p>
            </div>
          ) : null}
          <Header locale={locale} t={t} categories={categories} helpline={settings.helpline.phone} cityName={cityName} />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer locale={locale} t={t} helpline={settings.helpline.phone} company={settings.company} categories={categories} />
          <MobileBottomNav />
        </SiteProvider>
      </body>
    </html>
  );
}
