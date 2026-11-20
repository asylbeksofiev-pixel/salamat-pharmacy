"use client";
// Map of SALAMAT pharmacies: the official Yandex Maps widget (yandex.kz/map-widget), embedded as an iframe.
// It needs no API key and loads no Yandex script into the site itself. Markers are built from the same database
// records as the cards (coordinates from prisma/data/branches.json), so the list and the map never disagree.
// The widget does not support custom marker colours, so "show on map" and the nearest pharmacy are shown by
// centring the map on that pharmacy.
// Geolocation: the position is requested only after a click (or silently when permission was already granted),
// stays in the browser (it is never put into the map URL) and is used to find the nearest pharmacy.
import { useCallback, useEffect, useRef, useState } from "react";
import { useSite } from "../site/SiteProvider";
import { SelectPharmacyButton } from "../catalog/SelectPharmacyButton";
import { Icon } from "../icons";
import { cn } from "../ui/cn";
import { formatPhone, telHref } from "@/lib/format";
import { localeTags } from "@/lib/i18n/config";
import { formatDistance, nearest, type LatLng } from "@/lib/geo";
import { yandexMapWidgetUrl, yandexPlaceUrl, yandexRouteUrl } from "@/lib/yandex-maps";

export interface MapPharmacy {
  id: string;
  address: string;
  city: string;
  phones: string[];
  lat: number;
  lng: number;
  /** Pharmacy page on this site. */
  href: string;
}

type GeoState =
  | { state: "idle" }
  | { state: "locating" }
  | { state: "done"; user: LatLng; nearest: { point: MapPharmacy; km: number } | null }
  | { state: "error"; message: string };

/** The widget page is heavy; if it has not loaded after this time, offer the link to Yandex Maps instead. */
const LOAD_TIMEOUT_MS = 20_000;

export function PharmacyMap({
  pharmacies,
  selectedId,
  locate: locateEnabled = true,
  openFirst = false,
  className,
}: {
  pharmacies: MapPharmacy[];
  selectedId?: string | null;
  /** Show the "nearest pharmacy" button and panel. */
  locate?: boolean;
  /** Centre the map on the first pharmacy (pharmacy page). */
  openFirst?: boolean;
  className?: string;
}) {
  const { t, locale } = useSite();
  const box = useRef<HTMLDivElement>(null);
  // Pharmacy the map is centred on; null shows all pharmacies.
  const [focus, setFocus] = useState<string | null>(openFirst || pharmacies.length === 1 ? (pharmacies[0]?.id ?? null) : null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [geo, setGeo] = useState<GeoState>({ state: "idle" });
  const numberLocale = localeTags[locale];
  const dist = useCallback((km: number) => formatDistance(km, { m: t.pharmacy.meters, km: t.pharmacy.kilometers }, numberLocale), [t, numberLocale]);

  const focused = pharmacies.find((p) => p.id === focus) ?? null;
  const src = yandexMapWidgetUrl(pharmacies, locale, focused);

  // A new URL reloads the widget: show the loading state until it reports "load", an error after the timeout.
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [prevSrc, setPrevSrc] = useState(src);
  if (prevSrc !== src) {
    setPrevSrc(src);
    setStatus("loading");
  }
  useEffect(() => {
    if (status !== "loading") return;
    const timer = setTimeout(() => setStatus((s) => (s === "loading" ? "error" : s)), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status, src]);

  const locating = useRef(false);
  const locate = useCallback(() => {
    if (locating.current) return;
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGeo({ state: "error", message: t.pharmacy.geoUnsupported });
      return;
    }
    locating.current = true;
    setGeo({ state: "locating" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locating.current = false;
        const user = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const n = nearest(user, pharmacies);
        setGeo({ state: "done", user, nearest: n });
        if (n) setFocus(n.point.id);
      },
      (err) => {
        locating.current = false;
        setGeo({ state: "error", message: err.code === err.PERMISSION_DENIED ? t.pharmacy.geoDenied : t.pharmacy.geoFailed });
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  }, [pharmacies, t]);

  // If the visitor has already allowed geolocation for this site, find the nearest pharmacy without asking again.
  useEffect(() => {
    if (!locateEnabled || !pharmacies.length || !navigator.permissions?.query) return;
    let active = true;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((s) => {
        if (active && s.state === "granted") locate();
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per page
  }, []);

  const showOnMap = (id: string) => {
    setFocus(id);
    box.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  };

  const n = geo.state === "done" ? geo.nearest : null;
  const ready = status === "ready" && loadedSrc === src;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {locateEnabled && pharmacies.length ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={locate}
            disabled={geo.state === "locating"}
            aria-busy={geo.state === "locating" || undefined}
            className="press inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] border border-line-strong bg-white px-4 font-semibold text-ink hover:border-brand-600 hover:text-brand-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-70"
          >
            <Icon name="pin" size={18} className={geo.state === "locating" ? "animate-pulse text-brand-600" : "text-brand-600"} />
            {geo.state === "locating" ? t.pharmacy.locating : t.pharmacy.locate}
          </button>
          <p className="text-xs text-muted">{t.pharmacy.geoPrivacy}</p>
        </div>
      ) : null}

      <div ref={box} role="region" aria-label={t.pharmacy.mapRegion} className="relative isolate overflow-hidden rounded-[var(--radius-2xl)] border border-line bg-surface">
        <iframe
          key={src}
          src={src}
          title={t.pharmacy.mapTitle}
          referrerPolicy="strict-origin-when-cross-origin"
          allow="geolocation 'none'"
          onLoad={() => {
            setLoadedSrc(src);
            setStatus("ready");
          }}
          className={cn("block h-[320px] w-full border-0 transition-opacity duration-300 sm:h-[400px] lg:h-[460px]", ready ? "opacity-100" : "opacity-0")}
        />
        {!ready ? (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted">
            <span className="flex flex-col items-center gap-2">
              <Icon name="pin" size={28} className={status === "loading" ? "animate-pulse text-brand-300" : "text-brand-300"} />
              {status === "error" ? t.pharmacy.mapError : t.pharmacy.mapLoading}
              {status === "error" ? (
                <a href={focused ? yandexPlaceUrl(focused, locale) : yandexMapWidgetUrl(pharmacies, locale, null, true)} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline underline-offset-2">
                  {t.pharmacy.openInYandex}
                </a>
              ) : null}
            </span>
          </div>
        ) : null}
      </div>
      {focused && pharmacies.length > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="min-w-0 text-ink-soft">
            {t.pharmacy.mapCentredOn} <span className="font-semibold text-ink">{focused.address}</span>
          </p>
          <button type="button" onClick={() => setFocus(null)} className="inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-md)] px-2 font-semibold text-brand-700 hover:bg-brand-50">
            {t.pharmacy.mapShowAll}
          </button>
        </div>
      ) : null}

      <div aria-live="polite">
        {geo.state === "error" ? <p className="rounded-[var(--radius-lg)] bg-warn-50 px-4 py-3 text-sm text-warn-700">{geo.message}</p> : null}
        {n ? (
          <section aria-labelledby="nearest-title" className="anim-pop flex flex-col gap-3 rounded-[var(--radius-xl)] border border-brand-200 bg-brand-50/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="min-w-0">
              <h2 id="nearest-title" className="text-xs font-semibold tracking-wide text-brand-700 uppercase">
                {t.pharmacy.nearestTitle}
              </h2>
              <p className="mt-1 font-semibold break-words text-ink">{n.point.address}</p>
              <p className="text-sm text-muted">
                {n.point.city} · {t.pharmacy.distanceFrom.replace("{distance}", dist(n.km))}
              </p>
              {n.point.phones.length ? (
                <p className="mt-1 flex flex-wrap gap-x-3">
                  {n.point.phones.map((ph) => (
                    <a key={ph} href={telHref(ph)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink hover:text-brand-700">
                      <Icon name="phone" size={16} className="text-brand-600" />
                      {formatPhone(ph)}
                    </a>
                  ))}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <SelectPharmacyButton id={n.point.id} selected={selectedId === n.point.id} />
              <button
                type="button"
                onClick={() => showOnMap(n.point.id)}
                className="press inline-flex h-11 items-center gap-1.5 rounded-[var(--radius-md)] px-3 text-sm font-semibold text-brand-700 hover:bg-white focus-visible:outline-3 focus-visible:outline-brand-600"
              >
                <Icon name="pin" size={18} />
                {t.pharmacy.showOnMap}
              </button>
              <a
                href={yandexRouteUrl(n.point, geo.state === "done" ? geo.user : null)}
                target="_blank"
                rel="noopener noreferrer"
                className="press inline-flex h-11 items-center gap-1.5 rounded-[var(--radius-md)] px-3 text-sm font-semibold text-brand-700 hover:bg-white focus-visible:outline-3 focus-visible:outline-brand-600"
              >
                <Icon name="route" size={18} />
                {t.pharmacy.buildRoute}
                <span className="sr-only"> — {t.pharmacy.routeYandex}</span>
              </a>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
