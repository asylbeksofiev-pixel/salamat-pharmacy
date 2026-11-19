import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { cityName, pickLocalized, type Locale } from "@/lib/i18n";
import { openStatus, parseOpeningHours, type OpeningHours, type OpenStatus } from "@/lib/hours";

export const PHARMACY_COOKIE = "salamat_pharmacy";

export interface PharmacyView {
  id: string;
  code: string;
  slug: string;
  name: string | null;
  address: string;
  addressRu: string;
  city: string;
  cityRu: string;
  phones: string[];
  latitude: number | null;
  longitude: number | null;
  hours: OpeningHours | null;
  hoursNote: string | null;
  openStatus: OpenStatus;
  acceptsOrders: boolean;
  verifiedAt: string | null;
  sourceName: string | null;
  /** Only photos with a confirmed right to use them (see PharmacyPhoto); empty for most branches. */
  photos: PharmacyPhotoView[];
}

export interface PharmacyPhotoView {
  url: string;
  kind: "EXTERIOR" | "INTERIOR";
  source: string;
  license: string;
  sourceUrl: string | null;
}

type Row = Awaited<ReturnType<typeof loadAll>>[number];

async function loadAll() {
  return prisma.pharmacy.findMany({
    where: { isActive: true, city: { isActive: true } },
    include: {
      city: true,
      source: { select: { name: true } },
      photos: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { url: true, kind: true, source: true, license: true, sourceUrl: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { addressRu: "asc" }],
  });
}

function toView(p: Row, locale: Locale, now: Date): PharmacyView {
  const hours = parseOpeningHours(p.openingHours);
  return {
    id: p.id,
    code: p.code,
    slug: p.slug,
    name: p.name,
    address: pickLocalized(locale, p.addressRu, p.addressKk),
    addressRu: p.addressRu,
    city: cityName(locale, p.city.slug, p.city.nameRu, p.city.nameKk),
    cityRu: p.city.nameRu,
    phones: p.phones,
    latitude: p.latitude ? Number(p.latitude) : null,
    longitude: p.longitude ? Number(p.longitude) : null,
    hours,
    hoursNote: p.hoursNote,
    openStatus: openStatus(hours, now),
    acceptsOrders: p.acceptsOrders,
    verifiedAt: p.verifiedAt?.toISOString() ?? null,
    sourceName: p.source?.name ?? null,
    // Exterior first, then interior; https links only.
    photos: [...p.photos].filter((ph) => /^https:\/\//.test(ph.url)).sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "EXTERIOR" ? -1 : 1)),
  };
}

export const getPharmacies = cache(async (locale: Locale): Promise<PharmacyView[]> => {
  const now = new Date();
  return (await loadAll()).map((p) => toView(p, locale, now));
});

export async function getPharmacyBySlug(slug: string, locale: Locale): Promise<PharmacyView | null> {
  const list = await getPharmacies(locale);
  return list.find((p) => p.slug === slug) ?? null;
}

/** The pharmacy chosen by the visitor (cookie), validated against active pharmacies. */
export const getSelectedPharmacy = cache(async (locale: Locale): Promise<PharmacyView | null> => {
  const jar = await cookies();
  const id = jar.get(PHARMACY_COOKIE)?.value;
  if (!id || id.length > 40) return null;
  const list = await getPharmacies(locale);
  return list.find((p) => p.id === id) ?? null;
});

/** Links that open an external map app; work without coordinates by searching the address. */
export function routeLinks(p: { addressRu: string; cityRu: string; latitude: number | null; longitude: number | null }) {
  const text = encodeURIComponent(`${p.cityRu}, ${p.addressRu.replace(/,?\s*н\.\s?п\.?\s*\d+/i, "")}`);
  if (p.latitude !== null && p.longitude !== null) {
    return {
      twoGis: `https://2gis.kz/astana/geo/${p.longitude},${p.latitude}`,
      yandex: `https://yandex.kz/maps/?rtext=~${p.latitude},${p.longitude}&rtt=auto`,
    };
  }
  return {
    twoGis: `https://2gis.kz/astana/search/${text}`,
    yandex: `https://yandex.kz/maps/?text=${text}`,
  };
}
