import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/server/seo";
import { CheckoutView } from "@/components/checkout/CheckoutView";

export async function generateMetadata({ params }: PageProps<"/[locale]/checkout">) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return pageMetadata(locale, "/checkout", getDictionary(locale).meta.checkoutTitle, null, { noindex: true });
}

export default async function Page({ params }: PageProps<"/[locale]/checkout">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <CheckoutView />;
}
