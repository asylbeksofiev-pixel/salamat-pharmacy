"use client";
// Filters and sorting are plain GET forms (work without JavaScript). With JavaScript, changes apply instantly
// and the state is kept in the URL, so a filtered listing can be shared or reopened.
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import type { Facets, SortKey } from "@/server/catalog";
import type { CatalogFilters } from "@/server/catalog";
import { Drawer } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { Icon } from "../icons";
import { cn } from "../ui/cn";
import { useSite } from "../site/SiteProvider";

function toQuery(form: HTMLFormElement, extra: Record<string, string | undefined> = {}): string {
  const fd = new FormData(form);
  const p = new URLSearchParams();
  for (const [k, v] of fd.entries()) {
    const s = String(v).trim();
    if (s && k !== "page") p.append(k, s);
  }
  for (const [k, v] of Object.entries(extra)) {
    p.delete(k);
    if (v) p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

interface FilterProps {
  basePath: string;
  facets: Facets;
  filters: CatalogFilters;
  hasPharmacy: boolean;
  activeCount: number;
}

function FilterFields({ facets, filters, hasPharmacy, idp }: Omit<FilterProps, "basePath" | "activeCount"> & { idp: string }) {
  const { t } = useSite();
  const box = "size-5 shrink-0 cursor-pointer rounded-[5px] accent-brand-600";
  return (
    <div className="flex flex-col gap-6">
      {filters.q ? <input type="hidden" name="q" value={filters.q} /> : null}
      {filters.sort ? <input type="hidden" name="sort" value={filters.sort} /> : null}
      <fieldset>
        <legend className="mb-2 font-semibold text-ink">{t.catalog.inStock}</legend>
        <label className={cn("flex items-center gap-3 text-[0.95rem]", !hasPharmacy && "cursor-not-allowed opacity-60")}>
          <input type="checkbox" name="stock" value="1" defaultChecked={filters.inStock} disabled={!hasPharmacy} className={box} />
          {t.catalog.inStock}
        </label>
        {!hasPharmacy ? <p className="mt-1 text-xs text-muted">{t.catalog.inStockNeedsPharmacy}</p> : null}
      </fieldset>
      {facets.brands.length ? (
        <fieldset>
          <legend className="mb-2 font-semibold text-ink">{t.catalog.brand}</legend>
          <ul className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
            {facets.brands.map((b) => (
              <li key={b.slug}>
                <label className="flex cursor-pointer items-center gap-3 text-[0.95rem]">
                  <input type="checkbox" name="brand" value={b.slug} defaultChecked={filters.brands?.includes(b.slug)} className={box} />
                  <span className="min-w-0 flex-1 truncate">{b.name}</span>
                  <span className="text-xs text-muted">{b.count}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}
      {facets.forms.length ? (
        <fieldset>
          <legend className="mb-2 font-semibold text-ink">{t.catalog.form}</legend>
          <ul className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
            {facets.forms.map((f) => (
              <li key={f.value}>
                <label className="flex cursor-pointer items-center gap-3 text-[0.95rem]">
                  <input type="checkbox" name="form" value={f.value} defaultChecked={filters.forms?.includes(f.value)} className={box} />
                  <span className="min-w-0 flex-1 truncate first-letter:uppercase">{f.value}</span>
                  <span className="text-xs text-muted">{f.count}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}
      <fieldset>
        <legend className="mb-2 font-semibold text-ink">{t.catalog.price}</legend>
        {hasPharmacy ? (
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor={`${idp}-pmin`}>{t.catalog.priceFrom}</label>
            <input id={`${idp}-pmin`} name="pmin" type="number" inputMode="numeric" min={0} placeholder={facets.priceRange ? String(facets.priceRange.min) : t.catalog.priceFrom} defaultValue={filters.priceMin} className="h-11 w-full min-w-0 rounded-[var(--radius-md)] border border-line-strong px-3" />
            <span className="text-muted">—</span>
            <label className="sr-only" htmlFor={`${idp}-pmax`}>{t.catalog.priceTo}</label>
            <input id={`${idp}-pmax`} name="pmax" type="number" inputMode="numeric" min={0} placeholder={facets.priceRange ? String(facets.priceRange.max) : t.catalog.priceTo} defaultValue={filters.priceMax} className="h-11 w-full min-w-0 rounded-[var(--radius-md)] border border-line-strong px-3" />
          </div>
        ) : (
          <p className="text-sm text-muted">{t.catalog.priceNeedsPharmacy}</p>
        )}
      </fieldset>
      {facets.hasRxData ? (
        <fieldset>
          <legend className="mb-2 font-semibold text-ink">{t.catalog.prescription}</legend>
          <div className="flex flex-col gap-2">
            {[
              { v: "", l: t.catalog.any },
              { v: "otc", l: t.catalog.otcOnly },
              { v: "rx", l: t.catalog.rxOnly },
            ].map((o) => (
              <label key={o.v || "any"} className="flex cursor-pointer items-center gap-3 text-[0.95rem]">
                <input type="radio" name="rx" value={o.v} defaultChecked={(filters.rx ?? "") === o.v} className="size-5 accent-brand-600" />
                {o.l}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}

export function CatalogFiltersPanel({ basePath, facets, filters, hasPharmacy, activeCount, mode }: FilterProps & { mode: "sidebar" | "mobile" }) {
  const { t } = useSite();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const desktopForm = useRef<HTMLFormElement>(null);
  const resetHref = `${basePath}${filters.q ? `?q=${encodeURIComponent(filters.q)}` : ""}`;

  const apply = (form: HTMLFormElement) => start(() => router.push(`${basePath}${toQuery(form)}`, { scroll: false }));
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    apply(e.currentTarget);
    setOpen(false);
  };

  if (mode === "sidebar") return (
      <aside className="hidden lg:block" aria-label={t.catalog.filters}>
        <form ref={desktopForm} action={basePath} method="get" onSubmit={onSubmit} onChange={(e) => {
          if ((e.target as unknown as HTMLInputElement).type !== "number") apply(e.currentTarget);
        }}
        onBlur={(e) => {
          const el = e.target as unknown as HTMLInputElement;
          if (el.type === "number" && el.value !== el.defaultValue) apply(e.currentTarget);
        }} className={cn("sticky top-36 rounded-[var(--radius-xl)] border border-line bg-white p-5 transition-opacity", pending && "opacity-70")}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t.catalog.filters}</h2>
            {activeCount ? (
              <a href={resetHref} className="text-sm font-semibold text-brand-700 hover:underline">
                {t.common.reset}
              </a>
            ) : null}
          </div>
          <FilterFields facets={facets} filters={filters} hasPharmacy={hasPharmacy} idp="d" />
          <noscript>
            <button type="submit" className="mt-4 h-11 w-full rounded-[var(--radius-md)] bg-brand-600 font-semibold text-white">{t.catalog.applyFilters}</button>
          </noscript>
        </form>
      </aside>
  );
  return (
    <>
      <Button variant="outline" icon="filter" className="lg:hidden" onClick={() => setOpen(true)} aria-haspopup="dialog">
        {t.catalog.showFilters}
        {activeCount ? <span className="grid size-5 place-items-center rounded-full bg-brand-600 text-xs text-white">{activeCount}</span> : null}
      </Button>
      <Drawer open={open} onClose={() => setOpen(false)} title={t.catalog.filters} closeLabel={t.common.close} side="bottom">
        <form id="mobile-filters" action={basePath} method="get" onSubmit={onSubmit}>
          <FilterFields facets={facets} filters={filters} hasPharmacy={hasPharmacy} idp="m" />
          <div className="sticky bottom-0 -mx-5 mt-6 flex gap-2 border-t border-line bg-white px-5 pt-4 pb-1">
            <a href={resetHref} className="inline-flex h-12 flex-1 items-center justify-center rounded-[var(--radius-md)] border border-line-strong font-semibold">
              {t.catalog.resetFilters}
            </a>
            <button type="submit" className="h-12 flex-1 rounded-[var(--radius-md)] bg-brand-600 font-semibold text-white">
              {t.catalog.applyFilters}
            </button>
          </div>
        </form>
      </Drawer>
    </>
  );
}

export function SortSelect({ basePath, filters, options }: { basePath: string; filters: CatalogFilters; options: { value: SortKey; label: string; disabled?: boolean }[] }) {
  const { t } = useSite();
  const router = useRouter();
  const current = filters.sort ?? options[0]?.value;
  return (
    <form action={basePath} method="get" className="flex min-w-0 max-w-full items-center gap-2">
      {filters.q ? <input type="hidden" name="q" value={filters.q} /> : null}
      {filters.brands?.map((b) => <input key={b} type="hidden" name="brand" value={b} />)}
      {filters.forms?.map((f) => <input key={f} type="hidden" name="form" value={f} />)}
      {filters.priceMin !== undefined ? <input type="hidden" name="pmin" value={filters.priceMin} /> : null}
      {filters.priceMax !== undefined ? <input type="hidden" name="pmax" value={filters.priceMax} /> : null}
      {filters.inStock ? <input type="hidden" name="stock" value="1" /> : null}
      {filters.rx ? <input type="hidden" name="rx" value={filters.rx} /> : null}
      <label htmlFor="sort" className="hidden text-sm text-muted sm:block">
        {t.catalog.sort}
      </label>
      <div className="relative min-w-0">
        <select
          id="sort"
          name="sort"
          defaultValue={current}
          onChange={(e) => router.push(`${basePath}${toQuery(e.currentTarget.form!, { sort: e.currentTarget.value })}`, { scroll: false })}
          className="h-11 w-full max-w-[16rem] min-w-0 appearance-none truncate rounded-[var(--radius-md)] border border-line-strong bg-white pr-9 pl-3 text-base font-medium md:text-sm"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" size={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" />
      </div>
      <noscript>
        <button type="submit" className="h-11 rounded-[var(--radius-md)] border border-line-strong px-3 text-sm">OK</button>
      </noscript>
    </form>
  );
}
