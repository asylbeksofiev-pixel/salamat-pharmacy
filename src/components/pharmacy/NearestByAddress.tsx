"use client";
// "Find the nearest pharmacy by address": the visitor types an address, the server geocodes it
// (/api/pharmacy/nearest — the geocoder key stays on the server) and returns the pharmacies sorted by real
// distance between coordinates. The address goes in the request body, never into the URL.
import Link from "next/link";
import { useId, useRef, useState, type FormEvent } from "react";
import { fmt, dataLang, localeTags } from "@/lib/i18n/config";
import { formatPhone, telHref } from "@/lib/format";
import { formatDistance } from "@/lib/geo";
import { useSite } from "../site/SiteProvider";
import { SelectPharmacyButton } from "../catalog/SelectPharmacyButton";
import { Button } from "../ui/Button";
import { Icon } from "../icons";
import { cn } from "../ui/cn";

export interface NearestPharmacy {
  id: string;
  address: string;
  city: string;
  phones: string[];
  href: string;
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "done"; label: string; provider: string; results: { id: string; km: number }[] };

const SHOWN = 5;

export function NearestByAddress({ pharmacies }: { pharmacies: NearestPharmacy[] }) {
  const { t, locale, pharmacy: selected } = useSite();
  const inputId = useId();
  const [state, setState] = useState<State>({ kind: "idle" });
  const [all, setAll] = useState(false);
  const inflight = useRef<AbortController | null>(null);
  const byId = new Map(pharmacies.map((p) => [p.id, p]));

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const address = String(new FormData(e.currentTarget).get("address") ?? "").trim();
    if (address.length < 3) {
      setState({ kind: "error", message: t.pharmacy.addressTooShort });
      return;
    }
    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    setState({ kind: "loading" });
    setAll(false);
    try {
      const res = await fetch("/api/pharmacy/nearest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, locale }),
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setState({ kind: "done", label: data.label, provider: data.provider, results: data.results ?? [] });
      } else if (res.status === 404) setState({ kind: "error", message: t.pharmacy.addressNotFound });
      else if (res.status === 400) setState({ kind: "error", message: t.pharmacy.addressTooShort });
      else if (res.status === 429) setState({ kind: "error", message: t.search.rateLimited });
      else setState({ kind: "error", message: t.pharmacy.addressUnavailable });
    } catch (err) {
      if ((err as Error).name !== "AbortError") setState({ kind: "error", message: t.pharmacy.addressUnavailable });
    }
  };

  const results = state.kind === "done" ? state.results.filter((r) => byId.has(r.id)) : [];
  const visible = all ? results : results.slice(0, SHOWN);

  return (
    <section aria-labelledby="address-nearest-title" className="rounded-[var(--radius-2xl)] border border-line bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
      <h2 id="address-nearest-title" className="flex items-center gap-2 text-lg font-semibold text-ink">
        <Icon name="pin" size={20} className="shrink-0 text-brand-600" />
        {t.pharmacy.addressSearchTitle}
      </h2>
      <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end" noValidate>
        <div className="min-w-0 flex-1">
          <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-ink">
            {t.pharmacy.addressLabel}
          </label>
          <input
            id={inputId}
            name="address"
            type="text"
            autoComplete="street-address"
            enterKeyHint="search"
            maxLength={120}
            placeholder={t.pharmacy.addressPlaceholder}
            aria-describedby={`${inputId}-status`}
            aria-invalid={state.kind === "error" || undefined}
            className="sal-search-input h-12 w-full rounded-[var(--radius-md)] border border-line-strong bg-white px-3.5 text-[1rem] placeholder:text-muted/85 focus:border-brand-600"
          />
        </div>
        <Button type="submit" size="lg" icon="search" loading={state.kind === "loading"} className="h-12 w-full sm:w-auto">
          {t.pharmacy.addressSubmit}
        </Button>
      </form>
      <div id={`${inputId}-status`} aria-live="polite" className="mt-3 text-sm">
        {state.kind === "loading" ? <p className="text-muted">{t.pharmacy.addressSearching}</p> : null}
        {state.kind === "error" ? (
          <p className="flex items-start gap-1.5 font-medium text-accent-700">
            <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
            {state.message}
          </p>
        ) : null}
        {state.kind === "done" ? (
          <p className="text-ink-soft">
            {fmt(t.pharmacy.addressFoundAs, { address: state.label })}
          </p>
        ) : null}
      </div>
      {state.kind === "done" && results.length ? (
        <>
          <ol className="mt-3 flex flex-col divide-y divide-line rounded-[var(--radius-xl)] border border-line">
            {visible.map((r, i) => {
              const p = byId.get(r.id)!;
              return (
                <li key={r.id} className={cn("flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between", i === 0 && "bg-brand-50/60")}>
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold tabular-nums", i === 0 ? "bg-brand-600 text-white" : "bg-surface text-ink-soft")} aria-hidden="true">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <Link href={p.href} className="font-semibold break-words text-ink hover:text-brand-700 hover:underline" lang={dataLang(locale, p.address)}>
                        {p.address}
                      </Link>
                      <p className="text-sm text-muted">
                        {fmt(t.pharmacy.distanceFromAddress, { distance: formatDistance(r.km, { m: t.pharmacy.meters, km: t.pharmacy.kilometers }, localeTags[locale]) })}
                        {i === 0 ? <span className="ml-1.5 font-semibold text-brand-700">· {t.pharmacy.nearestBadge}</span> : null}
                      </p>
                      {p.phones[0] ? (
                        <a href={telHref(p.phones[0])} className="mt-0.5 inline-flex min-h-8 items-center gap-1.5 text-sm font-medium text-ink-soft tabular-nums hover:text-brand-700">
                          <Icon name="phone" size={14} />
                          {formatPhone(p.phones[0])}
                        </a>
                      ) : null}
                    </div>
                  </div>
                  <div className="shrink-0 pl-11 sm:pl-0">
                    <SelectPharmacyButton id={p.id} selected={selected?.id === p.id} />
                  </div>
                </li>
              );
            })}
          </ol>
          {results.length > SHOWN && !all ? (
            <button type="button" onClick={() => setAll(true)} className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-md)] px-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">
              {t.pharmacy.addressShowMore}
              <Icon name="chevronDown" size={16} />
            </button>
          ) : null}
          <p className="mt-2 text-xs text-muted">
            {state.provider === "2gis" ? t.pharmacy.geocoder2gis : t.pharmacy.geocoderOsm} · {t.pharmacy.distanceNote}
          </p>
        </>
      ) : null}
    </section>
  );
}
