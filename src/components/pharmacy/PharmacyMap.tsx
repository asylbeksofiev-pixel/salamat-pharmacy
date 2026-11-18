"use client";
// Interactive map of SALAMAT pharmacies (Leaflet + OpenStreetMap tiles).
// Markers come from the same database records as the cards (coordinates from prisma/data/branches.json),
// so the list and the map never disagree. Leaflet is loaded in the browser only.
// Geolocation: the position is requested only after a click (or silently when permission was already granted),
// stays in the browser and is used to find the nearest pharmacy.
import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type * as Leaflet from "leaflet";
import { useSite } from "../site/SiteProvider";
import { SelectPharmacyButton } from "../catalog/SelectPharmacyButton";
import { Icon } from "../icons";
import { cn } from "../ui/cn";
import { formatPhone, telHref } from "@/lib/format";
import { localeTags } from "@/lib/i18n/config";
import { formatDistance, nearest, type LatLng } from "@/lib/geo";

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
  | { state: "done"; user: LatLng; accuracy: number; nearest: { point: MapPharmacy; km: number } | null }
  | { state: "error"; message: string };

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';

/** Route from the visitor (if known) or from "my location" in Yandex Maps, by car. */
function routeUrl(to: LatLng, from?: LatLng | null) {
  const start = from ? `${from.lat},${from.lng}` : "";
  return `https://yandex.kz/maps/?rtext=${start}~${to.lat},${to.lng}&rtt=auto`;
}

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

const PIN_SVG =
  '<svg width="30" height="38" viewBox="0 0 30 38" aria-hidden="true"><path d="M15 1C7.3 1 1 7.1 1 14.7 1 25.3 15 37 15 37s14-11.7 14-22.3C29 7.1 22.7 1 15 1Z" fill="currentColor" stroke="#fff" stroke-width="2"/><circle cx="15" cy="14.5" r="5.2" fill="#fff"/></svg>';

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
  /** Open the popup of the only/first pharmacy right away (pharmacy page). */
  openFirst?: boolean;
  className?: string;
}) {
  const { t, locale } = useSite();
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const markers = useRef(new Map<string, Leaflet.Marker>());
  const userMarker = useRef<Leaflet.Marker | null>(null);
  const userCircle = useRef<Leaflet.Circle | null>(null);
  const userPos = useRef<LatLng | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  // Bumped each time a map instance is created (e.g. after filtering the list), so overlays are redrawn on it.
  const [mapVersion, setMapVersion] = useState(0);
  const [geo, setGeo] = useState<GeoState>({ state: "idle" });
  const numberLocale = localeTags[locale];
  const dist = useCallback((km: number) => formatDistance(km, { m: t.pharmacy.meters, km: t.pharmacy.kilometers }, numberLocale), [t, numberLocale]);
  // Re-create the map only when the set of pharmacies really changes.
  const dataKey = pharmacies.map((p) => `${p.id}:${p.lat},${p.lng}`).join("|");

  const popupFor = useCallback(
    (p: MapPharmacy) => {
      const root = el("div", "sal-popup flex flex-col gap-1.5 text-[0.9rem] leading-snug text-ink");
      root.append(el("p", "text-xs font-semibold text-brand-700", `SALAMAT · ${p.city}`));
      root.append(el("p", "font-semibold text-ink", p.address));
      const from = userPos.current;
      if (from) {
        const km = nearest(from, [p])?.km;
        if (km !== undefined) root.append(el("p", "text-xs text-muted", t.pharmacy.distanceFrom.replace("{distance}", dist(km))));
      }
      if (p.phones.length) {
        const ul = el("ul", "flex flex-col gap-0.5");
        for (const ph of p.phones) {
          const li = el("li");
          const a = el("a", "font-semibold text-ink underline-offset-2 hover:text-brand-700 hover:underline", formatPhone(ph));
          a.href = telHref(ph);
          li.append(a);
          ul.append(li);
        }
        root.append(ul);
      } else {
        root.append(el("p", "text-xs text-muted", t.pharmacy.phoneUnknown));
      }
      const actions = el("div", "mt-1 flex flex-wrap gap-x-3 gap-y-1");
      const route = el("a", "font-semibold text-brand-700 underline-offset-2 hover:underline", t.pharmacy.buildRoute);
      route.href = routeUrl(p, userPos.current);
      route.target = "_blank";
      route.rel = "noopener noreferrer";
      const details = el("a", "font-semibold text-brand-700 underline-offset-2 hover:underline", t.pharmacy.details);
      details.href = p.href;
      details.addEventListener("click", (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        router.push(p.href);
      });
      actions.append(route);
      if (!openFirst) actions.append(details);
      root.append(actions);
      return root;
    },
    [t, dist, router, openFirst],
  );

  const pinIcon = useCallback((kind: "default" | "selected" | "nearest") => {
    const Lf = L.current!;
    return Lf.divIcon({ className: `sal-pin sal-pin--${kind}`, html: PIN_SVG, iconSize: [30, 38], iconAnchor: [15, 37], popupAnchor: [0, -34] });
  }, []);

  // Create the map.
  useEffect(() => {
    let cancelled = false;
    const markerMap = markers.current;
    import("leaflet")
      .then((mod) => {
        const Lf = (mod as unknown as { default?: typeof Leaflet }).default ?? (mod as unknown as typeof Leaflet);
        if (cancelled || !box.current) return;
        L.current = Lf;
        const still = reducedMotion();
        const m = Lf.map(box.current, {
          scrollWheelZoom: false,
          zoomAnimation: !still,
          fadeAnimation: !still,
          markerZoomAnimation: !still,
          attributionControl: true,
        });
        m.attributionControl.setPrefix(false);
        Lf.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(m);
        for (const p of pharmacies) {
          const marker = Lf.marker([p.lat, p.lng], {
            icon: Lf.divIcon({ className: `sal-pin sal-pin--${p.id === selectedId ? "selected" : "default"}`, html: PIN_SVG, iconSize: [30, 38], iconAnchor: [15, 37], popupAnchor: [0, -34] }),
            title: p.address,
            alt: p.address,
            keyboard: true,
            riseOnHover: true,
          });
          marker.bindPopup(() => popupFor(p), { maxWidth: 260, minWidth: 200, autoPanPadding: [16, 16] });
          marker.addTo(m);
          markerMap.set(p.id, marker);
        }
        if (pharmacies.length === 1) m.setView([pharmacies[0].lat, pharmacies[0].lng], 16);
        else if (pharmacies.length) m.fitBounds(Lf.latLngBounds(pharmacies.map((p) => [p.lat, p.lng])), { padding: [28, 28], maxZoom: 15 });
        else m.setView([51.128, 71.43], 11);
        map.current = m;
        setStatus("ready");
        setMapVersion((v) => v + 1);
        if (openFirst && pharmacies[0]) markerMap.get(pharmacies[0].id)?.openPopup();
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      userMarker.current = null;
      userCircle.current = null;
      markerMap.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilt only when the pharmacies change (dataKey)
  }, [dataKey]);

  // Highlight the selected pharmacy and the nearest one without rebuilding the map.
  const nearestId = geo.state === "done" ? geo.nearest?.point.id : undefined;
  useEffect(() => {
    if (status !== "ready") return;
    for (const [id, marker] of markers.current) {
      marker.setIcon(pinIcon(id === nearestId ? "nearest" : id === selectedId ? "selected" : "default"));
      marker.setZIndexOffset(id === nearestId ? 1000 : id === selectedId ? 500 : 0);
    }
  }, [status, mapVersion, selectedId, nearestId, pinIcon]);

  // Show the visitor and frame them together with the nearest pharmacy.
  useEffect(() => {
    const Lf = L.current;
    const m = map.current;
    if (status !== "ready" || !Lf || !m || geo.state !== "done") return;
    // One "you are here" marker per map, moved on later lookups (re-creating it can leave a stray label during zoom).
    const at: [number, number] = [geo.user.lat, geo.user.lng];
    const showCircle = geo.accuracy > 0 && geo.accuracy < 3000;
    if (userCircle.current) {
      if (showCircle) userCircle.current.setLatLng(at).setRadius(geo.accuracy);
      else {
        userCircle.current.remove();
        userCircle.current = null;
      }
    } else if (showCircle) {
      userCircle.current = Lf.circle(at, { radius: geo.accuracy, color: "#2563eb", weight: 1, opacity: 0.4, fillColor: "#3b82f6", fillOpacity: 0.1, interactive: false }).addTo(m);
    }
    if (userMarker.current) userMarker.current.setLatLng(at);
    else {
      userMarker.current = Lf.marker(at, {
        icon: Lf.divIcon({ className: "sal-me", html: '<span class="sal-me-dot"></span>', iconSize: [22, 22], iconAnchor: [11, 11] }),
        keyboard: false,
        interactive: false,
        zIndexOffset: 2000,
      })
        .bindTooltip(t.pharmacy.youAreHere, { permanent: true, direction: "top", offset: [0, -12], className: "sal-me-label" })
        .addTo(m);
    }
    const still = reducedMotion();
    if (geo.nearest) {
      const n = geo.nearest.point;
      m.fitBounds(Lf.latLngBounds([[geo.user.lat, geo.user.lng], [n.lat, n.lng]]), { padding: [48, 48], maxZoom: 16, animate: !still });
      markers.current.get(n.id)?.openPopup();
    } else {
      m.setView([geo.user.lat, geo.user.lng], 14, { animate: !still });
    }
  }, [status, mapVersion, geo, t]);

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
        userPos.current = user;
        setGeo({ state: "done", user, accuracy: pos.coords.accuracy, nearest: nearest(user, pharmacies) });
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
    const marker = markers.current.get(id);
    if (!marker || !map.current) return;
    box.current?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
    map.current.setView(marker.getLatLng(), Math.max(map.current.getZoom(), 15), { animate: !reducedMotion() });
    marker.openPopup();
  };

  const n = geo.state === "done" ? geo.nearest : null;

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

      <div className="relative isolate overflow-hidden rounded-[var(--radius-2xl)] border border-line bg-surface">
        <div ref={box} role="region" aria-label={t.pharmacy.mapRegion} className="sal-map h-[320px] w-full sm:h-[400px] lg:h-[460px]" />
        {status !== "ready" ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted">
            <span className="flex flex-col items-center gap-2">
              <Icon name="pin" size={28} className={status === "loading" ? "animate-pulse text-brand-300" : "text-brand-300"} />
              {status === "loading" ? t.pharmacy.mapLoading : t.pharmacy.mapError}
            </span>
          </div>
        ) : null}
      </div>

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
                href={routeUrl(n.point, geo.state === "done" ? geo.user : null)}
                target="_blank"
                rel="noopener noreferrer"
                className="press inline-flex h-11 items-center gap-1.5 rounded-[var(--radius-md)] px-3 text-sm font-semibold text-brand-700 hover:bg-white focus-visible:outline-3 focus-visible:outline-brand-600"
              >
                <Icon name="route" size={18} />
                {t.pharmacy.buildRoute}
              </a>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
