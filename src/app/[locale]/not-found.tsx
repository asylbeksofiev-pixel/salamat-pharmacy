import { headers } from "next/headers";
import { getDictionary, isLocale, localizedPath } from "@/lib/i18n";
import { EmptyState } from "@/components/ui/Feedback";
import { ButtonLink } from "@/components/ui/Button";

export default async function NotFound() {
  const h = await headers();
  const fromProxy = h.get("x-salamat-locale");
  const locale = isLocale(fromProxy) ? fromProxy : "ru";
  const t = getDictionary(locale);
  return (
    <div className="container-page py-16">
      <EmptyState
        icon="search"
        title={t.errors.notFoundTitle}
        text={t.errors.notFoundText}
        action={
          <>
            <ButtonLink href={localizedPath(locale, "/catalog")}>{t.common.catalog}</ButtonLink>
            <ButtonLink href={localizedPath(locale, "/")} variant="outline">
              {t.common.home}
            </ButtonLink>
          </>
        }
      />
    </div>
  );
}
