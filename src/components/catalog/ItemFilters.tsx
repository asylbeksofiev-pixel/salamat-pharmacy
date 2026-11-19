"use client";
// Filters and sorting for the catalogue (public.pharmacy_products). The state lives in the URL:
// without JavaScript these are plain GET forms; with JavaScript, desktop checkboxes apply at once and the phone
// drawer keeps a draft until "Apply". Any change resets the page to 1; search text and sort are kept.
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { catalogQueryString, type CatalogQuery, type CatalogSort } from "@/lib/catalog-params";
import { Drawer } from "../ui/Dialog";
import { Icon } from "../icons";
import { cn } from "../ui/cn";
import { useSite } from "../site/SiteProvider";

export interface SectionOption {
  slug: string;
  name: string;
  count: number;
  /** Count formatted on the server for the page language (same text on server and client). */
  countLabel: string;
}

export interface FilterProps {
  basePath: string;
  query: CatalogQuery;
  /** "multi": checkboxes (catalogue, search); "links": the page is one section, options switch section. */
  sectionMode: "multi" | "links";
  sections: SectionOption[];
  /** For sectionMode "links": section pages are `${base}/${slug}${search}`, "all sections" is `${all}${search}`. */
  sectionLinks?: { base: string; all: string; search: string };
  currentSection?: string | null;
  pricesAvailable: boolean;
  /** Price range in the catalogue, with labels formatted on the server. */
  priceRange: { min: number; max: number; minLabel: string; maxLabel: string } | null;
  activeCount: number;
  /** Which part this instance renders: the desktop sidebar or the phone button + drawer. */
  variant: "sidebar" | "drawer";
}

interface Draft {
  categories: string[];
  priceMin: string;
  priceMax: string;
  hasPrice: boolean;
  hasPhoto: boolean;
}

const draftFrom = (q: CatalogQuery): Draft => ({
  categories: q.categories,
  priceMin: q.priceMin?.toString() ?? "",
  priceMax: q.priceMax?.toString() ?? "",
  hasPrice: q.hasPrice,
  hasPhoto: q.hasPhoto,
});

const toNumber = (s: string) => (/^\d{1,9}$/.test(s.replace(/\s/g, "")) ? Number(s.replace(/\s/g, "")) : undefined);

function queryFrom(base: CatalogQuery, d: Draft): CatalogQuery {
  return { ...base, categories: d.categories, priceMin: toNumber(d.priceMin), priceMax: toNumber(d.priceMax), hasPrice: d.hasPrice, hasPhoto: d.hasPhoto, page: 1 };
}

const BOX = "size-5 shrink-0 cursor-pointer rounded-[5px] accent-brand-600 disabled:cursor-not-allowed";
const ROW = "flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--radius-md)] px-2 text-[0.95rem] hover:bg-surface has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-brand-600";

function Fields({ props, draft, setDraft, idp, onInstant }: { props: FilterProps; draft: Draft; setDraft: (d: Draft) => void; idp: string; onInstant?: (d: Draft) => void }) {
  const { t } = useSite();
  const update = (patch: Partial<Draft>, instant = false) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (instant) onInstant?.(next);
  };
  const priceBad = (draft.priceMin !== "" && toNumber(draft.priceMin) === undefined) || (draft.priceMax !== "" && toNumber(draft.priceMax) === undefined);
  return (
    <div className="flex flex-col gap-6">
      {props.query.q ? <input type="hidden" name="q" value={props.query.q} /> : null}
      {props.query.sort ? <input type="hidden" name="sort" value={props.query.sort} /> : null}

      {props.sections.length ? (
        <fieldset>
          <legend className="mb-1.5 font-semibold text-ink">{t.catalog.sections}</legend>
          {props.sectionMode === "links" && props.sectionLinks ? (
            <ul className="flex flex-col">
              <li>
                <a href={`${props.sectionLinks.all}${props.sectionLinks.search}`} className={cn(ROW, "text-brand-700")}>
                  <Icon name="chevronLeft" size={16} />
                  {t.catalog.allSections}
                </a>
              </li>
              {props.sections.map((s) => (
                <li key={s.slug}>
                  <a href={`${props.sectionLinks!.base}/${s.slug}${props.sectionLinks!.search}`} aria-current={s.slug === props.currentSection ? "page" : undefined} className={cn(ROW, s.slug === props.currentSection && "bg-brand-50 font-semibold text-brand-800")}>
                    <span className="min-w-0 flex-1">{s.name}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="flex flex-col">
              {props.sections.map((s) => {
                const checked = draft.categories.includes(s.slug);
                return (
                  <li key={s.slug}>
                    <label className={ROW}>
                      <input
                        type="checkbox"
                        name="category"
                        value={s.slug}
                        checked={checked}
                        disabled={!checked && s.count === 0}
                        onChange={(e) => update({ categories: e.target.checked ? [...draft.categories, s.slug] : draft.categories.filter((c) => c !== s.slug) }, true)}
                        className={BOX}
                      />
                      <span className="min-w-0 flex-1">{s.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>
      ) : null}

      <fieldset aria-describedby={`${idp}-price-note`}>
        <legend className="mb-1.5 font-semibold text-ink">{t.catalog.price}</legend>
        <div className="flex items-center gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">
              {t.catalog.price} {t.catalog.priceFrom}
            </span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              name="priceMin"
              value={draft.priceMin}
              disabled={!props.pricesAvailable}
              placeholder={props.priceRange ? `${t.catalog.priceFrom} ${props.priceRange.minLabel}` : t.catalog.priceFrom}
              onChange={(e) => update({ priceMin: e.target.value.replace(/[^\d\s]/g, "") })}
              className="h-11 w-full rounded-[var(--radius-md)] border border-line-strong bg-white px-3 tabular-nums placeholder:text-muted/80 focus:border-brand-600 focus:outline-3 focus:outline-brand-600/25 disabled:bg-surface"
            />
          </label>
          <span className="text-muted" aria-hidden="true">
            —
          </span>
          <label className="min-w-0 flex-1">
            <span className="sr-only">
              {t.catalog.price} {t.catalog.priceTo}
            </span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              name="priceMax"
              value={draft.priceMax}
              disabled={!props.pricesAvailable}
              placeholder={props.priceRange ? `${t.catalog.priceTo} ${props.priceRange.maxLabel}` : t.catalog.priceTo}
              onChange={(e) => update({ priceMax: e.target.value.replace(/[^\d\s]/g, "") })}
              className="h-11 w-full rounded-[var(--radius-md)] border border-line-strong bg-white px-3 tabular-nums placeholder:text-muted/80 focus:border-brand-600 focus:outline-3 focus:outline-brand-600/25 disabled:bg-surface"
            />
          </label>
        </div>
        <p id={`${idp}-price-note`} className={cn("mt-1.5 text-xs", priceBad ? "text-accent-700" : "text-muted")} aria-live="polite">
          {priceBad ? t.catalog.priceInvalid : props.pricesAvailable ? t.catalog.priceSource : t.catalog.pricesPending}
        </p>
      </fieldset>

      <fieldset>
        <legend className="sr-only">{t.catalog.filters}</legend>
        <label className={ROW}>
          <input type="checkbox" name="hasPrice" value="1" checked={draft.hasPrice} disabled={!props.pricesAvailable && !draft.hasPrice} onChange={(e) => update({ hasPrice: e.target.checked }, true)} className={BOX} />
          {t.catalog.withPrice}
        </label>
        <label className={ROW}>
          <input type="checkbox" name="hasPhoto" value="1" checked={draft.hasPhoto} onChange={(e) => update({ hasPhoto: e.target.checked }, true)} className={BOX} />
          {t.catalog.withPhoto}
        </label>
      </fieldset>
    </div>
  );
}

/** Desktop sidebar + phone "Filters" button with a bottom drawer. */
export function ItemFilters(props: FilterProps) {
  const { t } = useSite();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  // Draft follows the applied URL state; it is reset whenever the applied filters change.
  const applied = JSON.stringify(draftFrom(props.query));
  const [draft, setDraft] = useState<Draft>(() => draftFrom(props.query));
  const [seen, setSeen] = useState(applied);
  if (seen !== applied) {
    setSeen(applied);
    setDraft(draftFrom(props.query));
  }

  const go = (d: Draft) => start(() => router.push(`${props.basePath}${catalogQueryString(queryFrom(props.query, d))}`, { scroll: false }));
  const reset: Draft = { categories: [], priceMin: "", priceMax: "", hasPrice: false, hasPhoto: false };
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    go(draft);
    setOpen(false);
  };

  if (props.variant === "sidebar") {
    return (
      <form method="get" action={props.basePath} onSubmit={submit} aria-busy={pending || undefined}>
        <h2 className="sr-only">{t.catalog.filters}</h2>
        <Fields props={props} draft={draft} setDraft={setDraft} idp="side" onInstant={go} />
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button type="submit" className="press h-11 rounded-[var(--radius-md)] bg-brand-600 px-4 font-semibold text-white hover:bg-brand-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
            {t.catalog.applyButton}
          </button>
          {props.activeCount ? (
            <button type="button" onClick={() => go(reset)} className="h-11 rounded-[var(--radius-md)] px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-3 focus-visible:outline-brand-600">
              {t.catalog.resetFilters}
            </button>
          ) : null}
        </div>
      </form>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="press inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] border border-line-strong bg-white px-4 font-semibold text-ink hover:border-brand-600 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        aria-haspopup="dialog"
      >
        <Icon name="filter" size={18} className="text-brand-600" />
        {t.catalog.filtersButton}
        {props.activeCount ? <span className="grid min-w-6 place-items-center rounded-full bg-brand-600 px-1.5 text-xs leading-6 font-bold text-white">{props.activeCount}</span> : null}
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={t.catalog.filters}
        closeLabel={t.common.close}
        side="bottom"
        footer={
          <div className="flex gap-2">
            <button type="button" onClick={() => setDraft(reset)} className="h-12 flex-1 rounded-[var(--radius-md)] border border-line-strong font-semibold text-ink hover:border-brand-600 focus-visible:outline-3 focus-visible:outline-brand-600">
              {t.catalog.resetButton}
            </button>
            <button type="submit" form="filters-drawer" className="press h-12 flex-[2] rounded-[var(--radius-md)] bg-brand-600 font-semibold text-white hover:bg-brand-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
              {t.catalog.applyButton}
            </button>
          </div>
        }
      >
        <form id="filters-drawer" method="get" action={props.basePath} onSubmit={submit}>
          <Fields props={props} draft={draft} setDraft={setDraft} idp="drawer" />
        </form>
      </Drawer>
    </>
  );
}

export interface SortOption {
  value: CatalogSort;
  label: string;
  disabled?: boolean;
  hint?: string;
}

/** Sort: a select on wide screens, a drawer with large options on phones. */
export function ItemSort({ basePath, query, options, current }: { basePath: string; query: CatalogQuery; options: SortOption[]; current: CatalogSort }) {
  const { t } = useSite();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const go = (sort: CatalogSort) => start(() => router.push(`${basePath}${catalogQueryString({ ...query, sort, page: 1 })}`, { scroll: false }));
  const currentLabel = options.find((o) => o.value === current)?.label ?? "";
  return (
    <>
      <form method="get" action={basePath} className="hidden items-center gap-2 lg:flex">
        {query.q ? <input type="hidden" name="q" value={query.q} /> : null}
        {query.categories.map((c) => (
          <input key={c} type="hidden" name="category" value={c} />
        ))}
        {query.priceMin !== undefined ? <input type="hidden" name="priceMin" value={query.priceMin} /> : null}
        {query.priceMax !== undefined ? <input type="hidden" name="priceMax" value={query.priceMax} /> : null}
        {query.hasPrice ? <input type="hidden" name="hasPrice" value="1" /> : null}
        {query.hasPhoto ? <input type="hidden" name="hasPhoto" value="1" /> : null}
        <label htmlFor="catalog-sort" className="text-sm text-muted">
          {t.catalog.sort}
        </label>
        <div className="relative">
          <select
            id="catalog-sort"
            name="sort"
            value={current}
            onChange={(e) => go(e.currentTarget.value as CatalogSort)}
            className="h-11 appearance-none rounded-[var(--radius-md)] border border-line-strong bg-white pr-10 pl-3 font-medium text-ink hover:border-brand-600 focus:border-brand-600 focus:outline-3 focus:outline-brand-600/25"
          >
            {options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.disabled ? `${o.label} — ${t.catalog.sortUnavailable}` : o.label}
              </option>
            ))}
          </select>
          <Icon name="chevronDown" size={18} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" />
        </div>
        <noscript>
          <button type="submit" className="h-11 rounded-[var(--radius-md)] border border-line-strong px-3 font-semibold">
            {t.catalog.applyButton}
          </button>
        </noscript>
      </form>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="press inline-flex h-11 min-w-0 items-center gap-2 rounded-[var(--radius-md)] border border-line-strong bg-white px-4 font-semibold text-ink hover:border-brand-600 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-600 lg:hidden"
        aria-haspopup="dialog"
      >
        <Icon name="sort" size={18} className="shrink-0 text-brand-600" />
        <span className="truncate">{t.catalog.sortButton}</span>
        <span className="sr-only">: {currentLabel}</span>
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title={t.catalog.sort} closeLabel={t.common.close} side="bottom">
        <ul className="flex flex-col gap-1" role="list">
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                disabled={o.disabled}
                aria-pressed={o.value === current}
                onClick={() => {
                  setOpen(false);
                  if (o.value !== current) go(o.value);
                }}
                className={cn(
                  "flex min-h-12 w-full items-center justify-between gap-3 rounded-[var(--radius-md)] px-3 py-2 text-left focus-visible:outline-3 focus-visible:outline-brand-600 disabled:cursor-not-allowed",
                  o.value === current ? "bg-brand-50 font-semibold text-brand-800" : "hover:bg-surface",
                  o.disabled && "text-muted",
                )}
              >
                <span className="min-w-0">
                  <span className="block">{o.label}</span>
                  {o.disabled && o.hint ? <span className="mt-0.5 block text-xs text-muted">{o.hint}</span> : null}
                </span>
                {o.value === current ? <Icon name="check" size={18} className="shrink-0 text-brand-700" /> : null}
              </button>
            </li>
          ))}
        </ul>
      </Drawer>
    </>
  );
}

