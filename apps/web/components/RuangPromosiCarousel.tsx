"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type PortalBanner } from "@/lib/api";

// RuangPromosiCarousel — Carousel dark navy `#101d33` dengan fade+scale
// transition antar slide (mockup: opacity 0→1 + transform scale(1.012)→1
// dalam 450ms). Nav white circle 42px + backdrop-blur INSIDE carousel.
// Dots pill container di bottom dengan dark backdrop.
//
// Auto-play 5s, pause on hover/focus, wrap around, reset timer per user
// interaction — sesuai mockup script.
//
// Data: fetch dari `/public/portal/promotion-banners` (spec §6) — agregat
// banner efektif seluruh guru (teacher_active + admin_enabled + period valid).
// Fallback ke 3 asset lokal saat API kosong / gagal supaya section tidak
// terlihat "kosong" sebelum ada guru pertama yang aktif.

type PromoSlide = {
  image: string;
  alt: string;
  href?: string;
};

const FALLBACK_SLIDES: PromoSlide[] = [
  {
    image: "/assets/rdg/promo-adaptif.webp",
    alt: "Promosi Mengajar Lebih Adaptif di Era Digital",
    href: "#",
  },
  {
    image: "/assets/rdg/promo-karya.webp",
    alt: "Promosi Dari Pengalaman Mengajar Menjadi Karya",
    href: "#",
  },
  {
    image: "/assets/rdg/promo-inovasi.webp",
    alt: "Promosi Inovasi Pembelajaran yang Berdampak",
    href: "#",
  },
];

const AUTOPLAY_MS = 5000;

export function RuangPromosiCarousel() {
  const [slides, setSlides] = useState<PromoSlide[]>(FALLBACK_SLIDES);
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const total = slides.length;

  // Fetch banner cross-site dari portal endpoint. Kalau ada minimal 1 banner
  // hasil moderasi, replace fallback. Kalau kosong/gagal, keep fallback.
  useEffect(() => {
    let cancelled = false;
    api<PortalBanner[]>(`/public/portal/promotion-banners?limit=8`, {
      auth: false,
    })
      .then((banners) => {
        if (cancelled || !banners || banners.length === 0) return;
        setSlides(
          banners.map((b) => ({
            image: b.image_url,
            alt: b.alt_text,
            href: b.target_url,
          })),
        );
        setIndex(0);
      })
      .catch(() => {
        // silent — keep fallback
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    if (total <= 1) return;
    timerRef.current = setInterval(() => {
      setIndex((p) => (p + 1) % total);
    }, AUTOPLAY_MS);
  }, [stopTimer, total]);

  useEffect(() => {
    startTimer();
    return stopTimer;
  }, [startTimer, stopTimer]);

  const goTo = useCallback(
    (nextIdx: number) => {
      setIndex(((nextIdx % total) + total) % total);
      startTimer();
    },
    [startTimer, total],
  );

  return (
    <div
      className="relative aspect-[2/1] w-full overflow-hidden rounded-[26px] border border-[#e6e9ef] shadow-[0_24px_60px_rgba(24,34,53,.10)]"
      style={{ background: "#101d33" }}
      onMouseEnter={stopTimer}
      onMouseLeave={startTimer}
      onFocus={stopTimer}
      onBlur={startTimer}
      role="group"
      aria-roledescription="carousel"
      aria-label="Ruang Promosi Guru"
    >
      {/* Track — absolute slides with fade+scale transition (bukan translateX) */}
      <div className="relative size-full">
        {slides.map((s, i) => {
          const isActive = i === index;
          const inner = (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={s.image}
              alt={s.alt}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              className="size-full object-cover object-center"
            />
          );
          const slideClass = `absolute inset-0 m-0 transition-[opacity,transform,visibility] duration-[450ms] ease-out ${
            isActive
              ? "z-[2] scale-100 opacity-100 visible"
              : "invisible scale-[1.012] opacity-0"
          }`;
          return s.href ? (
            <a
              key={i}
              href={s.href}
              tabIndex={isActive ? 0 : -1}
              aria-hidden={!isActive}
              aria-label={s.alt}
              className={`${slideClass} block focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-white/90 focus-visible:outline-offset-[-5px] focus-visible:rounded-[22px]`}
            >
              {inner}
            </a>
          ) : (
            <div
              key={i}
              className={slideClass}
              aria-hidden={!isActive}
              role="img"
              aria-label={s.alt}
            >
              {inner}
            </div>
          );
        })}
      </div>

      {/* Nav buttons — white circle 42px with border + dark backdrop blur */}
      <button
        type="button"
        onClick={() => goTo(index - 1)}
        aria-label="Promosi sebelumnya"
        className="absolute left-[14px] top-1/2 z-[8] grid size-[42px] -translate-y-1/2 place-items-center rounded-full border border-white/30 text-[1.75rem] leading-none text-white backdrop-blur-[8px] transition-colors hover:brightness-110"
        style={{ background: "rgba(9,24,45,.68)" }}
      >
        ‹
      </button>
      <button
        type="button"
        onClick={() => goTo(index + 1)}
        aria-label="Promosi berikutnya"
        className="absolute right-[14px] top-1/2 z-[8] grid size-[42px] -translate-y-1/2 place-items-center rounded-full border border-white/30 text-[1.75rem] leading-none text-white backdrop-blur-[8px] transition-colors hover:brightness-110"
        style={{ background: "rgba(9,24,45,.68)" }}
      >
        ›
      </button>

      {/* Dots — pill container with dark backdrop blur */}
      <div
        className="absolute bottom-3 left-1/2 z-[9] flex -translate-x-1/2 gap-[7px] rounded-full px-2 py-1.5 backdrop-blur-[8px]"
        style={{ background: "rgba(7,18,35,.44)" }}
        aria-label="Pilih promosi"
      >
        {slides.map((_, i) => {
          const isActive = i === index;
          return (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Promosi ${i + 1}`}
              aria-pressed={isActive}
              className={`h-2 rounded-full transition-all duration-250 ${
                isActive
                  ? "w-[25px] bg-white"
                  : "w-2 bg-white/55 hover:bg-white/75"
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}
