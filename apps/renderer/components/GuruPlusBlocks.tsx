// GuruPlusBlocks.tsx — set block modern "Guru Plus" sebagai extensi dari
// template core "Rumah Digital Guru" (GuruBlocks.tsx).
//
// Prinsip:
//   - Zero library tambahan: pure CSS + IntersectionObserver untuk motion.
//   - Semua warna pakai --guru-* CSS vars (otomatis ikut theme user).
//   - Respect prefers-reduced-motion.
//   - Satu <style> inject per Blocks root (via GuruPlusStyles).
//   - Server-render by default; counter/timeline reveal diaktifkan client-side
//     lewat tiny inline script helpers.
//
// Phase 1 (5 block):
//   1. GuruPlusFAQ         — accordion elegan dengan nomor besar
//   2. GuruPlusStats       — counting-up numbers on scroll
//   3. GuruPlusTimeline    — vertical timeline dengan dot connector
//   4. GuruPlusTestimonials — masonry wall of quotes
//   5. GuruPlusMarquee     — scrolling horizontal text / items

"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

// ----------------------------------------------------------------------------
// 1. GuruPlusFAQ — accordion dengan nomor besar (01, 02, 03...)
// ----------------------------------------------------------------------------

export function GuruPlusFAQ(p: {
  eyebrow?: string;
  title?: string;
  items?: Array<{ q: string; a: string }>;
}) {
  const items = p.items ?? [];
  return (
    <section className="guruplus-faq">
      <div className="guru-container">
        {(p.eyebrow || p.title) && (
          <div className="guruplus-faq__head">
            {p.eyebrow ? <div className="guru-eyebrow">{p.eyebrow}</div> : null}
            {p.title ? <h2>{p.title}</h2> : null}
          </div>
        )}
        <div className="guruplus-faq__list">
          {items.map((it, i) => (
            <details key={i} className="guruplus-faq__item">
              <summary>
                <span className="guruplus-faq__num">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="guruplus-faq__q">{it.q}</span>
                <span className="guruplus-faq__chev" aria-hidden>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </summary>
              <div className="guruplus-faq__a">
                <p>{it.a}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// 2. GuruPlusStats — counting-up numbers on scroll
// ----------------------------------------------------------------------------

export function GuruPlusStats(p: {
  eyebrow?: string;
  title?: string;
  // value bisa number (dari defaults) atau string (hasil edit PropEditor).
  items?: Array<{ value: number | string; suffix?: string; label: string }>;
}) {
  const items = p.items ?? [];
  return (
    <section className="guruplus-stats">
      <div className="guru-container">
        {(p.eyebrow || p.title) && (
          <div className="guruplus-stats__head">
            {p.eyebrow ? <div className="guru-eyebrow">{p.eyebrow}</div> : null}
            {p.title ? <h2>{p.title}</h2> : null}
          </div>
        )}
        <div className="guruplus-stats__grid">
          {items.map((it, i) => (
            <StatCard
              key={i}
              value={toNum(it.value)}
              suffix={it.suffix}
              label={it.label}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function toNum(v: number | string | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return 0;
  // Strip non-numeric chars (commas, dots used as thousand sep in id-ID).
  const n = parseFloat(v.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function StatCard({ value, suffix, label }: { value: number; suffix?: string; label: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const triggered = useRef(false);

  useEffect(() => {
    if (!ref.current || triggered.current) return;
    // Respect prefers-reduced-motion — langsung set final value tanpa animasi.
    const prefersReduced = typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setDisplay(value);
      triggered.current = true;
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting || triggered.current) return;
          triggered.current = true;
          // Count-up dengan easeOutQuad, 1200ms.
          const start = performance.now();
          const duration = 1200;
          const tick = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - (1 - t) * (1 - t);
            setDisplay(Math.round(value * eased));
            if (t < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      },
      { threshold: 0.4 },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [value]);

  return (
    <div ref={ref} className="guruplus-stats__card">
      <div className="guruplus-stats__num">
        {display.toLocaleString("id-ID")}
        {suffix ? <span className="guruplus-stats__suffix">{suffix}</span> : null}
      </div>
      <div className="guruplus-stats__label">{label}</div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 3. GuruPlusTimeline — vertical timeline dengan dot connector
// ----------------------------------------------------------------------------

export function GuruPlusTimeline(p: {
  eyebrow?: string;
  title?: string;
  items?: Array<{ year: string; title: string; desc?: string }>;
}) {
  const items = p.items ?? [];
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      // Langsung reveal all tanpa observer.
      containerRef.current.querySelectorAll(".guruplus-tl__item").forEach((el) => {
        el.classList.add("is-visible");
      });
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.3 },
    );
    containerRef.current.querySelectorAll(".guruplus-tl__item").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <section className="guruplus-timeline">
      <div className="guru-container">
        {(p.eyebrow || p.title) && (
          <div className="guruplus-timeline__head">
            {p.eyebrow ? <div className="guru-eyebrow">{p.eyebrow}</div> : null}
            {p.title ? <h2>{p.title}</h2> : null}
          </div>
        )}
        <div ref={containerRef} className="guruplus-tl">
          {items.map((it, i) => (
            <div key={i} className="guruplus-tl__item">
              <div className="guruplus-tl__dot" aria-hidden />
              <div className="guruplus-tl__content">
                <div className="guruplus-tl__year">{it.year}</div>
                <h3 className="guruplus-tl__title">{it.title}</h3>
                {it.desc ? <p className="guruplus-tl__desc">{it.desc}</p> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// 4. GuruPlusTestimonials — masonry wall of quotes
// ----------------------------------------------------------------------------

export function GuruPlusTestimonials(p: {
  eyebrow?: string;
  title?: string;
  items?: Array<{ quote: string; author: string; role?: string; avatar?: string }>;
}) {
  const items = p.items ?? [];
  return (
    <section className="guruplus-testi">
      <div className="guru-container">
        {(p.eyebrow || p.title) && (
          <div className="guruplus-testi__head">
            {p.eyebrow ? <div className="guru-eyebrow">{p.eyebrow}</div> : null}
            {p.title ? <h2>{p.title}</h2> : null}
          </div>
        )}
        <div className="guruplus-testi__grid">
          {items.map((it, i) => (
            <figure key={i} className="guruplus-testi__card">
              <blockquote>&ldquo;{it.quote}&rdquo;</blockquote>
              <figcaption>
                {it.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.avatar} alt={it.author} className="guruplus-testi__avatar" />
                ) : (
                  <span className="guruplus-testi__avatar guruplus-testi__avatar--initials">
                    {initials(it.author)}
                  </span>
                )}
                <span>
                  <strong>{it.author}</strong>
                  {it.role ? <small>{it.role}</small> : null}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

// ----------------------------------------------------------------------------
// 5. GuruPlusMarquee — scrolling horizontal text/items (pure CSS)
// ----------------------------------------------------------------------------

export function GuruPlusMarquee(p: {
  items?: string[];
  speed?: "slow" | "normal" | "fast";
}) {
  const items = p.items ?? [];
  if (items.length === 0) return null;
  // Duplikasi list supaya loop seamless tanpa jump.
  const doubled = [...items, ...items];
  const speedClass = `guruplus-marquee--${p.speed ?? "normal"}`;
  return (
    <section className={`guruplus-marquee ${speedClass}`}>
      <div className="guruplus-marquee__track">
        {doubled.map((it, i) => (
          <span key={i} className="guruplus-marquee__item">
            <span className="guruplus-marquee__dot" aria-hidden>
              ✦
            </span>
            {it}
          </span>
        ))}
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// 6. GuruPlusBookshelf — rak buku rekomendasi guru
// ----------------------------------------------------------------------------

export function GuruPlusBookshelf(p: {
  eyebrow?: string;
  title?: string;
  items?: Array<{ title: string; author?: string; cover?: string; year?: string; note?: string }>;
}) {
  const items = p.items ?? [];
  return (
    <section className="guruplus-shelf">
      <div className="guru-container">
        {(p.eyebrow || p.title) && (
          <div className="guruplus-shelf__head">
            {p.eyebrow ? <div className="guru-eyebrow">{p.eyebrow}</div> : null}
            {p.title ? <h2>{p.title}</h2> : null}
          </div>
        )}
        <div className="guruplus-shelf__grid">
          {items.map((it, i) => (
            <article key={i} className="guruplus-shelf__card">
              <div className="guruplus-shelf__cover">
                {it.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.cover} alt={it.title} loading="lazy" />
                ) : (
                  <div className="guruplus-shelf__fallback">
                    <span>{initials(it.title)}</span>
                  </div>
                )}
              </div>
              <div className="guruplus-shelf__body">
                <h3 className="guruplus-shelf__title">{it.title}</h3>
                {it.author ? <div className="guruplus-shelf__author">{it.author}</div> : null}
                {it.year ? <div className="guruplus-shelf__year">{it.year}</div> : null}
                {it.note ? <p className="guruplus-shelf__note">{it.note}</p> : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// 7. GuruPlusVideoEmbed — lazy YouTube/Vimeo gallery
// ----------------------------------------------------------------------------

export function GuruPlusVideoEmbed(p: {
  eyebrow?: string;
  title?: string;
  items?: Array<{ url: string; title: string; description?: string; thumbnail?: string }>;
}) {
  const items = p.items ?? [];
  return (
    <section className="guruplus-video">
      <div className="guru-container">
        {(p.eyebrow || p.title) && (
          <div className="guruplus-video__head">
            {p.eyebrow ? <div className="guru-eyebrow">{p.eyebrow}</div> : null}
            {p.title ? <h2>{p.title}</h2> : null}
          </div>
        )}
        <div className="guruplus-video__grid">
          {items.map((it, i) => (
            <VideoCard key={i} url={it.url} title={it.title} description={it.description} thumbnail={it.thumbnail} />
          ))}
        </div>
      </div>
    </section>
  );
}

function VideoCard({
  url,
  title,
  description,
  thumbnail,
}: {
  url: string;
  title: string;
  description?: string;
  thumbnail?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const embed = toEmbedUrl(url);
  const thumb = thumbnail || youtubeThumbnail(url);

  return (
    <article className="guruplus-video__card">
      <div className="guruplus-video__frame">
        {!playing ? (
          <button
            type="button"
            className="guruplus-video__thumb"
            onClick={() => setPlaying(true)}
            aria-label={`Putar: ${title}`}
          >
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt={title} loading="lazy" />
            ) : (
              <div className="guruplus-video__thumb-fallback" />
            )}
            <span className="guruplus-video__play" aria-hidden>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </button>
        ) : (
          <iframe
            src={embed + (embed.includes("?") ? "&" : "?") + "autoplay=1"}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        )}
      </div>
      <div className="guruplus-video__body">
        <h3 className="guruplus-video__title">{title}</h3>
        {description ? <p className="guruplus-video__desc">{description}</p> : null}
      </div>
    </article>
  );
}

function toEmbedUrl(url: string): string {
  // YouTube: watch?v=ID → embed/ID
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  // Vimeo: vimeo.com/ID → player.vimeo.com/video/ID
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return url;
}

function youtubeThumbnail(url: string): string {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  return yt ? `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg` : "";
}

// ----------------------------------------------------------------------------
// 8. GuruPlusPhotoEssay — foto essay asymmetric grid
// ----------------------------------------------------------------------------

export function GuruPlusPhotoEssay(p: {
  eyebrow?: string;
  title?: string;
  items?: Array<{ image: string; caption?: string; meta?: string }>;
}) {
  const items = p.items ?? [];
  return (
    <section className="guruplus-photos">
      <div className="guru-container">
        {(p.eyebrow || p.title) && (
          <div className="guruplus-photos__head">
            {p.eyebrow ? <div className="guru-eyebrow">{p.eyebrow}</div> : null}
            {p.title ? <h2>{p.title}</h2> : null}
          </div>
        )}
        <div className="guruplus-photos__grid">
          {items.map((it, i) => (
            <figure
              key={i}
              className={`guruplus-photos__cell guruplus-photos__cell--${i % 6}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.image} alt={it.caption ?? ""} loading="lazy" />
              {(it.caption || it.meta) && (
                <figcaption>
                  {it.caption ? <span className="guruplus-photos__cap">{it.caption}</span> : null}
                  {it.meta ? <span className="guruplus-photos__meta">{it.meta}</span> : null}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// 9. GuruPlusAudioEpisode — audio episode list dengan HTML5 player
// ----------------------------------------------------------------------------

export function GuruPlusAudioEpisode(p: {
  eyebrow?: string;
  title?: string;
  items?: Array<{ title: string; src: string; duration?: string; description?: string; cover?: string }>;
}) {
  const items = p.items ?? [];
  return (
    <section className="guruplus-audio">
      <div className="guru-container">
        {(p.eyebrow || p.title) && (
          <div className="guruplus-audio__head">
            {p.eyebrow ? <div className="guru-eyebrow">{p.eyebrow}</div> : null}
            {p.title ? <h2>{p.title}</h2> : null}
          </div>
        )}
        <ul className="guruplus-audio__list">
          {items.map((it, i) => (
            <li key={i} className="guruplus-audio__row">
              <div className="guruplus-audio__cover">
                {it.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.cover} alt={it.title} loading="lazy" />
                ) : (
                  <span className="guruplus-audio__num">{String(i + 1).padStart(2, "0")}</span>
                )}
              </div>
              <div className="guruplus-audio__body">
                <div className="guruplus-audio__meta">
                  <h3 className="guruplus-audio__title">{it.title}</h3>
                  {it.duration ? (
                    <span className="guruplus-audio__dur">{it.duration}</span>
                  ) : null}
                </div>
                {it.description ? (
                  <p className="guruplus-audio__desc">{it.description}</p>
                ) : null}
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <audio controls preload="none" src={it.src} className="guruplus-audio__player" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// 10. GuruPlusCertificateGrid — grid sertifikat/penghargaan
// ----------------------------------------------------------------------------

export function GuruPlusCertificateGrid(p: {
  eyebrow?: string;
  title?: string;
  items?: Array<{ title: string; issuer?: string; date?: string; image?: string; href?: string }>;
}) {
  const items = p.items ?? [];
  return (
    <section className="guruplus-certs">
      <div className="guru-container">
        {(p.eyebrow || p.title) && (
          <div className="guruplus-certs__head">
            {p.eyebrow ? <div className="guru-eyebrow">{p.eyebrow}</div> : null}
            {p.title ? <h2>{p.title}</h2> : null}
          </div>
        )}
        <div className="guruplus-certs__grid">
          {items.map((it, i) => {
            const Wrap = (it.href ? "a" : "div") as "a" | "div";
            return (
              <Wrap
                key={i}
                {...(it.href ? { href: it.href, target: "_blank", rel: "noopener noreferrer" } : {})}
                className="guruplus-certs__card"
              >
                <div className="guruplus-certs__image">
                  {it.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.image} alt={it.title} loading="lazy" />
                  ) : (
                    <div className="guruplus-certs__ribbon" aria-hidden>
                      <svg viewBox="0 0 48 48" fill="none">
                        <circle cx="24" cy="20" r="12" stroke="currentColor" strokeWidth="2" />
                        <path d="M18 30l-4 14 10-6 10 6-4-14" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="guruplus-certs__body">
                  <h3 className="guruplus-certs__title">{it.title}</h3>
                  {it.issuer ? <div className="guruplus-certs__issuer">{it.issuer}</div> : null}
                  {it.date ? <div className="guruplus-certs__date">{it.date}</div> : null}
                </div>
              </Wrap>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// 11. GuruPlusBeforeAfter — image slider comparison (draggable divider)
// ----------------------------------------------------------------------------

export function GuruPlusBeforeAfter(p: {
  eyebrow?: string;
  title?: string;
  beforeImage?: string;
  afterImage?: string;
  beforeLabel?: string;
  afterLabel?: string;
  caption?: string;
}) {
  const [pos, setPos] = useState(50);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const onMove = (clientX: number) => {
      if (!dragging.current || !wrapRef.current) return;
      const r = wrapRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(r.width, clientX - r.left));
      setPos((x / r.width) * 100);
    };
    const onMouseMove = (e: MouseEvent) => onMove(e.clientX);
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) onMove(e.touches[0].clientX);
    };
    const onEnd = () => {
      dragging.current = false;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchend", onEnd);
    };
  }, []);

  const startDrag = () => {
    dragging.current = true;
  };

  if (!p.beforeImage || !p.afterImage) return null;

  return (
    <section className="guruplus-ba">
      <div className="guru-container">
        {(p.eyebrow || p.title) && (
          <div className="guruplus-ba__head">
            {p.eyebrow ? <div className="guru-eyebrow">{p.eyebrow}</div> : null}
            {p.title ? <h2>{p.title}</h2> : null}
          </div>
        )}
        <div
          ref={wrapRef}
          className="guruplus-ba__wrap"
          onMouseDown={startDrag}
          onTouchStart={startDrag}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.afterImage} alt={p.afterLabel ?? "Sesudah"} className="guruplus-ba__img" />
          <div
            className="guruplus-ba__clip"
            style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.beforeImage} alt={p.beforeLabel ?? "Sebelum"} className="guruplus-ba__img" />
          </div>
          <div className="guruplus-ba__divider" style={{ left: `${pos}%` }}>
            <div className="guruplus-ba__handle" aria-label="Geser untuk membandingkan" role="slider" aria-valuenow={Math.round(pos)}>
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path d="M5 7l-3 3 3 3v-6zM15 7l3 3-3 3v-6z" />
              </svg>
            </div>
          </div>
          <span className="guruplus-ba__label guruplus-ba__label--before">
            {p.beforeLabel ?? "Sebelum"}
          </span>
          <span className="guruplus-ba__label guruplus-ba__label--after">
            {p.afterLabel ?? "Sesudah"}
          </span>
        </div>
        {p.caption ? <p className="guruplus-ba__caption">{p.caption}</p> : null}
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// 12. GuruPlusLessonCard — kartu pelajaran dengan level + durasi
// ----------------------------------------------------------------------------

export function GuruPlusLessonCard(p: {
  eyebrow?: string;
  title?: string;
  items?: Array<{
    title: string;
    level?: string;
    duration?: string;
    description?: string;
    icon?: string;
    href?: string;
    ctaLabel?: string;
  }>;
}) {
  const items = p.items ?? [];
  return (
    <section className="guruplus-lesson">
      <div className="guru-container">
        {(p.eyebrow || p.title) && (
          <div className="guruplus-lesson__head">
            {p.eyebrow ? <div className="guru-eyebrow">{p.eyebrow}</div> : null}
            {p.title ? <h2>{p.title}</h2> : null}
          </div>
        )}
        <div className="guruplus-lesson__grid">
          {items.map((it, i) => (
            <article key={i} className="guruplus-lesson__card">
              <div className="guruplus-lesson__icon" aria-hidden>
                {it.icon || "📘"}
              </div>
              <div className="guruplus-lesson__badges">
                {it.level ? <span className="guruplus-lesson__level">{it.level}</span> : null}
                {it.duration ? <span className="guruplus-lesson__dur">{it.duration}</span> : null}
              </div>
              <h3 className="guruplus-lesson__title">{it.title}</h3>
              {it.description ? <p className="guruplus-lesson__desc">{it.description}</p> : null}
              {it.href ? (
                <a href={it.href} className="guruplus-lesson__cta">
                  {it.ctaLabel || "Mulai belajar"}
                  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                    <path d="M7 5l6 5-6 5V5z" />
                  </svg>
                </a>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// 13. GuruPlusMapLocation — peta lokasi (OpenStreetMap embed)
// ----------------------------------------------------------------------------

export function GuruPlusMapLocation(p: {
  eyebrow?: string;
  title?: string;
  address?: string;
  lat?: number | string;
  lon?: number | string;
  zoom?: number | string;
  directionsHref?: string;
}) {
  const lat = typeof p.lat === "string" ? parseFloat(p.lat) : p.lat ?? -6.2;
  const lon = typeof p.lon === "string" ? parseFloat(p.lon) : p.lon ?? 106.816666;
  const zoom = typeof p.zoom === "string" ? parseInt(p.zoom, 10) : p.zoom ?? 14;
  // OpenStreetMap bbox embed (approx 0.01 deg per side at zoom 14).
  const delta = 0.02 / Math.max(1, (zoom - 10));
  const bbox = `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;

  return (
    <section className="guruplus-map">
      <div className="guru-container">
        {(p.eyebrow || p.title) && (
          <div className="guruplus-map__head">
            {p.eyebrow ? <div className="guru-eyebrow">{p.eyebrow}</div> : null}
            {p.title ? <h2>{p.title}</h2> : null}
          </div>
        )}
        <div className="guruplus-map__wrap">
          <iframe
            src={src}
            title={p.title || "Peta lokasi"}
            loading="lazy"
            className="guruplus-map__frame"
          />
          {(p.address || p.directionsHref) && (
            <div className="guruplus-map__panel">
              {p.address ? (
                <>
                  <div className="guruplus-map__label">Alamat</div>
                  <p className="guruplus-map__address">{p.address}</p>
                </>
              ) : null}
              {p.directionsHref ? (
                <a href={p.directionsHref} target="_blank" rel="noopener noreferrer" className="guruplus-map__cta">
                  Lihat petunjuk arah
                  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                    <path d="M7 3l10 7-10 7V3z" />
                  </svg>
                </a>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// 14. GuruPlusSkillBars — progress bars untuk skill/fokus
// ----------------------------------------------------------------------------

export function GuruPlusSkillBars(p: {
  eyebrow?: string;
  title?: string;
  items?: Array<{ label: string; value: number | string; note?: string }>;
}) {
  const items = p.items ?? [];
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const bars = containerRef.current.querySelectorAll<HTMLElement>(".guruplus-skill__fill");
    if (prefersReduced) {
      bars.forEach((el) => {
        el.style.width = el.dataset.target || "0%";
      });
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const el = e.target as HTMLElement;
          const bar = el.querySelector<HTMLElement>(".guruplus-skill__fill");
          if (bar) bar.style.width = bar.dataset.target || "0%";
          io.unobserve(e.target);
        });
      },
      { threshold: 0.3 },
    );
    containerRef.current.querySelectorAll(".guruplus-skill").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <section className="guruplus-skills">
      <div className="guru-container">
        {(p.eyebrow || p.title) && (
          <div className="guruplus-skills__head">
            {p.eyebrow ? <div className="guru-eyebrow">{p.eyebrow}</div> : null}
            {p.title ? <h2>{p.title}</h2> : null}
          </div>
        )}
        <div ref={containerRef} className="guruplus-skills__list">
          {items.map((it, i) => {
            const v = Math.max(0, Math.min(100, toNum(it.value)));
            return (
              <div key={i} className="guruplus-skill">
                <div className="guruplus-skill__meta">
                  <span className="guruplus-skill__label">{it.label}</span>
                  <span className="guruplus-skill__value">{v}%</span>
                </div>
                <div className="guruplus-skill__track">
                  <div className="guruplus-skill__fill" data-target={`${v}%`} />
                </div>
                {it.note ? <div className="guruplus-skill__note">{it.note}</div> : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// 15. GuruPlusAwardShowcase — showcase penghargaan dengan medal icons
// ----------------------------------------------------------------------------

export function GuruPlusAwardShowcase(p: {
  eyebrow?: string;
  title?: string;
  items?: Array<{ rank?: string; title: string; subtitle?: string; year?: string; icon?: string }>;
}) {
  const items = p.items ?? [];
  return (
    <section className="guruplus-awards">
      <div className="guru-container">
        {(p.eyebrow || p.title) && (
          <div className="guruplus-awards__head">
            {p.eyebrow ? <div className="guru-eyebrow">{p.eyebrow}</div> : null}
            {p.title ? <h2>{p.title}</h2> : null}
          </div>
        )}
        <div className="guruplus-awards__grid">
          {items.map((it, i) => (
            <article key={i} className={`guruplus-award guruplus-award--${rankVariant(it.rank, i)}`}>
              <div className="guruplus-award__medal" aria-hidden>
                {it.icon || medalEmoji(it.rank, i)}
              </div>
              {it.rank ? <div className="guruplus-award__rank">{it.rank}</div> : null}
              <h3 className="guruplus-award__title">{it.title}</h3>
              {it.subtitle ? <p className="guruplus-award__sub">{it.subtitle}</p> : null}
              {it.year ? <div className="guruplus-award__year">{it.year}</div> : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function rankVariant(rank: string | undefined, idx: number): string {
  const r = (rank || "").toLowerCase();
  if (r.includes("gold") || r.includes("1") || r.includes("emas") || (idx === 0 && !rank)) return "gold";
  if (r.includes("silver") || r.includes("2") || r.includes("perak") || (idx === 1 && !rank)) return "silver";
  if (r.includes("bronze") || r.includes("3") || r.includes("perunggu") || (idx === 2 && !rank)) return "bronze";
  return "default";
}

function medalEmoji(rank: string | undefined, idx: number): string {
  const v = rankVariant(rank, idx);
  if (v === "gold") return "🥇";
  if (v === "silver") return "🥈";
  if (v === "bronze") return "🥉";
  return "🏅";
}

// ----------------------------------------------------------------------------
// 16. GuruPlusContactCTA — big call-to-action dengan contact info
// ----------------------------------------------------------------------------

export function GuruPlusContactCTA(p: {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaHref?: string;
  ctaSecondaryLabel?: string;
  ctaSecondaryHref?: string;
  contacts?: Array<{ icon?: string; label: string; value: string; href?: string }>;
  variant?: "navy" | "cream";
}) {
  const variant = p.variant ?? "navy";
  return (
    <section className={`guruplus-cta guruplus-cta--${variant}`}>
      <div className="guru-container">
        <div className="guruplus-cta__inner">
          <div className="guruplus-cta__text">
            {p.eyebrow ? <div className="guruplus-cta__eyebrow">{p.eyebrow}</div> : null}
            {p.title ? <h2 className="guruplus-cta__title">{p.title}</h2> : null}
            {p.subtitle ? <p className="guruplus-cta__sub">{p.subtitle}</p> : null}
            <div className="guruplus-cta__btns">
              {p.ctaLabel && p.ctaHref ? (
                <a href={p.ctaHref} className="guruplus-cta__btn guruplus-cta__btn--primary">
                  {p.ctaLabel}
                </a>
              ) : null}
              {p.ctaSecondaryLabel && p.ctaSecondaryHref ? (
                <a href={p.ctaSecondaryHref} className="guruplus-cta__btn guruplus-cta__btn--ghost">
                  {p.ctaSecondaryLabel}
                </a>
              ) : null}
            </div>
          </div>
          {p.contacts && p.contacts.length > 0 ? (
            <ul className="guruplus-cta__contacts">
              {p.contacts.map((c, i) => {
                const inner = (
                  <>
                    <span className="guruplus-cta__contact-icon" aria-hidden>{c.icon || "•"}</span>
                    <span>
                      <small>{c.label}</small>
                      <strong>{c.value}</strong>
                    </span>
                  </>
                );
                return (
                  <li key={i} className="guruplus-cta__contact">
                    {c.href ? <a href={c.href}>{inner}</a> : <div>{inner}</div>}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// 17. GuruPlusBookingSlot — grid slot konsultasi (available / booked)
// ----------------------------------------------------------------------------

export function GuruPlusBookingSlot(p: {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  slots?: Array<{ day?: string; time: string; status?: "available" | "booked" | "full"; href?: string }>;
  footerNote?: string;
}) {
  const slots = p.slots ?? [];
  return (
    <section className="guruplus-booking">
      <div className="guru-container">
        {(p.eyebrow || p.title || p.subtitle) && (
          <div className="guruplus-booking__head">
            {p.eyebrow ? <div className="guru-eyebrow">{p.eyebrow}</div> : null}
            {p.title ? <h2>{p.title}</h2> : null}
            {p.subtitle ? <p className="guruplus-booking__sub">{p.subtitle}</p> : null}
          </div>
        )}
        <div className="guruplus-booking__grid">
          {slots.map((s, i) => {
            const status = s.status ?? "available";
            const content = (
              <>
                {s.day ? <div className="guruplus-booking__day">{s.day}</div> : null}
                <div className="guruplus-booking__time">{s.time}</div>
                <div className={`guruplus-booking__status guruplus-booking__status--${status}`}>
                  {status === "available" && "Tersedia"}
                  {status === "booked" && "Dipesan"}
                  {status === "full" && "Penuh"}
                </div>
              </>
            );
            if (status === "available" && s.href) {
              return (
                <a key={i} href={s.href} className="guruplus-booking__slot guruplus-booking__slot--available">
                  {content}
                </a>
              );
            }
            return (
              <div key={i} className={`guruplus-booking__slot guruplus-booking__slot--${status}`} aria-disabled={status !== "available"}>
                {content}
              </div>
            );
          })}
        </div>
        {p.footerNote ? <p className="guruplus-booking__footer">{p.footerNote}</p> : null}
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// 18. GuruPlusNewsletter — form langganan (client-side submit stub)
// ----------------------------------------------------------------------------

export function GuruPlusNewsletter(p: {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  placeholder?: string;
  buttonLabel?: string;
  actionHref?: string;
  disclaimer?: string;
}) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    if (!p.actionHref) {
      e.preventDefault();
      if (!email) return;
      setSubmitted(true);
    }
  };

  return (
    <section className="guruplus-news">
      <div className="guru-container">
        <div className="guruplus-news__card">
          <div className="guruplus-news__text">
            {p.eyebrow ? <div className="guru-eyebrow">{p.eyebrow}</div> : null}
            {p.title ? <h2>{p.title}</h2> : null}
            {p.subtitle ? <p className="guruplus-news__sub">{p.subtitle}</p> : null}
          </div>
          {submitted ? (
            <div className="guruplus-news__success" role="status">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Terima kasih sudah berlangganan!</span>
            </div>
          ) : (
            <form
              className="guruplus-news__form"
              action={p.actionHref}
              method={p.actionHref ? "post" : undefined}
              onSubmit={handleSubmit}
            >
              <input
                type="email"
                name="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={p.placeholder || "Email kamu…"}
                className="guruplus-news__input"
                aria-label="Email"
              />
              <button type="submit" className="guruplus-news__btn">
                {p.buttonLabel || "Langganan"}
              </button>
            </form>
          )}
          {p.disclaimer ? <small className="guruplus-news__disclaimer">{p.disclaimer}</small> : null}
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// 19. GuruPlusStudentWall — dinding kiriman murid (sticky-note style)
// ----------------------------------------------------------------------------

export function GuruPlusStudentWall(p: {
  eyebrow?: string;
  title?: string;
  items?: Array<{ message: string; author: string; grade?: string; color?: "amber" | "pink" | "blue" | "green" }>;
}) {
  const items = p.items ?? [];
  return (
    <section className="guruplus-wall">
      <div className="guru-container">
        {(p.eyebrow || p.title) && (
          <div className="guruplus-wall__head">
            {p.eyebrow ? <div className="guru-eyebrow">{p.eyebrow}</div> : null}
            {p.title ? <h2>{p.title}</h2> : null}
          </div>
        )}
        <div className="guruplus-wall__grid">
          {items.map((it, i) => {
            const color = it.color || defaultNoteColor(i);
            const tilt = ((i * 37) % 7) - 3; // deterministic pseudo-random -3..3
            return (
              <div
                key={i}
                className={`guruplus-wall__note guruplus-wall__note--${color}`}
                style={{ transform: `rotate(${tilt}deg)` }}
              >
                <p className="guruplus-wall__msg">{it.message}</p>
                <div className="guruplus-wall__sig">
                  <span className="guruplus-wall__author">{it.author}</span>
                  {it.grade ? <span className="guruplus-wall__grade">{it.grade}</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function defaultNoteColor(i: number): "amber" | "pink" | "blue" | "green" {
  const colors: Array<"amber" | "pink" | "blue" | "green"> = ["amber", "pink", "blue", "green"];
  return colors[i % colors.length];
}

// ----------------------------------------------------------------------------
// 20. GuruPlusStoryBlock — long-form story dengan dropcap + pullquote
// ----------------------------------------------------------------------------

export function GuruPlusStoryBlock(p: {
  eyebrow?: string;
  title?: string;
  byline?: string;
  body?: string;
  pullquote?: string;
  image?: string;
  imageCaption?: string;
}) {
  // Split body jadi paragraf untuk auto-dropcap di paragraf pertama + render.
  const paragraphs = (p.body || "").split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);

  return (
    <section className="guruplus-story">
      <div className="guru-container">
        <div className="guruplus-story__wrap">
          <header className="guruplus-story__header">
            {p.eyebrow ? <div className="guru-eyebrow">{p.eyebrow}</div> : null}
            {p.title ? <h2 className="guruplus-story__title">{p.title}</h2> : null}
            {p.byline ? <div className="guruplus-story__byline">{p.byline}</div> : null}
          </header>
          {p.image ? (
            <figure className="guruplus-story__figure">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.image} alt={p.imageCaption ?? ""} loading="lazy" />
              {p.imageCaption ? <figcaption>{p.imageCaption}</figcaption> : null}
            </figure>
          ) : null}
          <div className="guruplus-story__body">
            {paragraphs.map((para, i) => (
              <p key={i} className={i === 0 ? "guruplus-story__p guruplus-story__p--first" : "guruplus-story__p"}>
                {para}
              </p>
            ))}
          </div>
          {p.pullquote ? (
            <blockquote className="guruplus-story__pullquote">
              <span className="guruplus-story__pullquote-mark" aria-hidden>&ldquo;</span>
              <p>{p.pullquote}</p>
            </blockquote>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// GuruPlusStyles — scoped CSS inject sekali per halaman untuk semua Guru Plus
// block. Pakai pola yang sama dengan GuruStyles.
// ----------------------------------------------------------------------------

export function GuruPlusStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
/* ========================= GURU PLUS SHARED ========================= */
.guruplus-faq,.guruplus-stats,.guruplus-timeline,.guruplus-testi,
.guruplus-shelf,.guruplus-video,.guruplus-photos,.guruplus-audio,.guruplus-certs,
.guruplus-ba,.guruplus-lesson,.guruplus-map,.guruplus-skills,.guruplus-awards,
.guruplus-cta,.guruplus-booking,.guruplus-news,.guruplus-wall,.guruplus-story{
  padding:72px 0;
  background:var(--guru-cream, #fbf8f1);
  color:var(--guru-ink, #263247);
  font-family:var(--font-body,Inter),system-ui,sans-serif;
}
.guruplus-faq__head,.guruplus-stats__head,.guruplus-timeline__head,.guruplus-testi__head,
.guruplus-shelf__head,.guruplus-video__head,.guruplus-photos__head,.guruplus-audio__head,.guruplus-certs__head,
.guruplus-ba__head,.guruplus-lesson__head,.guruplus-map__head,.guruplus-skills__head,.guruplus-awards__head,
.guruplus-booking__head,.guruplus-wall__head{
  margin-bottom:40px;max-width:680px;
}
.guruplus-faq__head h2,.guruplus-stats__head h2,.guruplus-timeline__head h2,.guruplus-testi__head h2,
.guruplus-shelf__head h2,.guruplus-video__head h2,.guruplus-photos__head h2,.guruplus-audio__head h2,.guruplus-certs__head h2,
.guruplus-ba__head h2,.guruplus-lesson__head h2,.guruplus-map__head h2,.guruplus-skills__head h2,.guruplus-awards__head h2,
.guruplus-booking__head h2,.guruplus-wall__head h2{
  font-family:var(--font-heading,Georgia),serif;
  font-size:clamp(28px,3.5vw,44px);
  letter-spacing:-.035em;line-height:1.15;
  color:var(--guru-navy, #14233b);margin:0;
}

/* ========================= 1. FAQ ========================= */
.guruplus-faq__list{
  display:grid;gap:12px;max-width:820px;
}
.guruplus-faq__item{
  background:var(--guru-paper, #fff);
  border:1px solid var(--guru-line, #e9e5dc);
  border-radius:18px;overflow:hidden;
  transition:border-color .25s ease,box-shadow .25s ease;
}
.guruplus-faq__item[open]{
  border-color:color-mix(in srgb,var(--guru-navy, #14233b) 30%,var(--guru-line, #e9e5dc));
  box-shadow:0 10px 30px color-mix(in srgb,var(--guru-navy, #14233b) 8%,transparent);
}
.guruplus-faq__item summary{
  list-style:none;cursor:pointer;
  display:flex;align-items:center;gap:18px;
  padding:22px 24px;
  outline:none;
}
.guruplus-faq__item summary::-webkit-details-marker{display:none}
.guruplus-faq__num{
  font-family:var(--font-heading,Georgia),serif;
  font-size:28px;font-weight:800;line-height:1;
  color:var(--guru-navy, #14233b);
  min-width:52px;letter-spacing:-.02em;
  opacity:.6;transition:opacity .2s ease;
}
.guruplus-faq__item[open] .guruplus-faq__num{opacity:1}
.guruplus-faq__q{
  flex:1;font-size:17px;font-weight:650;
  color:var(--guru-navy, #14233b);line-height:1.4;
}
.guruplus-faq__chev{
  flex-shrink:0;color:var(--guru-muted, #6f7888);
  transition:transform .25s ease,color .25s ease;
}
.guruplus-faq__chev svg{width:22px;height:22px}
.guruplus-faq__item[open] .guruplus-faq__chev{
  transform:rotate(180deg);color:var(--guru-navy, #14233b);
}
.guruplus-faq__a{
  padding:0 24px 22px 94px;
  color:var(--guru-muted, #6f7888);line-height:1.7;
}
.guruplus-faq__a p{margin:0}

/* ========================= 2. STATS COUNTER ========================= */
.guruplus-stats__grid{
  display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
  gap:20px;
}
.guruplus-stats__card{
  background:var(--guru-paper, #fff);
  border:1px solid var(--guru-line, #e9e5dc);
  border-radius:22px;padding:36px 28px;
  text-align:center;
  transition:transform .3s ease,box-shadow .3s ease;
}
.guruplus-stats__card:hover{
  transform:translateY(-4px);
  box-shadow:0 20px 50px color-mix(in srgb,var(--guru-navy, #14233b) 15%,transparent);
}
.guruplus-stats__num{
  font-family:var(--font-heading,Georgia),serif;
  font-size:clamp(42px,5vw,64px);
  font-weight:700;line-height:1;letter-spacing:-.03em;
  color:var(--guru-navy, #14233b);
  display:inline-flex;align-items:baseline;gap:4px;
  font-variant-numeric:tabular-nums;
}
.guruplus-stats__suffix{
  font-size:.6em;color:var(--guru-red, #b6423d);font-weight:700;
}
.guruplus-stats__label{
  margin-top:12px;font-size:13px;font-weight:650;
  text-transform:uppercase;letter-spacing:.08em;
  color:var(--guru-muted, #6f7888);
}

/* ========================= 3. TIMELINE ========================= */
.guruplus-tl{
  position:relative;padding-left:36px;max-width:720px;
}
.guruplus-tl::before{
  content:"";position:absolute;left:11px;top:8px;bottom:8px;width:2px;
  background:linear-gradient(to bottom,
    var(--guru-navy, #14233b) 0%,
    color-mix(in srgb,var(--guru-navy, #14233b) 30%,transparent) 100%);
}
.guruplus-tl__item{
  position:relative;padding:0 0 36px;
  opacity:0;transform:translateY(14px);
  transition:opacity .55s ease,transform .55s ease;
}
.guruplus-tl__item.is-visible{opacity:1;transform:translateY(0)}
.guruplus-tl__item:last-child{padding-bottom:0}
.guruplus-tl__dot{
  position:absolute;left:-30px;top:6px;
  width:14px;height:14px;border-radius:50%;
  background:var(--guru-navy, #14233b);
  box-shadow:0 0 0 4px var(--guru-cream, #fbf8f1),
             0 0 0 5px color-mix(in srgb,var(--guru-navy, #14233b) 25%,transparent);
}
.guruplus-tl__year{
  font-size:12px;font-weight:800;letter-spacing:.1em;
  text-transform:uppercase;color:var(--guru-red, #b6423d);
  margin-bottom:6px;
}
.guruplus-tl__title{
  font-family:var(--font-heading,Georgia),serif;
  font-size:22px;color:var(--guru-navy, #14233b);
  margin:0;line-height:1.2;
}
.guruplus-tl__desc{
  margin:8px 0 0;color:var(--guru-muted, #6f7888);
  line-height:1.7;font-size:15px;max-width:520px;
}

/* ========================= 4. TESTIMONIALS ========================= */
.guruplus-testi__grid{
  columns:3;column-gap:20px;
}
@media(max-width:900px){.guruplus-testi__grid{columns:2}}
@media(max-width:600px){.guruplus-testi__grid{columns:1}}
.guruplus-testi__card{
  break-inside:avoid;margin:0 0 20px;
  background:var(--guru-paper, #fff);
  border:1px solid var(--guru-line, #e9e5dc);
  border-radius:22px;padding:24px;
  transition:transform .25s ease,box-shadow .25s ease,border-color .25s ease;
}
.guruplus-testi__card:hover{
  transform:translateY(-2px);
  border-color:color-mix(in srgb,var(--guru-red, #b6423d) 30%,var(--guru-line, #e9e5dc));
  box-shadow:0 16px 40px color-mix(in srgb,var(--guru-navy, #14233b) 10%,transparent);
}
.guruplus-testi__card blockquote{
  font-family:var(--font-heading,Georgia),serif;
  font-size:17px;line-height:1.55;letter-spacing:-.005em;
  color:var(--guru-navy, #14233b);
  margin:0 0 16px;
}
.guruplus-testi__card figcaption{
  display:flex;align-items:center;gap:12px;
  font-size:13px;color:var(--guru-muted, #6f7888);
}
.guruplus-testi__card figcaption strong{
  display:block;font-weight:700;color:var(--guru-navy, #14233b);
}
.guruplus-testi__card figcaption small{
  display:block;font-size:11px;margin-top:1px;
  text-transform:uppercase;letter-spacing:.05em;
}
.guruplus-testi__avatar{
  width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0;
}
.guruplus-testi__avatar--initials{
  display:grid;place-items:center;
  background:color-mix(in srgb,var(--guru-red, #b6423d) 15%,var(--guru-cream, #fbf8f1));
  color:var(--guru-red, #b6423d);
  font-weight:700;font-size:14px;letter-spacing:.02em;
}

/* ========================= 5. MARQUEE ========================= */
.guruplus-marquee{
  padding:28px 0;overflow:hidden;
  background:var(--guru-navy, #14233b);
  color:color-mix(in srgb,var(--guru-cream, #fbf8f1) 65%,#ffffff);
  position:relative;
}
.guruplus-marquee::before,.guruplus-marquee::after{
  content:"";position:absolute;top:0;bottom:0;width:80px;z-index:2;pointer-events:none;
}
.guruplus-marquee::before{
  left:0;background:linear-gradient(to right,var(--guru-navy, #14233b),transparent);
}
.guruplus-marquee::after{
  right:0;background:linear-gradient(to left,var(--guru-navy, #14233b),transparent);
}
.guruplus-marquee__track{
  display:flex;gap:48px;width:max-content;
  animation:guruplus-marquee 32s linear infinite;
}
.guruplus-marquee--slow .guruplus-marquee__track{animation-duration:52s}
.guruplus-marquee--fast .guruplus-marquee__track{animation-duration:18s}
.guruplus-marquee__item{
  display:inline-flex;align-items:center;gap:14px;
  font-family:var(--font-heading,Georgia),serif;
  font-size:22px;letter-spacing:-.01em;white-space:nowrap;
}
.guruplus-marquee__dot{
  color:var(--guru-red, #b6423d);font-size:14px;opacity:.7;
}
@keyframes guruplus-marquee{
  from{transform:translateX(0)}
  to{transform:translateX(-50%)}
}

/* ========================= 6. BOOKSHELF ========================= */
.guruplus-shelf__grid{
  display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));
  gap:28px 24px;
}
.guruplus-shelf__card{
  background:var(--guru-paper, #fff);
  border:1px solid var(--guru-line, #e9e5dc);
  border-radius:16px;overflow:hidden;
  display:flex;flex-direction:column;
  transition:transform .35s cubic-bezier(.2,.9,.3,1),box-shadow .35s ease;
}
.guruplus-shelf__card:hover{
  transform:translateY(-6px) rotate(-.3deg);
  box-shadow:0 24px 50px color-mix(in srgb,var(--guru-navy, #14233b) 18%,transparent);
}
.guruplus-shelf__cover{
  aspect-ratio:3/4;overflow:hidden;background:var(--guru-cream, #fbf8f1);
  position:relative;
}
.guruplus-shelf__cover img{
  width:100%;height:100%;object-fit:cover;
  transition:transform .5s ease;
}
.guruplus-shelf__card:hover .guruplus-shelf__cover img{transform:scale(1.04)}
.guruplus-shelf__fallback{
  position:absolute;inset:0;display:grid;place-items:center;
  background:linear-gradient(135deg,
    var(--guru-navy, #14233b) 0%,
    color-mix(in srgb,var(--guru-navy, #14233b) 70%,var(--guru-red, #b6423d)) 100%);
  color:#fff;
}
.guruplus-shelf__fallback span{
  font-family:var(--font-heading,Georgia),serif;
  font-size:48px;font-weight:700;letter-spacing:.02em;
}
.guruplus-shelf__body{padding:16px 18px 20px}
.guruplus-shelf__title{
  font-family:var(--font-heading,Georgia),serif;
  font-size:17px;color:var(--guru-navy, #14233b);
  margin:0 0 4px;line-height:1.3;
}
.guruplus-shelf__author{
  font-size:13px;color:var(--guru-muted, #6f7888);font-weight:600;
}
.guruplus-shelf__year{
  font-size:11px;color:var(--guru-red, #b6423d);
  font-weight:700;letter-spacing:.08em;text-transform:uppercase;
  margin-top:4px;
}
.guruplus-shelf__note{
  margin:10px 0 0;font-size:13px;line-height:1.6;
  color:var(--guru-muted, #6f7888);
}

/* ========================= 7. VIDEO EMBED ========================= */
.guruplus-video__grid{
  display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));
  gap:24px;
}
.guruplus-video__card{
  background:var(--guru-paper, #fff);
  border:1px solid var(--guru-line, #e9e5dc);
  border-radius:20px;overflow:hidden;
  transition:transform .3s ease,box-shadow .3s ease;
}
.guruplus-video__card:hover{
  transform:translateY(-3px);
  box-shadow:0 18px 40px color-mix(in srgb,var(--guru-navy, #14233b) 14%,transparent);
}
.guruplus-video__frame{
  position:relative;aspect-ratio:16/9;background:#000;overflow:hidden;
}
.guruplus-video__thumb{
  all:unset;cursor:pointer;position:absolute;inset:0;
  display:block;width:100%;height:100%;
}
.guruplus-video__thumb img{
  width:100%;height:100%;object-fit:cover;
  transition:transform .4s ease,filter .3s ease;
}
.guruplus-video__thumb:hover img{transform:scale(1.03);filter:brightness(.9)}
.guruplus-video__thumb-fallback{
  position:absolute;inset:0;
  background:linear-gradient(135deg,
    var(--guru-navy, #14233b),color-mix(in srgb,var(--guru-navy, #14233b) 50%,var(--guru-red, #b6423d)));
}
.guruplus-video__play{
  position:absolute;inset:0;display:grid;place-items:center;
  pointer-events:none;
}
.guruplus-video__play svg{
  width:72px;height:72px;
  color:#fff;filter:drop-shadow(0 6px 18px rgba(0,0,0,.4));
  transition:transform .3s ease;
}
.guruplus-video__thumb:hover + .guruplus-video__play svg,
.guruplus-video__thumb:hover .guruplus-video__play svg{transform:scale(1.1)}
.guruplus-video__frame iframe{
  width:100%;height:100%;border:0;display:block;
}
.guruplus-video__body{padding:18px 20px 22px}
.guruplus-video__title{
  font-family:var(--font-heading,Georgia),serif;
  font-size:19px;color:var(--guru-navy, #14233b);
  margin:0 0 6px;line-height:1.3;
}
.guruplus-video__desc{
  margin:0;font-size:14px;line-height:1.6;color:var(--guru-muted, #6f7888);
}

/* ========================= 8. PHOTO ESSAY ========================= */
.guruplus-photos__grid{
  display:grid;grid-template-columns:repeat(6,1fr);
  grid-auto-rows:140px;gap:14px;
}
.guruplus-photos__cell{
  position:relative;overflow:hidden;border-radius:16px;
  margin:0;background:var(--guru-paper, #fff);
}
.guruplus-photos__cell img{
  width:100%;height:100%;object-fit:cover;display:block;
  transition:transform .5s cubic-bezier(.2,.9,.3,1);
}
.guruplus-photos__cell:hover img{transform:scale(1.05)}
.guruplus-photos__cell figcaption{
  position:absolute;left:0;right:0;bottom:0;
  padding:14px 16px;color:#fff;
  background:linear-gradient(to top,rgba(0,0,0,.75),transparent);
  display:flex;flex-direction:column;gap:2px;
  font-size:13px;
}
.guruplus-photos__cap{font-weight:600;line-height:1.3}
.guruplus-photos__meta{font-size:11px;opacity:.8;letter-spacing:.05em;text-transform:uppercase}
/* Asymmetric sizes */
.guruplus-photos__cell--0{grid-column:span 4;grid-row:span 2}
.guruplus-photos__cell--1{grid-column:span 2;grid-row:span 1}
.guruplus-photos__cell--2{grid-column:span 2;grid-row:span 1}
.guruplus-photos__cell--3{grid-column:span 3;grid-row:span 2}
.guruplus-photos__cell--4{grid-column:span 3;grid-row:span 1}
.guruplus-photos__cell--5{grid-column:span 3;grid-row:span 1}
@media(max-width:800px){
  .guruplus-photos__grid{grid-template-columns:repeat(2,1fr);grid-auto-rows:160px}
  .guruplus-photos__cell--0,.guruplus-photos__cell--3{grid-column:span 2;grid-row:span 2}
  .guruplus-photos__cell--1,.guruplus-photos__cell--2,
  .guruplus-photos__cell--4,.guruplus-photos__cell--5{grid-column:span 1;grid-row:span 1}
}

/* ========================= 9. AUDIO EPISODE ========================= */
.guruplus-audio__list{
  list-style:none;padding:0;margin:0;display:grid;gap:16px;max-width:820px;
}
.guruplus-audio__row{
  display:grid;grid-template-columns:88px 1fr;gap:18px;
  background:var(--guru-paper, #fff);
  border:1px solid var(--guru-line, #e9e5dc);
  border-radius:18px;padding:16px;
  transition:border-color .25s ease,box-shadow .25s ease;
}
.guruplus-audio__row:hover{
  border-color:color-mix(in srgb,var(--guru-red, #b6423d) 30%,var(--guru-line, #e9e5dc));
  box-shadow:0 10px 24px color-mix(in srgb,var(--guru-navy, #14233b) 10%,transparent);
}
.guruplus-audio__cover{
  aspect-ratio:1/1;border-radius:12px;overflow:hidden;
  background:linear-gradient(135deg,
    var(--guru-navy, #14233b),color-mix(in srgb,var(--guru-navy, #14233b) 60%,var(--guru-red, #b6423d)));
  display:grid;place-items:center;color:#fff;flex-shrink:0;
}
.guruplus-audio__cover img{width:100%;height:100%;object-fit:cover}
.guruplus-audio__num{
  font-family:var(--font-heading,Georgia),serif;
  font-size:28px;font-weight:700;letter-spacing:-.02em;
}
.guruplus-audio__body{display:flex;flex-direction:column;gap:8px;min-width:0}
.guruplus-audio__meta{
  display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;
}
.guruplus-audio__title{
  font-family:var(--font-heading,Georgia),serif;
  font-size:18px;color:var(--guru-navy, #14233b);
  margin:0;line-height:1.3;
}
.guruplus-audio__dur{
  font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
  color:var(--guru-red, #b6423d);
}
.guruplus-audio__desc{
  margin:0;font-size:13px;line-height:1.6;color:var(--guru-muted, #6f7888);
}
.guruplus-audio__player{
  width:100%;max-width:100%;margin-top:4px;
  border-radius:999px;outline:none;
}
.guruplus-audio__player::-webkit-media-controls-panel{
  background:var(--guru-cream, #fbf8f1);
}

/* ========================= 10. CERTIFICATE GRID ========================= */
.guruplus-certs__grid{
  display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));
  gap:20px;
}
.guruplus-certs__card{
  display:flex;flex-direction:column;text-decoration:none;color:inherit;
  background:var(--guru-paper, #fff);
  border:1px solid var(--guru-line, #e9e5dc);
  border-radius:18px;overflow:hidden;
  transition:transform .3s ease,box-shadow .3s ease,border-color .3s ease;
}
.guruplus-certs__card:hover{
  transform:translateY(-4px) rotate(.2deg);
  border-color:color-mix(in srgb,var(--guru-red, #b6423d) 40%,var(--guru-line, #e9e5dc));
  box-shadow:0 16px 40px color-mix(in srgb,var(--guru-navy, #14233b) 15%,transparent);
}
.guruplus-certs__image{
  aspect-ratio:4/3;overflow:hidden;background:var(--guru-cream, #fbf8f1);
  display:grid;place-items:center;
}
.guruplus-certs__image img{width:100%;height:100%;object-fit:cover;display:block}
.guruplus-certs__ribbon{
  color:var(--guru-red, #b6423d);opacity:.5;
}
.guruplus-certs__ribbon svg{width:72px;height:72px}
.guruplus-certs__body{padding:18px 20px 22px}
.guruplus-certs__title{
  font-family:var(--font-heading,Georgia),serif;
  font-size:17px;color:var(--guru-navy, #14233b);
  margin:0 0 6px;line-height:1.3;
}
.guruplus-certs__issuer{
  font-size:13px;color:var(--guru-muted, #6f7888);font-weight:600;
}
.guruplus-certs__date{
  margin-top:4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;
  color:var(--guru-red, #b6423d);font-weight:700;
}

/* ========================= 11. BEFORE / AFTER ========================= */
.guruplus-ba__wrap{
  position:relative;overflow:hidden;border-radius:22px;
  aspect-ratio:16/9;max-width:960px;
  cursor:ew-resize;user-select:none;touch-action:none;
  border:1px solid var(--guru-line, #e9e5dc);
  background:#000;
}
.guruplus-ba__img{
  position:absolute;inset:0;width:100%;height:100%;object-fit:cover;
  pointer-events:none;
}
.guruplus-ba__clip{position:absolute;inset:0;will-change:clip-path}
.guruplus-ba__divider{
  position:absolute;top:0;bottom:0;width:3px;
  background:var(--guru-cream, #fbf8f1);
  transform:translateX(-50%);pointer-events:none;
  box-shadow:0 0 20px rgba(0,0,0,.4);
}
.guruplus-ba__handle{
  position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
  width:44px;height:44px;border-radius:50%;
  background:var(--guru-cream, #fbf8f1);color:var(--guru-navy, #14233b);
  display:grid;place-items:center;
  box-shadow:0 4px 16px rgba(0,0,0,.3);
  pointer-events:auto;
}
.guruplus-ba__handle svg{width:22px;height:22px}
.guruplus-ba__label{
  position:absolute;top:16px;padding:6px 12px;border-radius:999px;
  font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;
  background:rgba(0,0,0,.6);color:#fff;backdrop-filter:blur(4px);
}
.guruplus-ba__label--before{left:16px}
.guruplus-ba__label--after{right:16px}
.guruplus-ba__caption{
  margin:16px 0 0;max-width:960px;
  font-size:14px;color:var(--guru-muted, #6f7888);line-height:1.6;
}

/* ========================= 12. LESSON CARD ========================= */
.guruplus-lesson__grid{
  display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));
  gap:20px;
}
.guruplus-lesson__card{
  background:var(--guru-paper, #fff);
  border:1px solid var(--guru-line, #e9e5dc);
  border-radius:22px;padding:28px 24px;
  display:flex;flex-direction:column;gap:12px;
  transition:transform .3s ease,box-shadow .3s ease,border-color .3s ease;
}
.guruplus-lesson__card:hover{
  transform:translateY(-4px);
  border-color:color-mix(in srgb,var(--guru-navy, #14233b) 20%,var(--guru-line, #e9e5dc));
  box-shadow:0 18px 40px color-mix(in srgb,var(--guru-navy, #14233b) 12%,transparent);
}
.guruplus-lesson__icon{
  width:52px;height:52px;border-radius:14px;
  background:color-mix(in srgb,var(--guru-red, #b6423d) 12%,var(--guru-cream, #fbf8f1));
  display:grid;place-items:center;font-size:26px;
}
.guruplus-lesson__badges{display:flex;gap:8px;flex-wrap:wrap}
.guruplus-lesson__level,.guruplus-lesson__dur{
  font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
  padding:4px 10px;border-radius:999px;
}
.guruplus-lesson__level{
  background:color-mix(in srgb,var(--guru-navy, #14233b) 10%,var(--guru-cream, #fbf8f1));
  color:var(--guru-navy, #14233b);
}
.guruplus-lesson__dur{
  background:color-mix(in srgb,var(--guru-red, #b6423d) 12%,var(--guru-cream, #fbf8f1));
  color:var(--guru-red, #b6423d);
}
.guruplus-lesson__title{
  font-family:var(--font-heading,Georgia),serif;
  font-size:20px;color:var(--guru-navy, #14233b);
  margin:0;line-height:1.3;
}
.guruplus-lesson__desc{
  margin:0;font-size:14px;line-height:1.6;color:var(--guru-muted, #6f7888);
  flex:1;
}
.guruplus-lesson__cta{
  display:inline-flex;align-items:center;gap:6px;
  font-size:13px;font-weight:700;
  color:var(--guru-navy, #14233b);text-decoration:none;
  padding-top:4px;
  transition:color .2s ease,gap .2s ease;
}
.guruplus-lesson__cta:hover{color:var(--guru-red, #b6423d);gap:10px}
.guruplus-lesson__cta svg{width:14px;height:14px}

/* ========================= 13. MAP LOCATION ========================= */
.guruplus-map__wrap{
  display:grid;grid-template-columns:2fr 1fr;gap:0;
  border:1px solid var(--guru-line, #e9e5dc);
  border-radius:22px;overflow:hidden;
  background:var(--guru-paper, #fff);
}
@media(max-width:800px){.guruplus-map__wrap{grid-template-columns:1fr}}
.guruplus-map__frame{
  width:100%;min-height:360px;border:0;display:block;
}
.guruplus-map__panel{
  padding:28px 24px;display:flex;flex-direction:column;gap:14px;
  border-left:1px solid var(--guru-line, #e9e5dc);
}
@media(max-width:800px){.guruplus-map__panel{border-left:0;border-top:1px solid var(--guru-line, #e9e5dc)}}
.guruplus-map__label{
  font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;
  color:var(--guru-red, #b6423d);
}
.guruplus-map__address{
  margin:0;font-size:15px;line-height:1.6;color:var(--guru-navy, #14233b);
  font-weight:600;
}
.guruplus-map__cta{
  display:inline-flex;align-items:center;gap:6px;align-self:flex-start;
  padding:10px 18px;border-radius:999px;
  background:var(--guru-navy, #14233b);color:var(--guru-cream, #fbf8f1);
  font-size:13px;font-weight:700;text-decoration:none;
  transition:transform .2s ease,background .2s ease;
}
.guruplus-map__cta:hover{transform:translateY(-1px);background:var(--guru-red, #b6423d)}
.guruplus-map__cta svg{width:12px;height:12px}

/* ========================= 14. SKILL BARS ========================= */
.guruplus-skills__list{display:grid;gap:22px;max-width:720px}
.guruplus-skill{display:flex;flex-direction:column;gap:8px}
.guruplus-skill__meta{display:flex;justify-content:space-between;align-items:baseline}
.guruplus-skill__label{
  font-size:14px;font-weight:650;color:var(--guru-navy, #14233b);
}
.guruplus-skill__value{
  font-family:var(--font-heading,Georgia),serif;
  font-size:16px;font-weight:700;color:var(--guru-red, #b6423d);
  font-variant-numeric:tabular-nums;
}
.guruplus-skill__track{
  position:relative;height:10px;border-radius:999px;overflow:hidden;
  background:color-mix(in srgb,var(--guru-navy, #14233b) 8%,var(--guru-cream, #fbf8f1));
}
.guruplus-skill__fill{
  position:absolute;left:0;top:0;bottom:0;width:0;
  background:linear-gradient(to right,var(--guru-navy, #14233b),var(--guru-red, #b6423d));
  border-radius:999px;
  transition:width 1.4s cubic-bezier(.2,.9,.3,1);
}
.guruplus-skill__note{
  font-size:12px;color:var(--guru-muted, #6f7888);
}

/* ========================= 15. AWARD SHOWCASE ========================= */
.guruplus-awards__grid{
  display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));
  gap:20px;
}
.guruplus-award{
  text-align:center;padding:36px 24px;
  background:var(--guru-paper, #fff);
  border:1px solid var(--guru-line, #e9e5dc);
  border-radius:22px;
  display:flex;flex-direction:column;align-items:center;gap:10px;
  transition:transform .3s ease,box-shadow .3s ease;
}
.guruplus-award:hover{transform:translateY(-6px)}
.guruplus-award__medal{
  width:72px;height:72px;border-radius:50%;
  display:grid;place-items:center;font-size:36px;
  background:color-mix(in srgb,var(--guru-cream, #fbf8f1) 50%,#fff);
  box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--guru-navy, #14233b) 10%,transparent);
}
.guruplus-award--gold .guruplus-award__medal{
  background:linear-gradient(135deg,#fff2c4,#f4c759);
  box-shadow:inset 0 0 0 2px #d4a52b,0 8px 24px rgba(212,165,43,.3);
}
.guruplus-award--silver .guruplus-award__medal{
  background:linear-gradient(135deg,#f2f2f2,#c3c6cb);
  box-shadow:inset 0 0 0 2px #9ba1a9,0 8px 24px rgba(155,161,169,.3);
}
.guruplus-award--bronze .guruplus-award__medal{
  background:linear-gradient(135deg,#f3d4b4,#c48553);
  box-shadow:inset 0 0 0 2px #9d6a44,0 8px 24px rgba(157,106,68,.3);
}
.guruplus-award__rank{
  font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;
  color:var(--guru-red, #b6423d);
}
.guruplus-award__title{
  font-family:var(--font-heading,Georgia),serif;
  font-size:18px;color:var(--guru-navy, #14233b);
  margin:0;line-height:1.3;
}
.guruplus-award__sub{
  margin:0;font-size:13px;line-height:1.5;color:var(--guru-muted, #6f7888);
}
.guruplus-award__year{
  font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
  color:var(--guru-muted, #6f7888);margin-top:4px;
}

/* ========================= 16. CONTACT CTA ========================= */
.guruplus-cta--navy{background:var(--guru-navy, #14233b);color:var(--guru-cream, #fbf8f1)}
.guruplus-cta--cream{background:var(--guru-cream, #fbf8f1);color:var(--guru-ink, #263247)}
.guruplus-cta__inner{
  display:grid;grid-template-columns:1.3fr 1fr;gap:48px;align-items:center;
}
@media(max-width:800px){.guruplus-cta__inner{grid-template-columns:1fr;gap:32px}}
.guruplus-cta__eyebrow{
  font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;
  color:var(--guru-red, #b6423d);margin-bottom:12px;
}
.guruplus-cta--navy .guruplus-cta__eyebrow{color:color-mix(in srgb,var(--guru-red, #b6423d) 70%,var(--guru-cream, #fbf8f1))}
.guruplus-cta__title{
  font-family:var(--font-heading,Georgia),serif;
  font-size:clamp(32px,4vw,52px);
  letter-spacing:-.03em;line-height:1.12;margin:0;
}
.guruplus-cta__sub{
  margin:16px 0 0;font-size:17px;line-height:1.6;
  opacity:.85;max-width:540px;
}
.guruplus-cta__btns{display:flex;gap:12px;margin-top:28px;flex-wrap:wrap}
.guruplus-cta__btn{
  display:inline-flex;align-items:center;gap:8px;
  padding:14px 28px;border-radius:999px;
  font-size:15px;font-weight:700;letter-spacing:.01em;
  text-decoration:none;
  transition:transform .2s ease,background .2s ease,color .2s ease;
}
.guruplus-cta__btn--primary{
  background:var(--guru-red, #b6423d);color:#fff;
}
.guruplus-cta__btn--primary:hover{transform:translateY(-2px);background:color-mix(in srgb,var(--guru-red, #b6423d) 80%,#000)}
.guruplus-cta__btn--ghost{
  background:transparent;color:inherit;
  box-shadow:inset 0 0 0 1.5px currentColor;
}
.guruplus-cta__btn--ghost:hover{transform:translateY(-2px);opacity:.85}
.guruplus-cta__contacts{
  list-style:none;padding:0;margin:0;display:grid;gap:12px;
}
.guruplus-cta__contact a,.guruplus-cta__contact>div{
  display:flex;align-items:center;gap:16px;
  padding:16px 20px;border-radius:16px;
  text-decoration:none;color:inherit;
  background:color-mix(in srgb,currentColor 6%,transparent);
  transition:background .2s ease,transform .2s ease;
}
.guruplus-cta__contact a:hover{transform:translateX(4px);background:color-mix(in srgb,currentColor 10%,transparent)}
.guruplus-cta__contact-icon{
  width:40px;height:40px;border-radius:50%;
  display:grid;place-items:center;font-size:18px;flex-shrink:0;
  background:color-mix(in srgb,var(--guru-red, #b6423d) 15%,transparent);
}
.guruplus-cta__contact small{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.6}
.guruplus-cta__contact strong{display:block;font-size:15px;font-weight:700;margin-top:2px}

/* ========================= 17. BOOKING SLOT ========================= */
.guruplus-booking__sub{
  margin:12px 0 0;color:var(--guru-muted, #6f7888);line-height:1.6;font-size:15px;
}
.guruplus-booking__grid{
  display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));
  gap:14px;
}
.guruplus-booking__slot{
  display:flex;flex-direction:column;align-items:center;gap:6px;
  padding:20px 16px;border-radius:16px;
  background:var(--guru-paper, #fff);
  border:1px solid var(--guru-line, #e9e5dc);
  text-decoration:none;color:inherit;
  transition:transform .25s ease,border-color .25s ease,box-shadow .25s ease;
}
.guruplus-booking__slot--available{cursor:pointer}
.guruplus-booking__slot--available:hover{
  transform:translateY(-3px);
  border-color:var(--guru-navy, #14233b);
  box-shadow:0 12px 28px color-mix(in srgb,var(--guru-navy, #14233b) 15%,transparent);
}
.guruplus-booking__slot--booked{opacity:.55;cursor:not-allowed}
.guruplus-booking__slot--full{opacity:.4;cursor:not-allowed;background:color-mix(in srgb,var(--guru-muted, #6f7888) 10%,var(--guru-paper, #fff))}
.guruplus-booking__day{
  font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;
  color:var(--guru-muted, #6f7888);
}
.guruplus-booking__time{
  font-family:var(--font-heading,Georgia),serif;
  font-size:22px;font-weight:700;color:var(--guru-navy, #14233b);
  letter-spacing:-.01em;font-variant-numeric:tabular-nums;
}
.guruplus-booking__status{
  font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
  padding:3px 10px;border-radius:999px;margin-top:4px;
}
.guruplus-booking__status--available{
  background:color-mix(in srgb,#16a34a 15%,var(--guru-cream, #fbf8f1));color:#16a34a;
}
.guruplus-booking__status--booked{
  background:color-mix(in srgb,var(--guru-red, #b6423d) 15%,var(--guru-cream, #fbf8f1));color:var(--guru-red, #b6423d);
}
.guruplus-booking__status--full{
  background:color-mix(in srgb,var(--guru-muted, #6f7888) 20%,var(--guru-cream, #fbf8f1));color:var(--guru-muted, #6f7888);
}
.guruplus-booking__footer{
  margin:28px 0 0;font-size:13px;color:var(--guru-muted, #6f7888);
}

/* ========================= 18. NEWSLETTER ========================= */
.guruplus-news__card{
  background:linear-gradient(135deg,
    var(--guru-navy, #14233b) 0%,
    color-mix(in srgb,var(--guru-navy, #14233b) 70%,var(--guru-red, #b6423d)) 100%);
  color:var(--guru-cream, #fbf8f1);
  border-radius:28px;padding:56px 48px;
  display:grid;grid-template-columns:1.1fr 1fr;gap:40px;align-items:center;
}
@media(max-width:800px){.guruplus-news__card{grid-template-columns:1fr;padding:40px 28px;gap:28px}}
.guruplus-news__text h2{
  font-family:var(--font-heading,Georgia),serif;
  font-size:clamp(26px,3vw,38px);line-height:1.2;letter-spacing:-.025em;margin:0;
}
.guruplus-news__sub{
  margin:12px 0 0;font-size:15px;line-height:1.6;opacity:.85;
}
.guruplus-news__form{
  display:flex;gap:8px;align-items:stretch;
  background:#fff;border-radius:999px;padding:6px;
}
.guruplus-news__input{
  flex:1;min-width:0;border:0;outline:none;background:transparent;
  padding:10px 20px;font-size:15px;color:var(--guru-navy, #14233b);
  font-family:inherit;
}
.guruplus-news__btn{
  background:var(--guru-navy, #14233b);color:#fff;
  border:0;cursor:pointer;
  padding:12px 24px;border-radius:999px;
  font-size:14px;font-weight:700;
  transition:background .2s ease,transform .2s ease;
}
.guruplus-news__btn:hover{background:var(--guru-red, #b6423d);transform:translateY(-1px)}
.guruplus-news__success{
  display:inline-flex;align-items:center;gap:12px;
  background:rgba(255,255,255,.15);padding:14px 24px;border-radius:999px;
  font-weight:650;font-size:15px;
}
.guruplus-news__success svg{width:22px;height:22px;color:#86efac}
.guruplus-news__disclaimer{
  grid-column:1/-1;display:block;margin-top:16px;
  font-size:12px;opacity:.7;line-height:1.5;
}

/* ========================= 19. STUDENT WALL ========================= */
.guruplus-wall__grid{
  display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));
  gap:24px;
}
.guruplus-wall__note{
  padding:24px 20px 20px;border-radius:4px;
  min-height:180px;display:flex;flex-direction:column;justify-content:space-between;
  font-family:var(--font-handwriting, "Caveat", "Comic Sans MS", cursive, var(--font-body));
  box-shadow:0 10px 24px rgba(0,0,0,.12),0 2px 4px rgba(0,0,0,.06);
  transition:transform .3s ease,box-shadow .3s ease;
  position:relative;
}
.guruplus-wall__note::before{
  content:"";position:absolute;top:-8px;left:50%;transform:translateX(-50%);
  width:40px;height:12px;background:rgba(0,0,0,.1);border-radius:0 0 4px 4px;
}
.guruplus-wall__note:hover{
  transform:translateY(-6px) scale(1.02) rotate(0deg) !important;
  box-shadow:0 20px 40px rgba(0,0,0,.18);
  z-index:1;
}
.guruplus-wall__note--amber{background:#fde68a;color:#78350f}
.guruplus-wall__note--pink{background:#fbcfe8;color:#831843}
.guruplus-wall__note--blue{background:#bfdbfe;color:#1e3a8a}
.guruplus-wall__note--green{background:#bbf7d0;color:#14532d}
.guruplus-wall__msg{
  margin:0;font-size:20px;line-height:1.35;font-weight:500;
}
.guruplus-wall__sig{
  display:flex;flex-direction:column;gap:1px;margin-top:14px;
  font-family:var(--font-body,Inter),system-ui,sans-serif;
}
.guruplus-wall__author{
  font-weight:700;font-size:13px;
}
.guruplus-wall__grade{
  font-size:11px;opacity:.75;letter-spacing:.05em;text-transform:uppercase;
}

/* ========================= 20. STORY BLOCK ========================= */
.guruplus-story__wrap{max-width:720px;margin:0 auto}
.guruplus-story__header{margin-bottom:28px;text-align:center}
.guruplus-story__title{
  font-family:var(--font-heading,Georgia),serif;
  font-size:clamp(32px,4vw,52px);letter-spacing:-.03em;line-height:1.1;
  color:var(--guru-navy, #14233b);margin:12px 0 0;
}
.guruplus-story__byline{
  margin-top:12px;font-size:13px;color:var(--guru-muted, #6f7888);
  letter-spacing:.04em;
}
.guruplus-story__figure{
  margin:0 -40px 36px;border-radius:20px;overflow:hidden;
  background:var(--guru-paper, #fff);
}
@media(max-width:800px){.guruplus-story__figure{margin:0 0 28px}}
.guruplus-story__figure img{
  width:100%;height:auto;display:block;max-height:460px;object-fit:cover;
}
.guruplus-story__figure figcaption{
  padding:12px 20px;font-size:13px;color:var(--guru-muted, #6f7888);
  background:var(--guru-cream, #fbf8f1);
  border-top:1px solid var(--guru-line, #e9e5dc);
}
.guruplus-story__body{
  display:flex;flex-direction:column;gap:18px;
}
.guruplus-story__p{
  margin:0;font-size:18px;line-height:1.75;color:var(--guru-ink, #263247);
  font-family:var(--font-body,Inter),system-ui,sans-serif;
}
.guruplus-story__p--first::first-letter{
  float:left;font-family:var(--font-heading,Georgia),serif;
  font-size:72px;line-height:.85;padding:8px 12px 0 0;
  color:var(--guru-red, #b6423d);font-weight:700;
}
.guruplus-story__pullquote{
  position:relative;margin:32px -32px;padding:28px 44px;
  border-left:4px solid var(--guru-red, #b6423d);
}
@media(max-width:800px){.guruplus-story__pullquote{margin:28px 0;padding:20px 24px}}
.guruplus-story__pullquote-mark{
  position:absolute;top:-16px;left:16px;
  font-family:var(--font-heading,Georgia),serif;
  font-size:72px;line-height:1;color:var(--guru-red, #b6423d);opacity:.3;
}
.guruplus-story__pullquote p{
  margin:0;font-family:var(--font-heading,Georgia),serif;
  font-size:24px;line-height:1.4;color:var(--guru-navy, #14233b);
  font-weight:500;letter-spacing:-.015em;
}

/* ========================= REDUCED MOTION ========================= */
@media(prefers-reduced-motion:reduce){
  .guruplus-tl__item{opacity:1;transform:none;transition:none}
  .guruplus-marquee__track{animation:none}
  .guruplus-stats__card,.guruplus-testi__card,.guruplus-shelf__card,
  .guruplus-video__card,.guruplus-certs__card,.guruplus-photos__cell img,
  .guruplus-shelf__cover img,.guruplus-lesson__card,.guruplus-award,
  .guruplus-skill__fill,.guruplus-cta__btn,.guruplus-cta__contact a,
  .guruplus-booking__slot,.guruplus-news__btn,.guruplus-wall__note{transition:none}
}
`,
      }}
    />
  );
}
