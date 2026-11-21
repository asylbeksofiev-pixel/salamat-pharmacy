// Banners of the "SALAMAT services" carousel on the home page: information about services (pharmacies, ordering,
// helpline). Real promotions with terms and dates are published in the admin panel (Акции) and get their own block.
//
// HOW TO ADD A BANNER (see docs/promo-banners.md):
//   1. Put the image into  public/promo/  — promo-5.jpg, 2560 × 1440 px (16 : 9), JPG/PNG/WebP.
//      The frame is 16 : 9 on phones and tablets and 2 : 1 on wide screens (from 1024 px), so about 5 % of the
//      height is trimmed at the top and bottom there: keep important text and objects away from those edges.
//      Optionally a separate phone version (`mobile`), also 16 : 9.
//   2. Add an entry to PROMO_BANNERS below (copy the example), set `alt` in three languages — it must repeat the
//      text that is written on the image — and, if the banner should lead somewhere, `href`.
//   3. Commit and push: the banner appears after the next deployment. `npm test` checks that every file exists.
//
// While the list is empty the section is not shown. Do not put discounts, prices or dates on a banner: a real offer is a
// promotion in the admin panel. The "promo-2" banner ("Акции SALAMAT") is also shown on the promotions page while no
// promotion is published (PROMOTIONS_BANNER_ID).
import type { Locale } from "@/lib/i18n/config";

/** A path under /public, the same for all languages or one per language (e.g. text on the image). */
export type BannerSrc = string | Record<Locale, string>;

export interface PromoBanner {
  /** Unique, stable id (latin letters, digits, dashes). */
  id: string;
  /** Banner image, 16 : 9 (1920 × 1080 px recommended). */
  desktop: BannerSrc;
  /** Phone version, 16 : 9; usually the same file as `desktop`. */
  mobile: BannerSrc;
  /** Text alternative in every language: what the banner says (required for accessibility). */
  alt: Record<Locale, string>;
  /**
   * Where the banner leads, e.g. "/promotions/spring-vitamins" (a site path, the language prefix is added
   * automatically) or a full https:// address. Leave out for a banner without a link.
   */
  href?: string;
  /**
   * Text shown over the empty left part of the picture (below it on phones), with a button to `href`.
   * Every language is required. Only real, confirmed information: no invented discounts, prices or dates.
   */
  caption?: {
    title: Record<Locale, string>;
    text?: Record<Locale, string>;
    /** Button label; the button leads to `href`. */
    cta: Record<Locale, string>;
  };
}

/** Image sizes the banners are prepared for (used for layout and image optimisation). */
export const PROMO_BANNER_SIZE = {
  desktop: { width: 1920, height: 1080 },
  mobile: { width: 1920, height: 1080 },
} as const;

export const PROMO_BANNERS: PromoBanner[] = [
  {
    id: "promo-1",
    desktop: "/promo/promo-1.jpg",
    mobile: "/promo/promo-1.jpg",
    alt: {
      ru: "Карта Астаны с отметками аптек и аптечные товары",
      kk: "Дәріханалар белгіленген Астана картасы және дәріхана тауарлары",
      en: "A map of Astana with pharmacy pins and pharmacy products",
    },
    href: "/pharmacies",
    caption: {
      title: { ru: "Аптеки SALAMAT рядом с вами", kk: "SALAMAT дәріханалары жаныңызда", en: "SALAMAT pharmacies near you" },
      text: {
        ru: "Адреса, телефоны и часы работы аптек в Астане — в одном месте.",
        kk: "Астанадағы дәріханалардың мекенжайлары, телефондары мен жұмыс уақыты — бір жерде.",
        en: "Addresses, phone numbers and opening hours of pharmacies in Astana in one place.",
      },
      cta: { ru: "Найти аптеку", kk: "Дәріхана табу", en: "Find a pharmacy" },
    },
  },
  {
    id: "promo-2",
    desktop: "/promo/promo-2.jpg",
    mobile: "/promo/promo-2.jpg",
    alt: {
      ru: "Зелёная карта с аптечным крестом, монеты и подарок",
      kk: "Дәріхана кресі бар жасыл карта, тиындар және сыйлық",
      en: "A green card with a pharmacy cross, coins and a gift",
    },
    href: "/promotions",
    caption: {
      title: { ru: "Акции SALAMAT", kk: "SALAMAT акциялары", en: "SALAMAT offers" },
      text: {
        ru: "Условия и сроки каждой акции — на странице акций.",
        kk: "Әр акцияның шарттары мен мерзімдері — акциялар бетінде.",
        en: "The terms and dates of every offer are on the offers page.",
      },
      cta: { ru: "Смотреть акции", kk: "Акцияларды көру", en: "See offers" },
    },
  },
  {
    id: "promo-3",
    desktop: "/promo/promo-3.jpg",
    mobile: "/promo/promo-3.jpg",
    alt: {
      ru: "Пакет с аптечным крестом, смартфон с заказом и аптечные товары",
      kk: "Дәріхана кресі бар пакет, тапсырысы бар смартфон және дәріхана тауарлары",
      en: "A bag with a pharmacy cross, a smartphone with an order and pharmacy products",
    },
    href: "/catalog",
    caption: {
      title: { ru: "Закажите на сайте — заберите в аптеке", kk: "Сайттан тапсырыс беріп, дәріханадан алыңыз", en: "Order online, pick up at the pharmacy" },
      text: {
        ru: "Добавьте товары в корзину и выберите аптеку — сотрудник позвонит и подтвердит цену и наличие.",
        kk: "Тауарларды себетке қосып, дәріхананы таңдаңыз — қызметкер хабарласып, бағасы мен бар-жоғын растайды.",
        en: "Add products to the cart and choose a pharmacy: a pharmacist will call to confirm the price and availability.",
      },
      cta: { ru: "Открыть каталог", kk: "Каталогты ашу", en: "Open the catalogue" },
    },
  },
  {
    id: "promo-4",
    desktop: "/promo/promo-4.jpg",
    mobile: "/promo/promo-4.jpg",
    alt: {
      ru: "Фармацевт с планшетом и коробки с лекарствами",
      kk: "Планшеті бар фармацевт және дәрі қораптары",
      en: "A pharmacist with a tablet and boxes of medicines",
    },
    href: "/help",
    caption: {
      title: { ru: "Фармацевт подскажет", kk: "Фармацевт кеңес береді", en: "Ask a pharmacist" },
      text: {
        ru: "Не нашли нужное? Позвоните в справочную — подскажем, в какой аптеке есть нужный товар.",
        kk: "Қажетті тауарды таппадыңыз ба? Анықтамалыққа қоңырау шалыңыз — қай дәріханада бар екенін айтамыз.",
        en: "Can't find what you need? Call the helpline and we will tell you which pharmacy has it.",
      },
      cta: { ru: "Вопросы и ответы", kk: "Сұрақтар мен жауаптар", en: "Questions and answers" },
    },
  },
  // Next banner — uncomment and fill in when the file is in public/promo/:
  // {
  //   id: "promo-5",
  //   desktop: "/promo/promo-5.jpg",
  //   mobile: "/promo/promo-5.jpg",
  //   alt: {
  //     ru: "Текст, написанный на баннере",
  //     kk: "Баннерде жазылған мәтін",
  //     en: "The text written on the banner",
  //   },
  //   href: "/promotions",
  // },
];

/** The "Акции SALAMAT" banner, shown on the promotions page while no promotion is published. */
export const PROMOTIONS_BANNER_ID = "promo-2";

export function bannerSrc(src: BannerSrc, locale: Locale): string {
  return typeof src === "string" ? src : src[locale];
}
