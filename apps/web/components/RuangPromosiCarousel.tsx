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
// Data: fetch dari `/public/portal/promotion-banners` (spec §6). Backend
// filter (banners/repo.go ListEligibleForPortal):
//   - portal_active = true  ← guru pilih 1 banner untuk landing portal
//   - teacher_active = true ← banner aktif di website guru
//   - admin_enabled = true  ← admin approve
//   - periode valid (start_at ≤ now ≤ end_at)
//   - site.status = 'published'
// Max 1 banner per guru (partial unique index) → carousel fair display.
//
// Fallback slides = 3 asset lokal demo, dipakai HANYA kalau API error atau
// belum ada guru yang set portal_active (empty response). Empty state
// dedicated ditampilkan kalau `emptyFromServer` (bukan fallback demo).

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
  const [emptyFromServer, setEmptyFromServer] = useState(false);
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const total = slides.length;

  // Fetch portal banner. State branch:
  //   - success + non-empty → set slides dari API (guru banners)
  //   - success + empty     → tampilkan empty state (belum ada guru pasang)
  //   - error               → keep fallback demo (defense: section tidak blank)
  useEffect(() => {
    let cancelled = false;
    api<PortalBanner[]>(`/public/portal/promotion-banners?limit=8`, {
      auth: false,
    })
      .then((banners) => {
        if (cancelled) return;
        if (!banners || banners.length === 0) {
          setEmptyFromServer(true);
          return;
        }
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
        // silent — keep fallback (network error, don't show empty state)
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

  // Empty state — API balik 0 banner (belum ada guru pasang portal_active).
  // Tampilkan card ajakan bukan fallback demo yang misleading.
  if (emptyFromServer) {
    return (
      <div
        className="relative flex aspect-[2/1] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-[26px] border border-[#e6e9ef] px-6 py-8 text-center shadow-[0_24px_60px_rgba(24,34,53,.10)]"
        style={{ background: "#101d33" }}
        role="img"
        aria-label="Belum ada banner promosi dari guru"
      >
        <div className="text-white/40 text-xs font-extrabold uppercase tracking-[.12em]">
          Ruang Promosi Portal
        </div>
        <h3 className="max-w-md text-[1.15rem] font-extrabold leading-snug text-white sm:text-[1.4rem]">
          Belum ada banner promosi dari guru
        </h3>
        <p className="max-w-md text-[.85rem] leading-relaxed text-white/70">
          Guru dapat memilih 1 banner untuk tampil di sini lewat menu{" "}
          <strong className="text-white">Ruang Promosi</strong> di dashboard
          masing-masing.
        </p>
      </div>
    );
  }

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
