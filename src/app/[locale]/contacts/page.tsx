import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary, isLocale, localizedPath, pickLocalized } from "@/lib/i18n";
import { formatPhone, telHref } from "@/lib/format";
import { getPage } from "@/server/content";
import { getPharmacies } from "@/server/pharmacies";
import { getSettings } from "@/server/settings";
import { pageMetadata } from "@/server/seo";
import { ContentPageView } from "@/components/site/ContentPage";
import { Icon } from "@/components/icons";

export async function generateMetadata({ params }: PageProps<"/[locale]/contacts">) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const page = await getPage("contacts", locale);
  return pageMetadata(locale, "/contacts", page?.title ?? getDictionary(locale).meta.contactsTitle, page?.metaDescription);
}

export default async function ContactsPage({ params }: PageProps<"/[locale]/contacts">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const [page, pharmacies, settings] = await Promise.all([getPage("contacts", locale), getPharmacies(locale), getSettings()]);
  if (!page) notFound();
  const c = settings.company;
  return (
    <ContentPageView
      page={page}
      t={t}
      locale={locale}
      aside={
        <div className="flex flex-col gap-4">
          <section className="rounded-[var(--radius-xl)] bg-brand-50 p-5">
            <h2 className="text-sm font-semibold text-brand-800">{t.pages.contactsHelpline}</h2>
            <a href={telHref(settings.helpline.phone)} className="mt-1 flex items-center gap-2 text-2xl font-bold text-brand-800 hover:underline">
              <Icon name="phone" />
              {formatPhone(settings.helpline.phone)}
            </a>
            {settings.helpline.hoursRu ? <p className="mt-1 text-sm text-ink-soft">{pickLocalized(locale, settings.helpline.hoursRu, settings.helpline.hoursKk)}</p> : null}
          </section>
          <section className="rounded-[var(--radius-xl)] border border-line p-5 text-sm">
            <h2 className="mb-2 font-semibold">{t.pages.contactsCompany}</h2>
            <p className="font-medium">{c.legalName}</p>
            <p className="text-muted">{t.footer.binLabel} {c.bin.replace(/(\d{3})(?=\d)/g, "$1 ")}</p>
            <p className="mt-1 text-muted">{c.legalAddress}</p>
            {c.email ? <p className="mt-1"><a className="text-brand-700 hover:underline" href={`mailto:${c.email}`}>{c.email}</a></p> : null}
          </section>
        </div>
      }
    >
      <section className="mt-8">
        <h2 className="mb-3 text-xl font-semibold">{t.pages.contactsPharmacies}</h2>
        <ul className="divide-y divide-line rounded-[var(--radius-xl)] border border-line">
          {pharmacies.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <Link href={localizedPath(locale, `/pharmacies/${p.slug}`)} className="font-medium hover:text-brand-700 hover:underline">{p.address}</Link>
              <span className="flex flex-wrap gap-3">
                {p.phones.map((ph) => (
                  <a key={ph} href={telHref(ph)} className="text-sm font-semibold text-brand-700 hover:underline">{formatPhone(ph)}</a>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </ContentPageView>
  );
}
