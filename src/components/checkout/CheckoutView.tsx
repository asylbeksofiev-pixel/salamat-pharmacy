"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { cartStore } from "@/lib/client/stores";
import { dataLang, fmt } from "@/lib/i18n/config";
import type { Quote } from "@/server/orders/quote";
import { useSite } from "../site/SiteProvider";
import { PharmacyChip } from "../site/HeaderParts";
import { Button, ButtonLink, Spinner } from "../ui/Button";
import { Checkbox, Input, Radio, Textarea } from "../ui/Field";
import { EmptyState, Notice, Skeleton } from "../ui/Feedback";
import { useToast } from "../ui/Toast";
import { useQuote } from "./useQuote";
import { LinePrice, QuoteTotals, noteText } from "./CartView";
import { Icon } from "../icons";

const KEY_STORAGE = "salamat_checkout_key";

function idempotencyKey(): string {
  try {
    const existing = sessionStorage.getItem(KEY_STORAGE);
    if (existing) return existing;
    const k = crypto.randomUUID();
    sessionStorage.setItem(KEY_STORAGE, k);
    return k;
  } catch {
    return crypto.randomUUID();
  }
}

type FieldErrors = Partial<Record<"name" | "phone" | "consent" | "pharmacyId" | "deliveryAddress" | "comment" | "items" | "form", string>>;

/** Light formatting while typing: +7 7XX XXX XX XX (validation happens on the server). */
function formatPhoneInput(v: string): string {
  let d = v.replace(/\D/g, "");
  if (d.startsWith("8")) d = `7${d.slice(1)}`;
  if (!d.startsWith("7") && d.length) d = `7${d}`;
  d = d.slice(0, 11);
  const parts = [d.slice(0, 1), d.slice(1, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)].filter(Boolean);
  return parts.length ? `+${parts.join(" ")}` : "";
}

export function CheckoutView() {
  const { t, locale, href, pharmacy } = useSite();
  const router = useRouter();
  const toast = useToast();
  const { lines, quote, loading, notes, hydrated, applyQuoteNotes, setQuote } = useQuote(pharmacy?.id ?? null, locale);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  // Set once the request is saved: the cart is cleared, but the page must not flash "cart is empty".
  const [sent, setSent] = useState(false);
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const inFlight = useRef(false);
  const errorSummary = useRef<HTMLDivElement>(null);
  const e = t.checkout.errors as Record<string, string>;

  if (!hydrated) return <div className="container-page py-8"><Skeleton className="h-96" /></div>;
  if (sent) {
    return (
      <div className="container-page flex flex-col items-center gap-3 py-16 text-center" role="status" aria-live="polite">
        <Spinner className="size-6 text-brand-600" />
        <p className="font-semibold text-ink">{t.checkout.submitting}</p>
      </div>
    );
  }
  if (!lines.length) {
    return (
      <div className="container-page py-6 md:py-10">
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight sm:text-[2.25rem]">{t.checkout.title}</h1>
        <EmptyState className="mt-6" icon="cart" title={t.cart.empty} text={t.cart.emptyText} action={<ButtonLink href={href("/catalog")}>{t.cart.toCatalog}</ButtonLink>} />
      </div>
    );
  }

  const onSubmit = async (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    if (inFlight.current) return; // protection against double submission
    const fd = new FormData(ev.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    const consent = fd.get("consent") === "on";
    const local: FieldErrors = {};
    if (!name) local.name = e.nameRequired;
    if (!phone.replace(/\D/g, "")) local.phone = e.phoneRequired;
    else if (phone.replace(/\D/g, "").length !== 11) local.phone = e.phoneInvalid;
    if (!consent) local.consent = e.consentRequired;
    if (!pharmacy) local.pharmacyId = e.pharmacyRequired;
    if (method === "DELIVERY" && !String(fd.get("deliveryAddress") ?? "").trim()) local.deliveryAddress = e.addressRequired;
    setErrors(local);
    if (Object.keys(local).length) {
      requestAnimationFrame(() => errorSummary.current?.focus());
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: idempotencyKey(),
          pharmacyId: pharmacy!.id,
          fulfillment: method,
          name,
          phone,
          comment: String(fd.get("comment") ?? ""),
          deliveryAddress: String(fd.get("deliveryAddress") ?? ""),
          consent: true,
          locale,
          items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, seenPriceKzt: l.seenPriceKzt })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.publicId) {
        setSent(true);
        cartStore.clear();
        try {
          sessionStorage.removeItem(KEY_STORAGE);
        } catch {
          /* ignore */
        }
        router.push(href(`/order/success/${data.publicId}`));
        return;
      }
      if (res.status === 400 && data.errors) {
        const mapped: FieldErrors = {};
        for (const [k, v] of Object.entries(data.errors as Record<string, string>)) mapped[k as keyof FieldErrors] = e[v] ?? e.generic;
        setErrors(mapped);
      } else if (res.status === 409) {
        if (data.quote) {
          setQuote(data.quote as Quote);
          applyQuoteNotes(data.quote as Quote);
        }
        setErrors({ form: data.code === "pharmacy_not_accepting" ? e.pharmacyNotAccepting : e.changed });
      } else if (res.status === 429) setErrors({ form: e.rateLimited });
      else setErrors({ form: e.generic });
      requestAnimationFrame(() => errorSummary.current?.focus());
    } catch {
      setErrors({ form: e.generic });
      toast(e.generic, "error");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const errorList = Object.values(errors).filter(Boolean);
  const noteList = Object.entries(notes).filter(([id]) => lines.some((l) => l.variantId === id));

  return (
    <div className="container-page py-6 md:py-10">
      <nav className="text-sm">
        <Link href={href("/cart")} className="inline-flex items-center gap-1 py-1 font-medium text-muted hover:text-brand-700">
          <Icon name="chevronLeft" size={16} />
          {t.cart.title}
        </Link>
      </nav>
      <h1 className="mt-2 text-[1.75rem] leading-tight font-bold tracking-tight sm:text-[2.25rem]">{t.checkout.title}</h1>
      {quote?.hasUnpriced ? (
        <Notice tone="info" title={t.request.modeTitle} className="mt-4">
          {t.request.modeText}
        </Notice>
      ) : (
        <Notice tone="info" className="mt-4">{t.checkout.requestNotOrder}</Notice>
      )}
      <form noValidate onSubmit={onSubmit} className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-8">
        <div className="flex flex-col gap-6">
          {errorList.length ? (
            <div ref={errorSummary} tabIndex={-1} role="alert" className="rounded-[var(--radius-md)] border border-accent-100 bg-accent-50 px-4 py-3 text-accent-700 outline-none">
              <ul className="list-disc pl-5">
                {errorList.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          ) : null}
          <fieldset className="rounded-[var(--radius-xl)] border border-line bg-white p-5 sm:p-6">
            <legend className="px-1 text-lg font-semibold">{t.checkout.contacts}</legend>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <Input name="name" label={t.checkout.name} placeholder={t.checkout.namePlaceholder} autoComplete="given-name" required maxLength={80} error={errors.name} />
              <Input
                name="phone"
                type="tel"
                inputMode="tel"
                label={t.checkout.phone}
                placeholder={t.checkout.phonePlaceholder}
                autoComplete="tel"
                required
                value={phone}
                onChange={(ev) => setPhone(formatPhoneInput(ev.target.value))}
                hint={t.checkout.phoneHint}
                error={errors.phone}
              />
            </div>
          </fieldset>
          <fieldset className="rounded-[var(--radius-xl)] border border-line bg-white p-5 sm:p-6">
            <legend className="px-1 text-lg font-semibold">{t.checkout.method}</legend>
            {/* Delivery is offered only when it is really switched on in the settings; otherwise pickup only. */}
            {quote?.deliveryEnabled ? (
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <Radio name="method" value="PICKUP" checked={method === "PICKUP"} onChange={() => setMethod("PICKUP")} label={t.checkout.pickup} description={t.checkout.pickupHint} />
                <Radio name="method" value="DELIVERY" checked={method === "DELIVERY"} onChange={() => setMethod("DELIVERY")} label={t.checkout.delivery} />
              </div>
            ) : (
              <div className="mt-2 flex items-start gap-3 rounded-[var(--radius-lg)] border border-brand-200 bg-brand-50/60 p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-brand-700">
                  <Icon name="store" size={20} />
                </span>
                <span>
                  <span className="block font-semibold text-ink">{t.checkout.pickup}</span>
                  <span className="mt-0.5 block text-sm text-muted">{t.checkout.pickupHint}</span>
                </span>
              </div>
            )}
            {method === "DELIVERY" && quote?.deliveryEnabled ? (
              <div className="mt-4">
                <Input name="deliveryAddress" label={t.checkout.deliveryAddress} required maxLength={300} error={errors.deliveryAddress} />
              </div>
            ) : null}
            <div className="mt-5">
              <p className="mb-2 text-sm font-semibold">{t.checkout.pharmacy}</p>
              <PharmacyChip compact />
              {errors.pharmacyId ? <p className="mt-1 text-sm font-medium text-accent-600" role="alert">{errors.pharmacyId}</p> : null}
            </div>
          </fieldset>
          <fieldset className="rounded-[var(--radius-xl)] border border-line bg-white p-5 sm:p-6">
            <legend className="sr-only">{t.checkout.comment}</legend>
            <Textarea name="comment" label={t.checkout.comment} placeholder={t.checkout.commentPlaceholder} maxLength={500} rows={3} error={errors.comment} />
            <div className="mt-4">
              <Checkbox
                name="consent"
                error={errors.consent}
                label={
                  <>
                    {t.checkout.consent.split("{link}")[0]}
                    <Link href={href("/privacy")} target="_blank" className="font-semibold text-brand-700 underline underline-offset-2">
                      {t.checkout.consentLink}
                    </Link>
                    {t.checkout.consent.split("{link}")[1]}
                  </>
                }
              />
            </div>
          </fieldset>
        </div>
        <aside className="flex flex-col gap-4 self-start lg:sticky lg:top-36">
          <div className="rounded-[var(--radius-xl)] border border-line bg-white p-5 shadow-[var(--shadow-card)] sm:p-6">
            <h2 className="text-lg font-semibold">{t.checkout.summary}</h2>
            {noteList.length ? (
              <Notice tone="warning" className="mt-3">
                <ul className="list-disc pl-4">
                  {noteList.map(([id, n]) => <li key={id}>{lines.find((l) => l.variantId === id)?.name}: {noteText(n, t, locale)}</li>)}
                </ul>
              </Notice>
            ) : null}
            <ul className="mt-3 flex flex-col divide-y divide-line">
              {(quote?.lines ?? []).map((l) => (
                <li key={l.variantId} className="flex items-start justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className="block text-[0.95rem] leading-snug font-medium break-words" lang={dataLang(locale, l.fullName)}>{l.fullName}</span>
                    {l.article ? <span className="block text-xs text-muted">{t.items.article}: <span className="font-mono break-all">{l.article}</span></span> : null}
                    <span className="text-sm text-muted">{l.quantity} {t.common.pieces}</span>
                    {l.blocking ? <span className="block text-sm text-accent-600">{t.cart.becameUnavailable}</span> : null}
                  </span>
                  <LinePrice line={l} t={t} locale={locale} />
                </li>
              ))}
            </ul>
            <div className="mt-2 border-t border-line pt-4">{quote ? <QuoteTotals quote={quote} t={t} locale={locale} /> : <p className="text-sm text-muted">{t.cart.checking}</p>}</div>
            <Button type="submit" size="lg" className="mt-5 w-full" loading={submitting} disabled={!quote || quote.hasBlocking || !pharmacy}>
              {submitting ? t.checkout.submitting : t.checkout.submit}
            </Button>
            <p className="mt-3 text-xs text-muted">{t.cart.notPaymentNote}</p>
            <p className="sr-only" aria-live="polite">{loading ? t.cart.checking : ""}</p>
          </div>
          {quote && quote.lines.length > (quote.limits.maxLines ?? 30) ? <Notice tone="warning">{fmt(t.cart.tooManyItems, { max: quote.limits.maxLines })}</Notice> : null}
        </aside>
      </form>
    </div>
  );
}
