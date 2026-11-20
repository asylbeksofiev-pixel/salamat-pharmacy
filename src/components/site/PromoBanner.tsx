"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { getImageProps } from "next/image";
import { useSite } from "./SiteProvider";
import { Icon } from "../icons";

const images = [
  { desktop: "/promo/promo-1-desktop.png", mobile: "/promo/promo-1-mobile.webp" },
  { desktop: "/promo/promo-2-desktop.png", mobile: "/promo/promo-2-mobile.png" },
];

export function PromoBanner() {
  const { locale, href, t } = useSite();
  const [active, setActive] = useState(0);
  const id = useId();
  const kk = locale === "kk";
  const slides = [
    { title: t.home.heroTitle, text: kk ? "Астанадағы SALAMAT дәріханаларынан қажетті тауарды табыңыз." : "Найдите нужный товар в аптеках SALAMAT в Астане.", action: t.common.catalog, path: "/catalog" },
    { title: kk ? "Жақын дәріханаңызды таңдаңыз" : "Выберите аптеку рядом", text: kk ? "Мекенжайлар мен телефондар — бір жерде." : "Адреса и телефоны аптек — в одном месте.", action: t.common.pharmacies, path: "/pharmacies" },
  ];

  return (
    <section className="container-page pt-5 pb-3 sm:pt-8" aria-label={kk ? "SALAMAT баннерлері" : "Баннеры SALAMAT"} aria-roledescription="слайдер">
      <div className="overflow-hidden rounded-[var(--radius-2xl)] border border-line bg-brand-50">
        <div className="grid" onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            setActive((value) => (value + 1) % images.length);
          }
        }}>
          {slides.map((slide, index) => {
            const common = { alt: "", width: 1672, height: 941, sizes: "(max-width: 1280px) 100vw, 1280px", quality: 75 };
            const { props: desktop } = getImageProps({ ...common, src: images[index].desktop });
            const { props: mobile } = getImageProps({ ...common, src: images[index].mobile });
            return (
              <div key={slide.path} id={`${id}-${index}`} role="group" aria-roledescription="слайд" aria-label={`${index + 1} / ${slides.length}`} aria-hidden={index !== active} inert={index !== active} className="sal-promo-slide relative col-start-1 row-start-1" data-active={index === active || undefined} style={{ opacity: index === active ? 1 : 0, visibility: index === active ? "visible" : "hidden", transition: "opacity 280ms var(--ease-out-soft), visibility 280ms" }}>
                <picture>
                  <source media="(min-width: 768px)" srcSet={desktop.srcSet} sizes={desktop.sizes} />
                  <img {...mobile} alt="" loading={index === 0 ? "eager" : "lazy"} fetchPriority={index === 0 ? "high" : "auto"} className="block aspect-[1672/941] w-full object-contain" />
                </picture>
                <div className="flex flex-col items-start gap-3 px-5 pt-2 pb-6 md:absolute md:inset-y-0 md:left-[5%] md:w-[34%] md:justify-center md:p-0">
                  <h2 className="text-2xl leading-tight font-bold tracking-tight text-brand-900 lg:text-4xl">{slide.title}</h2>
                  <p className="max-w-sm text-sm text-ink-soft lg:text-base">{slide.text}</p>
                  <Link href={href(slide.path)} className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] bg-brand-600 px-5 font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
                    {slide.action}<Icon name="chevronRight" size={18} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-center gap-3 border-t border-brand-100 bg-white/80 px-4 py-2">
          <button type="button" aria-label={kk ? "Алдыңғы баннер" : "Предыдущий баннер"} onClick={() => setActive((value) => (value + 1) % slides.length)} className="grid size-11 place-items-center rounded-full text-brand-800 hover:bg-brand-50"><Icon name="chevronLeft" size={20} /></button>
          {slides.map((slide, index) => (
            <button key={slide.path} type="button" aria-label={`Баннер ${index + 1}`} aria-pressed={index === active} aria-controls={`${id}-${index}`} onClick={() => setActive(index)} className="grid size-11 place-items-center rounded-full hover:bg-brand-50">
              <span className={`h-2 rounded-full transition-[width,background-color] duration-200 ${index === active ? "w-6 bg-brand-600" : "w-2 bg-brand-200"}`} />
            </button>
          ))}
          <button type="button" aria-label={kk ? "Келесі баннер" : "Следующий баннер"} onClick={() => setActive((value) => (value + 1) % slides.length)} className="grid size-11 place-items-center rounded-full text-brand-800 hover:bg-brand-50"><Icon name="chevronRight" size={20} /></button>
        </div>
      </div>
    </section>
  );
}
