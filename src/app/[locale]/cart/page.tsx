import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/server/seo";
import { getStorefrontState } from "@/server/storefront";
import { OrderingUnavailable } from "@/components/checkout/OrderingUnavailable";
import { CartView } from "@/components/checkout/CartView";

export async function generateMetadata({ params }: PageProps<"/[locale]/cart">) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return pageMetadata(locale, "/cart", getDictionary(locale).meta.cartTitle, null, { noindex: true });
}

export default async function Page({ params }: PageProps<"/[locale]/cart">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const store = await getStorefrontState();
  if (!store.orderingEnabled) {
    const t = getDictionary(locale);
    return <OrderingUnavailable t={t} locale={locale} title={t.meta.cartTitle} />;
  }
  return <CartView />;
}
