"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Dictionary, Locale } from "@/lib/i18n";
import { fmt, localizedPath } from "@/lib/i18n/config";
import { ToastProvider, useToast } from "../ui/Toast";
import { Drawer, Modal } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { Icon } from "../icons";
import { cn } from "../ui/cn";
import { cartStore } from "@/lib/client/stores";
import { formatPhone, telHref } from "@/lib/format";

export interface PickerPharmacy {
  id: string;
  slug: string;
  address: string;
  phones: string[];
  open: boolean | null;
  acceptsOrders: boolean;
}

interface SiteContextValue {
  locale: Locale;
  t: Dictionary;
  pharmacy: PickerPharmacy | null;
  pharmacies: PickerPharmacy[];
  helpline: string;
  showDemo: boolean;
  /** Online requests are possible only when SKU-level products with confirmed prices exist. */
  orderingEnabled: boolean;
  openPharmacyPicker: () => void;
  selectPharmacy: (id: string) => Promise<void>;
  href: (path: string) => string;
}

const SiteContext = createContext<SiteContextValue | null>(null);

export function useSite(): SiteContextValue {
  const v = useContext(SiteContext);
  if (!v) throw new Error("useSite outside SiteProvider");
  return v;
}

export function SiteProvider(props: {
  locale: Locale;
  t: Dictionary;
  pharmacy: PickerPharmacy | null;
  pharmacies: PickerPharmacy[];
  helpline: string;
  showDemo: boolean;
  orderingEnabled: boolean;
  children: ReactNode;
}) {
  return (
    <ToastProvider closeLabel={props.t.common.close}>
      <SiteInner {...props} />
    </ToastProvider>
  );
}

function SiteInner({ locale, t, pharmacy, pharmacies, helpline, showDemo, orderingEnabled, children }: Parameters<typeof SiteProvider>[0]) {
  const router = useRouter();
  const toast = useToast();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const doSelect = useCallback(
    async (id: string) => {
      setPendingId(id);
      try {
        const res = await fetch("/api/pharmacy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pharmacyId: id }),
        });
        if (!res.ok) throw new Error();
        setPickerOpen(false);
        setConfirmId(null);
        const p = pharmacies.find((x) => x.id === id);
        if (p) toast(`${t.header.yourPharmacy}: ${p.address}`);
        router.refresh();
      } catch {
        toast(t.errors.errorText, "error");
      } finally {
        setPendingId(null);
      }
    },
    [pharmacies, router, t, toast],
  );

  const selectPharmacy = useCallback(
    async (id: string) => {
      if (pharmacy?.id === id) {
        setPickerOpen(false);
        return;
      }
      // Warn before the cart is recalculated for another pharmacy.
      if (pharmacy && cartStore.get().length > 0) {
        setConfirmId(id);
        return;
      }
      await doSelect(id);
    },
    [doSelect, pharmacy],
  );

  const value = useMemo<SiteContextValue>(
    () => ({
      locale,
      t,
      pharmacy,
      pharmacies,
      helpline,
      showDemo,
      orderingEnabled,
      openPharmacyPicker: () => setPickerOpen(true),
      selectPharmacy,
      href: (path: string) => localizedPath(locale, path),
    }),
    [locale, t, pharmacy, pharmacies, helpline, showDemo, orderingEnabled, selectPharmacy],
  );

  const q = query.trim().toLowerCase();
  const filtered = q ? pharmacies.filter((p) => p.address.toLowerCase().includes(q)) : pharmacies;

  return (
    <SiteContext.Provider value={value}>
      {children}
      <Drawer
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={t.pharmacy.pickerTitle}
        description={t.pharmacy.pickerHint}
        closeLabel={t.common.close}
      >
        <label htmlFor="picker-search" className="sr-only">
          {t.pharmacy.searchLabel}
        </label>
        <div className="relative mb-4">
          <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input
            id="picker-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.pharmacy.searchPlaceholder}
            className="h-11 w-full rounded-[var(--radius-md)] border border-line-strong pr-3 pl-10 focus:border-brand-600 focus:outline-3 focus:outline-brand-600/25"
          />
        </div>
        {filtered.length === 0 ? <p className="py-6 text-center text-muted">{t.pharmacy.notFound}</p> : null}
        <ul className="flex flex-col gap-2" aria-label={t.pharmacy.title}>
          {filtered.map((p) => {
            const selected = pharmacy?.id === p.id;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => selectPharmacy(p.id)}
                  disabled={pendingId !== null}
                  aria-pressed={selected}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-[var(--radius-lg)] border p-3.5 text-left transition-colors",
                    selected ? "border-brand-600 bg-brand-50" : "border-line hover:border-brand-600",
                  )}
                >
                  <Icon name={selected ? "checkCircle" : "pin"} size={20} className={cn("mt-0.5 shrink-0", selected ? "text-brand-600" : "text-muted")} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">{p.address}</span>
                    <span className="mt-0.5 block text-sm text-muted">
                      {p.phones[0] ? formatPhone(p.phones[0]) : null}
                      {p.open !== null ? ` · ${p.open ? t.pharmacy.openNow : t.pharmacy.closedNow}` : ""}
                    </span>
                    {orderingEnabled && !p.acceptsOrders ? <span className="mt-1 block text-sm text-warn-700">{t.pharmacy.notAcceptingOrders}</span> : null}
                  </span>
                  <span className={cn("shrink-0 self-center text-sm font-semibold", selected ? "text-brand-700" : "text-brand-600")}>
                    {pendingId === p.id ? t.common.loading : selected ? t.pharmacy.selected : t.pharmacy.select}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-sm text-muted">
          {t.common.helpline}:{" "}
          <a href={telHref(helpline)} className="font-semibold text-brand-700 underline-offset-2 hover:underline">
            {formatPhone(helpline)}
          </a>
        </p>
      </Drawer>
      <Modal
        open={confirmId !== null}
        onClose={() => setConfirmId(null)}
        title={t.pharmacy.switchWarningTitle}
        closeLabel={t.common.close}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmId(null)}>
              {t.common.cancel}
            </Button>
            <Button loading={pendingId !== null} onClick={() => confirmId && doSelect(confirmId)}>
              {t.pharmacy.switchConfirm}
            </Button>
          </>
        }
      >
        <p className="text-ink-soft">{t.pharmacy.switchWarning}</p>
        {confirmId ? (
          <p className="mt-3 font-semibold">{fmt("{a} → {b}", { a: pharmacy?.address ?? "", b: pharmacies.find((p) => p.id === confirmId)?.address ?? "" })}</p>
        ) : null}
      </Modal>
    </SiteContext.Provider>
  );
}
