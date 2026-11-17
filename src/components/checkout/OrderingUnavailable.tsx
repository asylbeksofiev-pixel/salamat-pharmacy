// Shown on /cart and /checkout while no product has a confirmed price: online requests cannot work honestly.
import type { Dictionary, Locale } from "@/lib/i18n";
import { localizedPath } from "@/lib/i18n/config";
import { EmptyState } from "../ui/Feedback";
import { ButtonLink } from "../ui/Button";

export function OrderingUnavailable({ t, locale, title }: { t: Dictionary; locale: Locale; title: string }) {
  const href = (p: string) => localizedPath(locale, p);
  return (
    <div className="container-page py-6 md:py-10">
      <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight text-ink sm:text-[2.1rem]">{title}</h1>
      <EmptyState
        className="mt-6"
        icon="phone"
        title={t.cart.unavailableTitle}
        text={t.cart.unavailableText}
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <ButtonLink href={href("/catalog")}>{t.cart.toCatalog}</ButtonLink>
            <ButtonLink href={href("/pharmacies")} variant="outline" icon="pin">
              {t.common.pharmacies}
            </ButtonLink>
          </div>
        }
      />
    </div>
  );
}
