"use client";
// "Find the nearest pharmacy by address".
//   1. The visitor types an address. With a 2GIS key on the server, suggestions appear after a short pause
//      (/api/pharmacy/address-suggest, debounced, cancelled when the text changes). Nominatim (no key) does not
//      allow autocomplete, so then the visitor just presses "Search".
//   2. Picking a suggestion or pressing "Search" asks /api/pharmacy/nearest: the server geocodes the address
//      (or takes the picked suggestion's coordinates) and returns the pharmacies sorted by the real distance
//      between coordinates. The address goes in the request body, never into the URL, and is not stored.
//   3. The list shows address, distance, phone, "Choose", "Details" and a route from the address (Yandex Maps).
// Only pharmacies with coordinates take part; without coordinates the block says so instead of guessing.
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { fmt, dataLang, localeTags } from "@/lib/i18n/config";
import { formatPhone, telHref } from "@/lib/format";
import { formatDistance } from "@/lib/geo";
import { useSite } from "../site/SiteProvider";
import { SelectPharmacyButton } from "../catalog/SelectPharmacyButton";
import { Button, Spinner } from "../ui/Button";
import { Icon } from "../icons";
import { cn } from "../ui/cn";

export interface NearestPharmacy {
  id: string;
  address: string;
  city: string;
  phones: string[];
  href: string;
  lat: number;
  lng: number;
}

type Point = { lat: number; lng: number };
type Suggestion = { label: string; point: Point | null };

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string; retry: boolean }
  | { kind: "done"; label: string; point: Point; provider: string; results: { id: string; km: number }[] };

const SHOWN = 5;
const SUGGEST_DELAY_MS = 350;
const MIN_CHARS = 3;

/** Directions from the searched address to the pharmacy (Yandex Maps, same service as on the map). */
function routeHref(from: Point, to: Point) {
  return `https://yandex.kz/maps/?rtext=${from.lat},${from.lng}~${to.lat},${to.lng}&rtt=auto`;
}

export function NearestByAddress({
  pharmacies,
  provider,
  suggestions: suggestEnabled,
  missingCoords,
}: {
  /** Active pharmacies that have coordinates (only they can be ranked by distance). */
  pharmacies: NearestPharmacy[];
  provider: "2gis" | "nominatim" | "off";
  /** Address suggestions while typing (only with a 2GIS key). */
  suggestions: boolean;
  /** Active pharmacies without coordinates (not ranked; listed below the block). */
  missingCoords: number;
}) {
  const { t, locale, pharmacy: selected } = useSite();
  const uid = useId();
  const inputId = `${uid}-address`;
  const listId = `${uid}-suggestions`;
  const statusId = `${uid}-status`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [all, setAll] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [lastQuery, setLastQuery] = useState<{ address: string; point: Point | null } | null>(null);
  const inflight = useRef<AbortController | null>(null);
  const suggestCtrl = useRef<AbortController | null>(null);
  const suggestCache = useRef(new Map<string, Suggestion[]>());
  // Set when the text was put into the field by picking a suggestion: no new suggestions for it.
  const [picked, setPicked] = useState<string | null>(null);
  const byId = new Map(pharmacies.map((p) => [p.id, p]));
  const service = provider === "2gis" ? t.pharmacy.service2gis : t.pharmacy.serviceOsm;

  // Debounced suggestions: one request after the visitor pauses typing, the previous one is cancelled.
  useEffect(() => {
    if (!suggestEnabled) return;
    const q = value.trim();
    if (q.length < MIN_CHARS || picked === value) {
      suggestCtrl.current?.abort();
      return;
    }
    const cached = suggestCache.current.get(q.toLowerCase());
    const timer = setTimeout(
      async () => {
        if (cached) {
          setItems(cached);
          setActive(-1);
          setOpen(true);
          return;
        }
        suggestCtrl.current?.abort();
        const ctrl = new AbortController();
        suggestCtrl.current = ctrl;
        setSuggestLoading(true);
        setOpen(true);
        try {
          const res = await fetch("/api/pharmacy/address-suggest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ q, locale }),
            signal: ctrl.signal,
          });
          const data = res.ok ? await res.json().catch(() => ({})) : {};
          const list: Suggestion[] = Array.isArray(data.items) ? data.items : [];
          suggestCache.current.set(q.toLowerCase(), list);
          setItems(list);
          setActive(-1);
        } catch (e) {
          // Suggestions are optional: on any failure the visitor can still press "Search".
          if ((e as Error).name !== "AbortError") setItems([]);
        } finally {
          if (!ctrl.signal.aborted) setSuggestLoading(false);
        }
      },
      cached ? 0 : SUGGEST_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [value, picked, suggestEnabled, locale]);

  const closeList = () => {
    setOpen(false);
    setActive(-1);
  };

  const search = async (address: string, point: Point | null) => {
    closeList();
    suggestCtrl.current?.abort();
    if (address.trim().length < MIN_CHARS) {
      setState({ kind: "error", message: t.pharmacy.addressTooShort, retry: false });
      inputRef.current?.focus();
      return;
    }
    setLastQuery({ address, point });
    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    setState({ kind: "loading" });
    setAll(false);
    try {
      const res = await fetch("/api/pharmacy/nearest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: address.trim(), locale, ...(point ? { point } : {}) }),
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.point) {
        setState({ kind: "done", label: data.label, point: data.point, provider: data.provider, results: data.results ?? [] });
      } else if (res.status === 404) setState({ kind: "error", message: t.pharmacy.addressNotFound, retry: false });
      else if (res.status === 400) setState({ kind: "error", message: t.pharmacy.addressTooShort, retry: false });
      else if (res.status === 429) setState({ kind: "error", message: t.search.rateLimited, retry: true });
      else setState({ kind: "error", message: t.pharmacy.addressUnavailable, retry: true });
    } catch (err) {
      if ((err as Error).name !== "AbortError") setState({ kind: "error", message: t.pharmacy.addressUnavailable, retry: true });
    }
  };

  const pick = (s: Suggestion) => {
    setPicked(s.label);
    setValue(s.label);
    void search(s.label, s.point);
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void search(value, null);
  };

  const clear = () => {
    inflight.current?.abort();
    suggestCtrl.current?.abort();
    setPicked(null);
    setLastQuery(null);
    setValue("");
    setItems([]);
    closeList();
    setSuggestLoading(false);
    setState({ kind: "idle" });
    inputRef.current?.focus();
  };

  const listShown = suggestEnabled && open && value.trim().length >= MIN_CHARS && picked !== value && (suggestLoading || items.length > 0);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (listShown) {
        e.preventDefault();
        closeList();
      } else if (value) {
        e.preventDefault();
        clear();
      }
      return;
    }
    if (!listShown || !items.length) {
      if (e.key === "ArrowDown" && items.length && value.trim().length >= MIN_CHARS) {
        e.preventDefault();
        setOpen(true);
        setActive(0);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(items[active]);
    }
  };

  // Not every pharmacy can be ranked without coordinates: say so plainly instead of searching.
  if (!pharmacies.length || provider === "off") {
    return (
      <section aria-labelledby="address-nearest-title" className="rounded-[var(--radius-2xl)] border border-line bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
        <h2 id="address-nearest-title" className="flex items-center gap-2 text-lg font-semibold text-ink">
          <Icon name="pin" size={20} className="shrink-0 text-brand-600" />
          {t.pharmacy.addressSearchTitle}
        </h2>
        <p className="mt-2 flex items-start gap-2 text-sm text-ink-soft">
          <Icon name="info" size={18} className="mt-0.5 shrink-0 text-brand-600" />
          {!pharmacies.length ? t.pharmacy.addressNoCoords : t.pharmacy.addressOff}
        </p>
      </section>
    );
  }

  const results = state.kind === "done" ? state.results.filter((r) => byId.has(r.id)) : [];
  const visible = all ? results : results.slice(0, SHOWN);
  const nf = localeTags[locale];

  return (
    <section aria-labelledby="address-nearest-title" className="rounded-[var(--radius-2xl)] border border-line bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
      <h2 id="address-nearest-title" className="flex items-center gap-2 text-lg font-semibold text-ink">
        <Icon name="pin" size={20} className="shrink-0 text-brand-600" />
        {t.pharmacy.addressSearchTitle}
      </h2>
      <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end" noValidate role="search" aria-labelledby="address-nearest-title">
        <div className="relative min-w-0 flex-1">
          <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-ink">
            {t.pharmacy.addressLabel}
          </label>
          <div className="relative">
            <input
              ref={inputRef}
              id={inputId}
              name="address"
              type="text"
              value={value}
              onChange={(e) => {
                setPicked(null);
                setValue(e.target.value);
                setOpen(true);
                if (state.kind === "error") setState({ kind: "idle" });
              }}
              onKeyDown={onKeyDown}
              onBlur={() => setTimeout(closeList, 120)}
              autoComplete="street-address"
              enterKeyHint="search"
              spellCheck={false}
              maxLength={120}
              placeholder={t.pharmacy.addressPlaceholder}
              {...(suggestEnabled
                ? {
                    role: "combobox",
                    "aria-autocomplete": "list" as const,
                    "aria-expanded": listShown,
                    "aria-controls": listId,
                    "aria-activedescendant": listShown && active >= 0 ? `${listId}-${active}` : undefined,
                  }
                : {})}
              aria-describedby={statusId}
              aria-invalid={(state.kind === "error" && !state.retry) || undefined}
              className="sal-search-input h-12 w-full rounded-[var(--radius-md)] border border-line-strong bg-white pr-12 pl-3.5 text-[1rem] placeholder:text-muted/85 focus:border-brand-600"
            />
            {value ? (
              <button
                type="button"
                onClick={clear}
                aria-label={t.pharmacy.addressClear}
                className="absolute top-1/2 right-1 grid size-10 -translate-y-1/2 touch-manipulation place-items-center rounded-[var(--radius-sm)] text-muted hover:bg-surface hover:text-ink"
              >
                <Icon name="close" size={18} />
              </button>
            ) : null}
          </div>
          {suggestEnabled ? (
            <ul
              id={listId}
              role="listbox"
              aria-label={t.pharmacy.addressSuggestions}
              hidden={!listShown}
              className="anim-pop absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-[var(--radius-lg)] border border-line bg-white py-1 shadow-[var(--shadow-pop)]"
            >
              {suggestLoading && !items.length ? (
                <li role="presentation" className="flex items-center gap-2 px-3.5 py-3 text-sm text-muted">
                  <Spinner className="size-4" />
                  {t.pharmacy.addressSuggestLoading}
                </li>
              ) : null}
              {items.map((s, i) => (
                <li
                  key={`${s.label}-${i}`}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  // mousedown: pick before the input loses focus and the list closes.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(s);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn("flex min-h-11 cursor-pointer items-center gap-2.5 px-3.5 py-2 text-[0.95rem] text-ink", i === active && "bg-brand-50 text-brand-800")}
                >
                  <Icon name="pin" size={16} className="shrink-0 text-muted" />
                  <span className="min-w-0 break-words" lang={dataLang(locale, s.label)}>
                    {s.label}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <Button type="submit" size="lg" icon="search" loading={state.kind === "loading"} className="h-12 w-full sm:w-auto">
          {t.pharmacy.addressSubmit}
        </Button>
      </form>
      <p className="mt-2 text-xs text-muted">
        {suggestEnabled ? `${t.pharmacy.addressSuggestHint} ` : ""}
        {fmt(t.pharmacy.addressPrivacy, { service })}
      </p>

      <div id={statusId} aria-live="polite" className="mt-3 text-sm empty:hidden">
        {state.kind === "loading" ? <p className="text-muted">{t.pharmacy.addressSearching}</p> : null}
        {state.kind === "error" ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-md)] bg-accent-50 px-3 py-2.5">
            <p className="flex min-w-0 flex-1 items-start gap-1.5 font-medium text-accent-700">
              <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
              {state.message}
            </p>
            {state.retry && lastQuery ? (
              <Button size="sm" variant="outline" onClick={() => search(lastQuery.address, lastQuery.point)}>
                {t.common.retry}
              </Button>
            ) : null}
          </div>
        ) : null}
        {state.kind === "done" ? (
          <p className="text-ink-soft">
            <span className="break-words">{fmt(t.pharmacy.addressFoundAs, { address: state.label })}</span>
            {results.length ? <span className="font-semibold"> · {fmt(t.pharmacy.addressResults, { count: results.length })}</span> : null}
          </p>
        ) : null}
      </div>

      {state.kind === "done" && !results.length ? <p className="mt-2 text-sm text-ink-soft">{t.pharmacy.addressNoResults}</p> : null}

      {state.kind === "done" && results.length ? (
        <>
          <ol className="mt-3 flex flex-col divide-y divide-line rounded-[var(--radius-xl)] border border-line">
            {visible.map((r, i) => {
              const p = byId.get(r.id)!;
              const distance = formatDistance(r.km, { m: t.pharmacy.meters, km: t.pharmacy.kilometers }, nf);
              return (
                <li key={r.id} className={cn("flex flex-col gap-3 p-3.5 lg:flex-row lg:items-center lg:justify-between", i === 0 && "bg-brand-50/60")}>
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold tabular-nums", i === 0 ? "bg-brand-600 text-white" : "bg-surface text-ink-soft")} aria-hidden="true">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <Link href={p.href} className="font-semibold break-words text-ink hover:text-brand-700 hover:underline" lang={dataLang(locale, p.address)}>
                        {p.address}
                      </Link>
                      <p className="text-sm text-muted">
                        <span className="font-semibold text-ink-soft tabular-nums">{fmt(t.pharmacy.distanceFromAddress, { distance })}</span>
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
                  <div className="flex shrink-0 flex-wrap items-center gap-2 pl-11 lg:pl-0">
                    <SelectPharmacyButton id={p.id} selected={selected?.id === p.id} />
                    <a
                      href={routeHref(state.point, p)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-11 items-center gap-1.5 rounded-[var(--radius-md)] px-3 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50"
                    >
                      <Icon name="route" size={18} />
                      {t.pharmacy.route}
                      <span className="sr-only"> — {t.pharmacy.routeFromAddress}</span>
                    </a>
                    <Link href={p.href} className="inline-flex h-11 items-center gap-1 rounded-[var(--radius-md)] px-3 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50">
                      {t.common.more}
                      <span className="sr-only">: {p.address}</span>
                      <Icon name="chevronRight" size={16} />
                    </Link>
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
            {missingCoords > 0 ? ` · ${fmt(t.pharmacy.addressPartialCoords, { count: missingCoords })}` : null}
          </p>
        </>
      ) : null}
    </section>
  );
}
