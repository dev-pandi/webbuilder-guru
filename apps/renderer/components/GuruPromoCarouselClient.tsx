"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// GuruPromoCarouselClient — dynamic carousel dengan auto-play + navigasi
// interaktif. Replicate exact behavior mockup script.js:
//   - Auto-play 5 detik interval
//   - Prev/next buttons + dots clickable → reset timer
//   - Pause on hover/focus, resume on leave/blur
//   - Wrap around: (index + length) % length
//   - Smooth transition 0.45s ease via CSS transform
//
// Server component GuruPromoCarousel (di GuruBlocks.tsx) render wrapper +
// delegate ke client component ini untuk interaksi. Fallback SSR-friendly:
// tanpa JS pun slide pertama tetap visible (initial index=0 di-render).

type Slide = {
  image: string;
  alt?: string;
  href?: string;
  caption?: string;
};

const AUTOPLAY_MS = 5000;

export function GuruPromoCarouselClient({ items }: { items: Slide[] }) {
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const total = items.length;

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
      setIndex((prev) => (prev + 1) % total);
    }, AUTOPLAY_MS);
  }, [stopTimer, total]);

  useEffect(() => {
    startTimer();
    return stopTimer;
  }, [startTimer, stopTimer]);

  const goTo = useCallback(
    (nextIdx: number) => {
      // Wrap around modulo — safe untuk nilai negative (prev di slide 0).
      const wrapped = ((nextIdx % total) + total) % total;
      setIndex(wrapped);
      startTimer(); // reset timer per interaksi user (per mockup script)
    },
    [startTimer, total],
  );

  if (total === 0) return null;

  return (
    <div
      className="guru-promo__viewport"
      onMouseEnter={stopTimer}
      onMouseLeave={startTimer}
      onFocus={stopTimer}
      onBlur={startTimer}
    >
      <div
        className="guru-promo__track guru-promo__track--js"
        style={{ transform: `translateX(-${index * 100}%)` }}
        role="group"
        aria-roledescription="carousel"
        aria-label="Program & kegiatan"
      >
        {items.map((it, i) => {
          const alt = it.alt ?? it.caption ?? `Slide ${i + 1}`;
          const commonProps = {
            className: "guru-promo__slide",
            "aria-hidden": i !== index,
            "aria-label": alt,
          };
          const inner = (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={it.image}
              alt={alt}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
            />
          );
          return it.href ? (
            <a key={i} href={it.href} tabIndex={i === index ? 0 : -1} {...commonProps}>
              {inner}
            </a>
          ) : (
            <div key={i} role="img" {...commonProps}>
              {inner}
            </div>
          );
        })}
      </div>

      {total > 1 && (
        <>
          <button
            type="button"
            className="guru-promo__ctrl guru-promo__ctrl--prev"
            onClick={() => goTo(index - 1)}
            aria-label="Banner promosi sebelumnya"
          >
            ‹
          </button>
          <button
            type="button"
            className="guru-promo__ctrl guru-promo__ctrl--next"
            onClick={() => goTo(index + 1)}
            aria-label="Banner promosi berikutnya"
          >
            ›
          </button>
          <div className="guru-promo__dots" aria-label="Pilih banner promosi">
            {items.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`guru-promo__dot${i === index ? " is-active" : ""}`}
                onClick={() => goTo(i)}
                aria-label={`Tampilkan banner promosi ${i + 1}`}
                aria-current={i === index ? "true" : "false"}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
