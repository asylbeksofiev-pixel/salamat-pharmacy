import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { formatPhone, telHref } from "@/lib/format";
import { getFaq, getPage } from "@/server/content";
import { getSettings } from "@/server/settings";
import { pageMetadata } from "@/server/seo";
import { getStorefrontState } from "@/server/storefront";
import { ContentPageView } from "@/components/site/ContentPage";
import { Icon } from "@/components/icons";

export async function generateMetadata({ params }: PageProps<"/[locale]/help">) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const [page, store] = await Promise.all([getPage("help", locale), getStorefrontState()]);
  const t = getDictionary(locale);
  return pageMetadata(locale, "/help", page?.title ?? t.meta.helpTitle, store.pricesConfirmed ? page?.metaDescription : t.pages.helpCallDescription);
}

export default async function HelpPage({ params }: PageProps<"/[locale]/help">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const [page, dbFaq, settings, store] = await Promise.all([getPage("help", locale), getFaq(locale), getSettings(), getStorefrontState()]);
  if (!page) notFound();
  // The stored FAQ describes requests with prices on the site. Until prices are confirmed, show answers that
  // match the real flow — find the product, send a request "to be confirmed" or call the pharmacy.
  const faq = store.pricesConfirmed ? dbFaq : t.pages.callFaq.map((f, i) => ({ id: `call-${i}`, question: f.q, answer: f.a }));
  const jsonLd = faq.length
    ? { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })) }
    : null;
  return (
    <ContentPageView
      page={page}
      t={t}
      locale={locale}
      aside={
        <a href={telHref(settings.helpline.phone)} className="flex items-center gap-3 rounded-[var(--radius-xl)] bg-brand-50 p-5 text-brand-800 hover:bg-brand-100">
          <Icon name="phone" />
          <span>
            <span className="block text-sm">{t.common.helpline}</span>
            <span className="block text-xl font-bold">{formatPhone(settings.helpline.phone)}</span>
          </span>
        </a>
      }
    >
      <section className="mt-6">
        {faq.length ? (
          <ul className="flex flex-col gap-2">
            {faq.map((f) => (
              <li key={f.id}>
                <details className="group rounded-[var(--radius-lg)] border border-line bg-white open:border-brand-200 open:bg-brand-50/40">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold text-ink [&::-webkit-details-marker]:hidden">
                    {f.question}
                    <Icon name="chevronDown" size={20} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="px-5 pb-5 text-ink-soft">{f.answer}</p>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">{t.pages.faqEmpty}</p>
        )}
      </section>
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} /> : null}
    </ContentPageView>
  );
}
