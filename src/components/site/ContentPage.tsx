import type { Dictionary, Locale } from "@/lib/i18n";
import { fmt, localizedPath } from "@/lib/i18n/config";
import { formatDate } from "@/lib/format";
import type { PageView } from "@/server/content";
import { env } from "@/server/env";
import { Breadcrumbs } from "../ui/Breadcrumbs";
import { Notice } from "../ui/Feedback";
import { Markdown } from "./Markdown";

export function ContentPageView({ page, t, locale, children, aside }: { page: PageView; t: Dictionary; locale: Locale; children?: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="container-page py-6 md:py-8">
      <Breadcrumbs items={[{ label: t.common.home, href: localizedPath(locale, "/") }, { label: page.title }]} label={t.common.breadcrumbs} baseUrl={env.appUrl} />
      <div className={aside ? "mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]" : "mt-6"}>
        <article>
          <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight sm:text-[2.25rem]">{page.title}</h1>
          <div className="mt-4 flex flex-col gap-3">
            {page.requiresLegalReview ? <Notice tone="warning">{t.pages.legalReview}</Notice> : null}
            {!page.translated ? <Notice tone="info" icon="globe"><span lang="ru">{t.pages.notTranslated}</span></Notice> : null}
          </div>
          <div className="mt-4" lang={page.translated ? undefined : "ru"}>
            <Markdown>{page.body}</Markdown>
          </div>
          {children}
          <p className="mt-8 text-sm text-muted">{fmt(t.pages.lastUpdated, { date: formatDate(page.updatedAt, locale) })}</p>
        </article>
        {aside ? <aside>{aside}</aside> : null}
      </div>
    </div>
  );
}
