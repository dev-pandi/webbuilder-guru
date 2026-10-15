"use client";

// GuruPlusEditorBlocks.tsx — editor-side rendering untuk Guru Plus block.
// Mirror komponen renderer di apps/renderer/components/GuruPlusBlocks.tsx
// supaya preview di editor identik dengan live site. Perbedaan utama:
// EditableField/EditableItemField untuk inline text edit saat edit mode.
//
// Semua motion (counter animation, scroll reveal, marquee) tetap jalan di
// editor supaya guru lihat preview realistis. Reduced-motion di-respect sama.

import { createElement, useEffect, useRef, useState } from "react";
import { EditableText } from "@/app/sites/[id]/editor/EditableText";

type GuruEditCtx = {
  editable?: boolean;
  onFieldChange?: (field: string, value: unknown) => void;
  onItemChange?: (arrName: string, idx: number, field: string, value: unknown) => void;
};

type EditableTag = "span" | "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "div" | "blockquote" | "strong" | "small" | "cite";

function EditableField({
  edit,
  field,
  value,
  as = "span",
  className,
  placeholder,
  multiline,
  hideWhenEmpty = false,
}: {
  edit?: GuruEditCtx;
  field: string;
  value: string;
  as?: EditableTag;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
  hideWhenEmpty?: boolean;
}) {
  if (!edit?.editable) {
    if (hideWhenEmpty && !value) return null;
    return createElement(as, { className }, value);
  }
  return (
    <EditableText
      as={as as "span" | "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "div" | "blockquote"}
      className={className}
      value={value}
      onChange={(v) => edit.onFieldChange?.(field, v)}
      placeholder={placeholder}
      multiline={multiline}
    />
  );
}

function EditableItem({
  edit,
  arrName,
  idx,
  field,
  value,
  as = "span",
  className,
  placeholder,
  multiline,
}: {
  edit?: GuruEditCtx;
  arrName: string;
  idx: number;
  field: string;
  value: string;
  as?: EditableTag;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
}) {
  if (!edit?.editable) {
    return createElement(as, { className }, value);
  }
  return (
    <EditableText
      as={as as "span" | "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "div" | "blockquote"}
      className={className}
      value={value}
      onChange={(v) => edit.onItemChange?.(arrName, idx, field, v)}
      placeholder={placeholder}
      multiline={multiline}
    />
  );
}

// ----------------------------------------------------------------------------
// GuruPlusFAQ — accordion
// ----------------------------------------------------------------------------

export function GuruPlusFAQEditor(p: {
  eyebrow?: string;
  title?: string;
  items?: Array<{ q: string; a: string }>;
  edit?: GuruEditCtx;
}) {
  const items = p.edit?.editable ? p.items ?? [] : p.items ?? [];
  return (
    <section className="guruplus-faq">
      <div className="guru-container">
        {(p.eyebrow || p.title || p.edit?.editable) && (
          <div className="guruplus-faq__head">
            <EditableField
              edit={p.edit}
              field="eyebrow"
              value={p.eyebrow ?? ""}
              as="div"
              className="guru-eyebrow"
              placeholder="Eyebrow…"
              hideWhenEmpty
            />
            <EditableField
              edit={p.edit}
              field="title"
              value={p.title ?? ""}
              as="h2"
              placeholder="Judul FAQ…"
              hideWhenEmpty
            />
          </div>
        )}
        <div className="guruplus-faq__list">
          {items.map((it, i) => (
            <details key={i} className="guruplus-faq__item" open={i === 0 && p.edit?.editable}>
              <summary>
                <span className="guruplus-faq__num">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <EditableItem
                  edit={p.edit}
                  arrName="items"
                  idx={i}
                  field="q"
                  value={it.q}
                  as="span"
                  className="guruplus-faq__q"
                  placeholder="Pertanyaan…"
                />
                <span className="guruplus-faq__chev" aria-hidden>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </summary>
              <div className="guruplus-faq__a">
                <EditableItem
                  edit={p.edit}
                  arrName="items"
                  idx={i}
                  field="a"
                  value={it.a}
                  as="p"
                  placeholder="Jawaban…"
                  multiline
                />
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// GuruPlusStats — count up on scroll
// ----------------------------------------------------------------------------

export function GuruPlusStatsEditor(p: {
  eyebrow?: string;
  title?: string;
  // value bisa number (defaults) atau string (hasil edit).
  items?: Array<{ value: number | string; suffix?: string; label: string }>;
  edit?: GuruEditCtx;
}) {
  const items = p.items ?? [];
  return (
    <section className="guruplus-stats">
      <div className="guru-container">
        {(p.eyebrow || p.title || p.edit?.editable) && (
          <div className="guruplus-stats__head">
            <EditableField
              edit={p.edit}
              field="eyebrow"
              value={p.eyebrow ?? ""}
              as="div"
              className="guru-eyebrow"
              placeholder="Eyebrow…"
              hideWhenEmpty
            />
            <EditableField
              edit={p.edit}
              field="title"
              value={p.title ?? ""}
              as="h2"
              placeholder="Judul stats…"
              hideWhenEmpty
            />
          </div>
        )}
        <div className="guruplus-stats__grid">
          {items.map((it, i) => (
            <StatCardEditor
              key={i}
              edit={p.edit}
              idx={i}
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
  const n = parseFloat(v.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function StatCardEditor({
  edit,
  idx,
  value,
  suffix,
  label,
}: {
  edit?: GuruEditCtx;
  idx: number;
  value: number;
  suffix?: string;
  label: string;
}) {
  const [display, setDisplay] = useState(edit?.editable ? value : 0);
  const ref = useRef<HTMLDivElement>(null);
  const triggered = useRef(false);

  useEffect(() => {
    // Edit mode: tampilkan nilai akhir tanpa animasi supaya guru lihat
    // apa yang dia ketik.
    if (edit?.editable) {
      setDisplay(value);
      return;
    }
    if (!ref.current || triggered.current) return;
    const prefersReduced =
      typeof window !== "undefined" &&
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
  }, [value, edit?.editable]);

  return (
    <div ref={ref} className="guruplus-stats__card">
      <div className="guruplus-stats__num">
        {display.toLocaleString("id-ID")}
        {suffix ? <span className="guruplus-stats__suffix">{suffix}</span> : null}
      </div>
      <EditableItem
        edit={edit}
        arrName="items"
        idx={idx}
        field="label"
        value={label}
        as="div"
        className="guruplus-stats__label"
        placeholder="Label…"
      />
    </div>
  );
}

// ----------------------------------------------------------------------------
// GuruPlusTimeline
// ----------------------------------------------------------------------------

export function GuruPlusTimelineEditor(p: {
  eyebrow?: string;
  title?: string;
  items?: Array<{ year: string; title: string; desc?: string }>;
  edit?: GuruEditCtx;
}) {
  const items = p.items ?? [];
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    // Edit mode → langsung show all.
    if (p.edit?.editable) {
      containerRef.current.querySelectorAll(".guruplus-tl__item").forEach((el) => {
        el.classList.add("is-visible");
      });
      return;
    }
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
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
  }, [p.edit?.editable]);

  return (
    <section className="guruplus-timeline">
      <div className="guru-container">
        {(p.eyebrow || p.title || p.edit?.editable) && (
          <div className="guruplus-timeline__head">
            <EditableField
              edit={p.edit}
              field="eyebrow"
              value={p.eyebrow ?? ""}
              as="div"
              className="guru-eyebrow"
              placeholder="Eyebrow…"
              hideWhenEmpty
            />
            <EditableField
              edit={p.edit}
              field="title"
              value={p.title ?? ""}
              as="h2"
              placeholder="Judul perjalanan…"
              hideWhenEmpty
            />
          </div>
        )}
        <div ref={containerRef} className="guruplus-tl">
          {items.map((it, i) => (
            <div key={i} className="guruplus-tl__item">
              <div className="guruplus-tl__dot" aria-hidden />
              <div className="guruplus-tl__content">
                <EditableItem
                  edit={p.edit}
                  arrName="items"
                  idx={i}
                  field="year"
                  value={it.year}
                  as="div"
                  className="guruplus-tl__year"
                  placeholder="2015"
                />
                <EditableItem
                  edit={p.edit}
                  arrName="items"
                  idx={i}
                  field="title"
                  value={it.title}
                  as="h3"
                  className="guruplus-tl__title"
                  placeholder="Judul milestone…"
                />
                <EditableItem
                  edit={p.edit}
                  arrName="items"
                  idx={i}
                  field="desc"
                  value={it.desc ?? ""}
                  as="p"
                  className="guruplus-tl__desc"
                  placeholder="Deskripsi…"
                  multiline
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// GuruPlusTestimonials
// ----------------------------------------------------------------------------

export function GuruPlusTestimonialsEditor(p: {
  eyebrow?: string;
  title?: string;
  items?: Array<{ quote: string; author: string; role?: string; avatar?: string }>;
  edit?: GuruEditCtx;
}) {
  const items = p.items ?? [];
  return (
    <section className="guruplus-testi">
      <div className="guru-container">
        {(p.eyebrow || p.title || p.edit?.editable) && (
          <div className="guruplus-testi__head">
            <EditableField
              edit={p.edit}
              field="eyebrow"
              value={p.eyebrow ?? ""}
              as="div"
              className="guru-eyebrow"
              placeholder="Eyebrow…"
              hideWhenEmpty
            />
            <EditableField
              edit={p.edit}
              field="title"
              value={p.title ?? ""}
              as="h2"
              placeholder="Judul testimoni…"
              hideWhenEmpty
            />
          </div>
        )}
        <div className="guruplus-testi__grid">
          {items.map((it, i) => (
            <figure key={i} className="guruplus-testi__card">
              <EditableItem
                edit={p.edit}
                arrName="items"
                idx={i}
                field="quote"
                value={it.quote}
                as="blockquote"
                placeholder="Kutipan testimoni…"
                multiline
              />
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
                  <EditableItem
                    edit={p.edit}
                    arrName="items"
                    idx={i}
                    field="author"
                    value={it.author}
                    as="strong"
                    placeholder="Nama…"
                  />
                  <EditableItem
                    edit={p.edit}
                    arrName="items"
                    idx={i}
                    field="role"
                    value={it.role ?? ""}
                    as="small"
                    placeholder="Peran…"
                  />
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
// GuruPlusMarquee — pure CSS, nothing to edit per-item in UI (items array dari
// PropEditor). Preview static.
// ----------------------------------------------------------------------------

export function GuruPlusMarqueeEditor(p: {
  items?: string[];
  speed?: "slow" | "normal" | "fast";
}) {
  const items = p.items ?? [];
  if (items.length === 0) {
    return (
      <section
        className="guruplus-marquee"
        style={{
          padding: "40px 24px",
          textAlign: "center",
          fontStyle: "italic",
          color: "#8aa",
        }}
      >
        Tambahkan item marquee di panel kanan →
      </section>
    );
  }
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
// GuruPlusBookshelf — rak buku rekomendasi guru
// ----------------------------------------------------------------------------

export function GuruPlusBookshelfEditor(p: {
  eyebrow?: string;
  title?: string;
  items?: Array<{ title: string; author?: string; cover?: string; year?: string; note?: string }>;
  edit?: GuruEditCtx;
}) {
  const items = p.items ?? [];
  return (
    <section className="guruplus-shelf">
      <div className="guru-container">
        {(p.eyebrow || p.title || p.edit?.editable) && (
          <div className="guruplus-shelf__head">
            <EditableField edit={p.edit} field="eyebrow" value={p.eyebrow ?? ""} as="div" className="guru-eyebrow" placeholder="Eyebrow…" hideWhenEmpty />
            <EditableField edit={p.edit} field="title" value={p.title ?? ""} as="h2" placeholder="Judul rak buku…" hideWhenEmpty />
          </div>
        )}
        <div className="guruplus-shelf__grid">
          {items.map((it, i) => (
            <article key={i} className="guruplus-shelf__card">
              <div className="guruplus-shelf__cover">
                {it.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.cover} alt={it.title} />
                ) : (
                  <div className="guruplus-shelf__fallback"><span>{initials(it.title)}</span></div>
                )}
              </div>
              <div className="guruplus-shelf__body">
                <EditableItem edit={p.edit} arrName="items" idx={i} field="title" value={it.title} as="h3" className="guruplus-shelf__title" placeholder="Judul buku…" />
                <EditableItem edit={p.edit} arrName="items" idx={i} field="author" value={it.author ?? ""} as="div" className="guruplus-shelf__author" placeholder="Penulis…" />
                <EditableItem edit={p.edit} arrName="items" idx={i} field="year" value={it.year ?? ""} as="div" className="guruplus-shelf__year" placeholder="Tahun…" />
                <EditableItem edit={p.edit} arrName="items" idx={i} field="note" value={it.note ?? ""} as="p" className="guruplus-shelf__note" placeholder="Catatan singkat…" multiline />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// GuruPlusVideoEmbed — gallery video (preview = thumbnail saja; no iframe)
// ----------------------------------------------------------------------------

export function GuruPlusVideoEmbedEditor(p: {
  eyebrow?: string;
  title?: string;
  items?: Array<{ url: string; title: string; description?: string; thumbnail?: string }>;
  edit?: GuruEditCtx;
}) {
  const items = p.items ?? [];
  return (
    <section className="guruplus-video">
      <div className="guru-container">
        {(p.eyebrow || p.title || p.edit?.editable) && (
          <div className="guruplus-video__head">
            <EditableField edit={p.edit} field="eyebrow" value={p.eyebrow ?? ""} as="div" className="guru-eyebrow" placeholder="Eyebrow…" hideWhenEmpty />
            <EditableField edit={p.edit} field="title" value={p.title ?? ""} as="h2" placeholder="Judul video…" hideWhenEmpty />
          </div>
        )}
        <div className="guruplus-video__grid">
          {items.map((it, i) => {
            const thumb = it.thumbnail || youtubeThumbnailEditor(it.url);
            return (
              <article key={i} className="guruplus-video__card">
                <div className="guruplus-video__frame">
                  <div className="guruplus-video__thumb" aria-hidden>
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" />
                    ) : (
                      <div className="guruplus-video__thumb-fallback" />
                    )}
                    <span className="guruplus-video__play">
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                    </span>
                  </div>
                </div>
                <div className="guruplus-video__body">
                  <EditableItem edit={p.edit} arrName="items" idx={i} field="title" value={it.title} as="h3" className="guruplus-video__title" placeholder="Judul video…" />
                  <EditableItem edit={p.edit} arrName="items" idx={i} field="description" value={it.description ?? ""} as="p" className="guruplus-video__desc" placeholder="Deskripsi…" multiline />
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function youtubeThumbnailEditor(url: string): string {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  return yt ? `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg` : "";
}

// ----------------------------------------------------------------------------
// GuruPlusPhotoEssay — foto essay asymmetric grid
// ----------------------------------------------------------------------------

export function GuruPlusPhotoEssayEditor(p: {
  eyebrow?: string;
  title?: string;
  items?: Array<{ image: string; caption?: string; meta?: string }>;
  edit?: GuruEditCtx;
}) {
  const items = p.items ?? [];
  return (
    <section className="guruplus-photos">
      <div className="guru-container">
        {(p.eyebrow || p.title || p.edit?.editable) && (
          <div className="guruplus-photos__head">
            <EditableField edit={p.edit} field="eyebrow" value={p.eyebrow ?? ""} as="div" className="guru-eyebrow" placeholder="Eyebrow…" hideWhenEmpty />
            <EditableField edit={p.edit} field="title" value={p.title ?? ""} as="h2" placeholder="Judul foto essay…" hideWhenEmpty />
          </div>
        )}
        <div className="guruplus-photos__grid">
          {items.map((it, i) => (
            <figure key={i} className={`guruplus-photos__cell guruplus-photos__cell--${i % 6}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.image} alt={it.caption ?? ""} />
              {(it.caption || it.meta || p.edit?.editable) && (
                <figcaption>
                  <EditableItem edit={p.edit} arrName="items" idx={i} field="caption" value={it.caption ?? ""} as="span" className="guruplus-photos__cap" placeholder="Caption…" />
                  <EditableItem edit={p.edit} arrName="items" idx={i} field="meta" value={it.meta ?? ""} as="span" className="guruplus-photos__meta" placeholder="Meta (tanggal/lokasi)…" />
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
// GuruPlusAudioEpisode — audio episode list
// ----------------------------------------------------------------------------

export function GuruPlusAudioEpisodeEditor(p: {
  eyebrow?: string;
  title?: string;
  items?: Array<{ title: string; src: string; duration?: string; description?: string; cover?: string }>;
  edit?: GuruEditCtx;
}) {
  const items = p.items ?? [];
  return (
    <section className="guruplus-audio">
      <div className="guru-container">
        {(p.eyebrow || p.title || p.edit?.editable) && (
          <div className="guruplus-audio__head">
            <EditableField edit={p.edit} field="eyebrow" value={p.eyebrow ?? ""} as="div" className="guru-eyebrow" placeholder="Eyebrow…" hideWhenEmpty />
            <EditableField edit={p.edit} field="title" value={p.title ?? ""} as="h2" placeholder="Judul episode…" hideWhenEmpty />
          </div>
        )}
        <ul className="guruplus-audio__list">
          {items.map((it, i) => (
            <li key={i} className="guruplus-audio__row">
              <div className="guruplus-audio__cover">
                {it.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.cover} alt={it.title} />
                ) : (
                  <span className="guruplus-audio__num">{String(i + 1).padStart(2, "0")}</span>
                )}
              </div>
              <div className="guruplus-audio__body">
                <div className="guruplus-audio__meta">
                  <EditableItem edit={p.edit} arrName="items" idx={i} field="title" value={it.title} as="h3" className="guruplus-audio__title" placeholder="Judul episode…" />
                  <EditableItem edit={p.edit} arrName="items" idx={i} field="duration" value={it.duration ?? ""} as="span" className="guruplus-audio__dur" placeholder="05:20" />
                </div>
                <EditableItem edit={p.edit} arrName="items" idx={i} field="description" value={it.description ?? ""} as="p" className="guruplus-audio__desc" placeholder="Deskripsi…" multiline />
                {/* Preview tanpa autoplay / tanpa controls di edit mode supaya tidak intrusive */}
                {it.src ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <audio controls preload="none" src={it.src} className="guruplus-audio__player" />
                ) : (
                  <div className="guruplus-audio__player" style={{ fontSize: 11, color: "#8aa", padding: "6px 0" }}>
                    Isi URL audio di panel kanan →
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// GuruPlusCertificateGrid — grid sertifikat/penghargaan
// ----------------------------------------------------------------------------

export function GuruPlusCertificateGridEditor(p: {
  eyebrow?: string;
  title?: string;
  items?: Array<{ title: string; issuer?: string; date?: string; image?: string; href?: string }>;
  edit?: GuruEditCtx;
}) {
  const items = p.items ?? [];
  return (
    <section className="guruplus-certs">
      <div className="guru-container">
        {(p.eyebrow || p.title || p.edit?.editable) && (
          <div className="guruplus-certs__head">
            <EditableField edit={p.edit} field="eyebrow" value={p.eyebrow ?? ""} as="div" className="guru-eyebrow" placeholder="Eyebrow…" hideWhenEmpty />
            <EditableField edit={p.edit} field="title" value={p.title ?? ""} as="h2" placeholder="Judul sertifikat…" hideWhenEmpty />
          </div>
        )}
        <div className="guruplus-certs__grid">
          {items.map((it, i) => (
            <div key={i} className="guruplus-certs__card">
              <div className="guruplus-certs__image">
                {it.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.image} alt={it.title} />
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
                <EditableItem edit={p.edit} arrName="items" idx={i} field="title" value={it.title} as="h3" className="guruplus-certs__title" placeholder="Judul sertifikat…" />
                <EditableItem edit={p.edit} arrName="items" idx={i} field="issuer" value={it.issuer ?? ""} as="div" className="guruplus-certs__issuer" placeholder="Penerbit…" />
                <EditableItem edit={p.edit} arrName="items" idx={i} field="date" value={it.date ?? ""} as="div" className="guruplus-certs__date" placeholder="2024" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// GuruPlusBeforeAfter — image comparison slider (static 50% split di editor)
// ----------------------------------------------------------------------------

export function GuruPlusBeforeAfterEditor(p: {
  eyebrow?: string;
  title?: string;
  beforeImage?: string;
  afterImage?: string;
  beforeLabel?: string;
  afterLabel?: string;
  caption?: string;
  edit?: GuruEditCtx;
}) {
  // Edit mode: tetap draggable supaya guru bisa test, tapi preview mulai 50%.
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

  if (!p.beforeImage || !p.afterImage) {
    return (
      <section className="guruplus-ba">
        <div className="guru-container">
          <div className="guruplus-ba__head">
            <EditableField edit={p.edit} field="eyebrow" value={p.eyebrow ?? ""} as="div" className="guru-eyebrow" placeholder="Eyebrow…" hideWhenEmpty />
            <EditableField edit={p.edit} field="title" value={p.title ?? ""} as="h2" placeholder="Judul Before/After…" hideWhenEmpty />
          </div>
          <div
            className="guruplus-ba__wrap"
            style={{ display: "grid", placeItems: "center", color: "#8aa", fontStyle: "italic" }}
          >
            Isi URL Before + After di panel kanan →
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="guruplus-ba">
      <div className="guru-container">
        {(p.eyebrow || p.title || p.edit?.editable) && (
          <div className="guruplus-ba__head">
            <EditableField edit={p.edit} field="eyebrow" value={p.eyebrow ?? ""} as="div" className="guru-eyebrow" placeholder="Eyebrow…" hideWhenEmpty />
            <EditableField edit={p.edit} field="title" value={p.title ?? ""} as="h2" placeholder="Judul Before/After…" hideWhenEmpty />
          </div>
        )}
        <div ref={wrapRef} className="guruplus-ba__wrap" onMouseDown={startDrag} onTouchStart={startDrag}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.afterImage} alt={p.afterLabel ?? "Sesudah"} className="guruplus-ba__img" />
          <div className="guruplus-ba__clip" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.beforeImage} alt={p.beforeLabel ?? "Sebelum"} className="guruplus-ba__img" />
          </div>
          <div className="guruplus-ba__divider" style={{ left: `${pos}%` }}>
            <div className="guruplus-ba__handle">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path d="M5 7l-3 3 3 3v-6zM15 7l3 3-3 3v-6z" />
              </svg>
            </div>
          </div>
          <span className="guruplus-ba__label guruplus-ba__label--before">{p.beforeLabel ?? "Sebelum"}</span>
          <span className="guruplus-ba__label guruplus-ba__label--after">{p.afterLabel ?? "Sesudah"}</span>
        </div>
        <EditableField edit={p.edit} field="caption" value={p.caption ?? ""} as="p" className="guruplus-ba__caption" placeholder="Caption…" hideWhenEmpty multiline />
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// GuruPlusLessonCard
// ----------------------------------------------------------------------------

export function GuruPlusLessonCardEditor(p: {
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
  edit?: GuruEditCtx;
}) {
  const items = p.items ?? [];
  return (
    <section className="guruplus-lesson">
      <div className="guru-container">
        {(p.eyebrow || p.title || p.edit?.editable) && (
          <div className="guruplus-lesson__head">
            <EditableField edit={p.edit} field="eyebrow" value={p.eyebrow ?? ""} as="div" className="guru-eyebrow" placeholder="Eyebrow…" hideWhenEmpty />
            <EditableField edit={p.edit} field="title" value={p.title ?? ""} as="h2" placeholder="Judul pelajaran…" hideWhenEmpty />
          </div>
        )}
        <div className="guruplus-lesson__grid">
          {items.map((it, i) => (
            <article key={i} className="guruplus-lesson__card">
              <div className="guruplus-lesson__icon" aria-hidden>{it.icon || "📘"}</div>
              <div className="guruplus-lesson__badges">
                {it.level ? <span className="guruplus-lesson__level">{it.level}</span> : null}
                {it.duration ? <span className="guruplus-lesson__dur">{it.duration}</span> : null}
              </div>
              <EditableItem edit={p.edit} arrName="items" idx={i} field="title" value={it.title} as="h3" className="guruplus-lesson__title" placeholder="Judul pelajaran…" />
              <EditableItem edit={p.edit} arrName="items" idx={i} field="description" value={it.description ?? ""} as="p" className="guruplus-lesson__desc" placeholder="Deskripsi…" multiline />
              {it.href ? (
                <span className="guruplus-lesson__cta">
                  {it.ctaLabel || "Mulai belajar"}
                  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                    <path d="M7 5l6 5-6 5V5z" />
                  </svg>
                </span>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// GuruPlusMapLocation — editor pakai placeholder tile (iframe tetap aktif)
// ----------------------------------------------------------------------------

export function GuruPlusMapLocationEditor(p: {
  eyebrow?: string;
  title?: string;
  address?: string;
  lat?: number | string;
  lon?: number | string;
  zoom?: number | string;
  directionsHref?: string;
  edit?: GuruEditCtx;
}) {
  const lat = typeof p.lat === "string" ? parseFloat(p.lat) : p.lat ?? -6.2;
  const lon = typeof p.lon === "string" ? parseFloat(p.lon) : p.lon ?? 106.816666;
  const zoom = typeof p.zoom === "string" ? parseInt(p.zoom, 10) : p.zoom ?? 14;
  const z = Number.isFinite(zoom) ? zoom : 14;
  const delta = 0.02 / Math.max(1, z - 10);
  const bbox = `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;

  return (
    <section className="guruplus-map">
      <div className="guru-container">
        {(p.eyebrow || p.title || p.edit?.editable) && (
          <div className="guruplus-map__head">
            <EditableField edit={p.edit} field="eyebrow" value={p.eyebrow ?? ""} as="div" className="guru-eyebrow" placeholder="Eyebrow…" hideWhenEmpty />
            <EditableField edit={p.edit} field="title" value={p.title ?? ""} as="h2" placeholder="Lokasi…" hideWhenEmpty />
          </div>
        )}
        <div className="guruplus-map__wrap">
          <iframe src={src} title="Peta lokasi" loading="lazy" className="guruplus-map__frame" />
          <div className="guruplus-map__panel">
            <div className="guruplus-map__label">Alamat</div>
            <EditableField edit={p.edit} field="address" value={p.address ?? ""} as="p" className="guruplus-map__address" placeholder="Alamat sekolah…" multiline />
            {p.directionsHref ? (
              <span className="guruplus-map__cta">
                Lihat petunjuk arah
                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path d="M7 3l10 7-10 7V3z" />
                </svg>
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// GuruPlusSkillBars — animasi dilewati di edit mode (langsung 100% visible)
// ----------------------------------------------------------------------------

export function GuruPlusSkillBarsEditor(p: {
  eyebrow?: string;
  title?: string;
  items?: Array<{ label: string; value: number | string; note?: string }>;
  edit?: GuruEditCtx;
}) {
  const items = p.items ?? [];
  return (
    <section className="guruplus-skills">
      <div className="guru-container">
        {(p.eyebrow || p.title || p.edit?.editable) && (
          <div className="guruplus-skills__head">
            <EditableField edit={p.edit} field="eyebrow" value={p.eyebrow ?? ""} as="div" className="guru-eyebrow" placeholder="Eyebrow…" hideWhenEmpty />
            <EditableField edit={p.edit} field="title" value={p.title ?? ""} as="h2" placeholder="Judul skill…" hideWhenEmpty />
          </div>
        )}
        <div className="guruplus-skills__list">
          {items.map((it, i) => {
            const v = Math.max(0, Math.min(100, toNum(it.value)));
            return (
              <div key={i} className="guruplus-skill">
                <div className="guruplus-skill__meta">
                  <EditableItem edit={p.edit} arrName="items" idx={i} field="label" value={it.label} as="span" className="guruplus-skill__label" placeholder="Nama skill…" />
                  <span className="guruplus-skill__value">{v}%</span>
                </div>
                <div className="guruplus-skill__track">
                  <div className="guruplus-skill__fill" style={{ width: `${v}%` }} />
                </div>
                <EditableItem edit={p.edit} arrName="items" idx={i} field="note" value={it.note ?? ""} as="div" className="guruplus-skill__note" placeholder="Catatan…" />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// GuruPlusAwardShowcase
// ----------------------------------------------------------------------------

export function GuruPlusAwardShowcaseEditor(p: {
  eyebrow?: string;
  title?: string;
  items?: Array<{ rank?: string; title: string; subtitle?: string; year?: string; icon?: string }>;
  edit?: GuruEditCtx;
}) {
  const items = p.items ?? [];
  return (
    <section className="guruplus-awards">
      <div className="guru-container">
        {(p.eyebrow || p.title || p.edit?.editable) && (
          <div className="guruplus-awards__head">
            <EditableField edit={p.edit} field="eyebrow" value={p.eyebrow ?? ""} as="div" className="guru-eyebrow" placeholder="Eyebrow…" hideWhenEmpty />
            <EditableField edit={p.edit} field="title" value={p.title ?? ""} as="h2" placeholder="Judul penghargaan…" hideWhenEmpty />
          </div>
        )}
        <div className="guruplus-awards__grid">
          {items.map((it, i) => (
            <article key={i} className={`guruplus-award guruplus-award--${awardVariant(it.rank, i)}`}>
              <div className="guruplus-award__medal" aria-hidden>
                {it.icon || awardEmoji(it.rank, i)}
              </div>
              <EditableItem edit={p.edit} arrName="items" idx={i} field="rank" value={it.rank ?? ""} as="div" className="guruplus-award__rank" placeholder="Juara 1…" />
              <EditableItem edit={p.edit} arrName="items" idx={i} field="title" value={it.title} as="h3" className="guruplus-award__title" placeholder="Judul…" />
              <EditableItem edit={p.edit} arrName="items" idx={i} field="subtitle" value={it.subtitle ?? ""} as="p" className="guruplus-award__sub" placeholder="Subtitle…" />
              <EditableItem edit={p.edit} arrName="items" idx={i} field="year" value={it.year ?? ""} as="div" className="guruplus-award__year" placeholder="2024" />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function awardVariant(rank: string | undefined, idx: number): string {
  const r = (rank || "").toLowerCase();
  if (r.includes("gold") || r.includes("1") || r.includes("emas") || (idx === 0 && !rank)) return "gold";
  if (r.includes("silver") || r.includes("2") || r.includes("perak") || (idx === 1 && !rank)) return "silver";
  if (r.includes("bronze") || r.includes("3") || r.includes("perunggu") || (idx === 2 && !rank)) return "bronze";
  return "default";
}

function awardEmoji(rank: string | undefined, idx: number): string {
  const v = awardVariant(rank, idx);
  if (v === "gold") return "🥇";
  if (v === "silver") return "🥈";
  if (v === "bronze") return "🥉";
  return "🏅";
}

// ----------------------------------------------------------------------------
// GuruPlusContactCTA
// ----------------------------------------------------------------------------

export function GuruPlusContactCTAEditor(p: {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaHref?: string;
  ctaSecondaryLabel?: string;
  ctaSecondaryHref?: string;
  contacts?: Array<{ icon?: string; label: string; value: string; href?: string }>;
  variant?: "navy" | "cream";
  edit?: GuruEditCtx;
}) {
  const variant = p.variant ?? "navy";
  return (
    <section className={`guruplus-cta guruplus-cta--${variant}`}>
      <div className="guru-container">
        <div className="guruplus-cta__inner">
          <div className="guruplus-cta__text">
            <EditableField edit={p.edit} field="eyebrow" value={p.eyebrow ?? ""} as="div" className="guruplus-cta__eyebrow" placeholder="Eyebrow…" hideWhenEmpty />
            <EditableField edit={p.edit} field="title" value={p.title ?? ""} as="h2" className="guruplus-cta__title" placeholder="Judul CTA…" hideWhenEmpty />
            <EditableField edit={p.edit} field="subtitle" value={p.subtitle ?? ""} as="p" className="guruplus-cta__sub" placeholder="Subtitle…" hideWhenEmpty multiline />
            <div className="guruplus-cta__btns">
              {p.ctaLabel ? <span className="guruplus-cta__btn guruplus-cta__btn--primary">{p.ctaLabel}</span> : null}
              {p.ctaSecondaryLabel ? <span className="guruplus-cta__btn guruplus-cta__btn--ghost">{p.ctaSecondaryLabel}</span> : null}
            </div>
          </div>
          {p.contacts && p.contacts.length > 0 ? (
            <ul className="guruplus-cta__contacts">
              {p.contacts.map((c, i) => (
                <li key={i} className="guruplus-cta__contact">
                  <div>
                    <span className="guruplus-cta__contact-icon" aria-hidden>{c.icon || "•"}</span>
                    <span>
                      <EditableItem edit={p.edit} arrName="contacts" idx={i} field="label" value={c.label} as="small" placeholder="Label…" />
                      <EditableItem edit={p.edit} arrName="contacts" idx={i} field="value" value={c.value} as="strong" placeholder="Nilai…" />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// GuruPlusBookingSlot
// ----------------------------------------------------------------------------

export function GuruPlusBookingSlotEditor(p: {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  slots?: Array<{ day?: string; time: string; status?: "available" | "booked" | "full"; href?: string }>;
  footerNote?: string;
  edit?: GuruEditCtx;
}) {
  const slots = p.slots ?? [];
  return (
    <section className="guruplus-booking">
      <div className="guru-container">
        {(p.eyebrow || p.title || p.subtitle || p.edit?.editable) && (
          <div className="guruplus-booking__head">
            <EditableField edit={p.edit} field="eyebrow" value={p.eyebrow ?? ""} as="div" className="guru-eyebrow" placeholder="Eyebrow…" hideWhenEmpty />
            <EditableField edit={p.edit} field="title" value={p.title ?? ""} as="h2" placeholder="Judul booking…" hideWhenEmpty />
            <EditableField edit={p.edit} field="subtitle" value={p.subtitle ?? ""} as="p" className="guruplus-booking__sub" placeholder="Subtitle…" hideWhenEmpty multiline />
          </div>
        )}
        <div className="guruplus-booking__grid">
          {slots.map((s, i) => {
            const status = s.status ?? "available";
            return (
              <div key={i} className={`guruplus-booking__slot guruplus-booking__slot--${status}`}>
                <EditableItem edit={p.edit} arrName="slots" idx={i} field="day" value={s.day ?? ""} as="div" className="guruplus-booking__day" placeholder="Senin…" />
                <EditableItem edit={p.edit} arrName="slots" idx={i} field="time" value={s.time} as="div" className="guruplus-booking__time" placeholder="09:00" />
                <div className={`guruplus-booking__status guruplus-booking__status--${status}`}>
                  {status === "available" && "Tersedia"}
                  {status === "booked" && "Dipesan"}
                  {status === "full" && "Penuh"}
                </div>
              </div>
            );
          })}
        </div>
        <EditableField edit={p.edit} field="footerNote" value={p.footerNote ?? ""} as="p" className="guruplus-booking__footer" placeholder="Catatan…" hideWhenEmpty />
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// GuruPlusNewsletter — form preview (tidak submit di editor)
// ----------------------------------------------------------------------------

export function GuruPlusNewsletterEditor(p: {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  placeholder?: string;
  buttonLabel?: string;
  disclaimer?: string;
  edit?: GuruEditCtx;
}) {
  return (
    <section className="guruplus-news">
      <div className="guru-container">
        <div className="guruplus-news__card">
          <div className="guruplus-news__text">
            <EditableField edit={p.edit} field="eyebrow" value={p.eyebrow ?? ""} as="div" className="guru-eyebrow" placeholder="Eyebrow…" hideWhenEmpty />
            <EditableField edit={p.edit} field="title" value={p.title ?? ""} as="h2" placeholder="Berlangganan newsletter…" hideWhenEmpty />
            <EditableField edit={p.edit} field="subtitle" value={p.subtitle ?? ""} as="p" className="guruplus-news__sub" placeholder="Subtitle…" hideWhenEmpty multiline />
          </div>
          <div className="guruplus-news__form" aria-hidden>
            <input
              type="email"
              placeholder={p.placeholder || "Email kamu…"}
              className="guruplus-news__input"
              readOnly
            />
            <span className="guruplus-news__btn">{p.buttonLabel || "Langganan"}</span>
          </div>
          <EditableField edit={p.edit} field="disclaimer" value={p.disclaimer ?? ""} as="small" className="guruplus-news__disclaimer" placeholder="Kami tidak akan membagikan email…" hideWhenEmpty />
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// GuruPlusStudentWall
// ----------------------------------------------------------------------------

export function GuruPlusStudentWallEditor(p: {
  eyebrow?: string;
  title?: string;
  items?: Array<{ message: string; author: string; grade?: string; color?: "amber" | "pink" | "blue" | "green" }>;
  edit?: GuruEditCtx;
}) {
  const items = p.items ?? [];
  return (
    <section className="guruplus-wall">
      <div className="guru-container">
        {(p.eyebrow || p.title || p.edit?.editable) && (
          <div className="guruplus-wall__head">
            <EditableField edit={p.edit} field="eyebrow" value={p.eyebrow ?? ""} as="div" className="guru-eyebrow" placeholder="Eyebrow…" hideWhenEmpty />
            <EditableField edit={p.edit} field="title" value={p.title ?? ""} as="h2" placeholder="Judul dinding murid…" hideWhenEmpty />
          </div>
        )}
        <div className="guruplus-wall__grid">
          {items.map((it, i) => {
            const color = it.color || defaultNoteColorEditor(i);
            const tilt = ((i * 37) % 7) - 3;
            return (
              <div key={i} className={`guruplus-wall__note guruplus-wall__note--${color}`} style={{ transform: `rotate(${tilt}deg)` }}>
                <EditableItem edit={p.edit} arrName="items" idx={i} field="message" value={it.message} as="p" className="guruplus-wall__msg" placeholder="Pesan murid…" multiline />
                <div className="guruplus-wall__sig">
                  <EditableItem edit={p.edit} arrName="items" idx={i} field="author" value={it.author} as="span" className="guruplus-wall__author" placeholder="Nama…" />
                  <EditableItem edit={p.edit} arrName="items" idx={i} field="grade" value={it.grade ?? ""} as="span" className="guruplus-wall__grade" placeholder="Kelas 5" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function defaultNoteColorEditor(i: number): "amber" | "pink" | "blue" | "green" {
  const colors: Array<"amber" | "pink" | "blue" | "green"> = ["amber", "pink", "blue", "green"];
  return colors[i % colors.length];
}

// ----------------------------------------------------------------------------
// GuruPlusStoryBlock
// ----------------------------------------------------------------------------

export function GuruPlusStoryBlockEditor(p: {
  eyebrow?: string;
  title?: string;
  byline?: string;
  body?: string;
  pullquote?: string;
  image?: string;
  imageCaption?: string;
  edit?: GuruEditCtx;
}) {
  const paragraphs = (p.body || "").split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  // Body di edit mode diperlakukan sebagai single textarea karena multi-paragraph
  // tidak bisa jadi EditableText terpisah dengan baik.
  return (
    <section className="guruplus-story">
      <div className="guru-container">
        <div className="guruplus-story__wrap">
          <header className="guruplus-story__header">
            <EditableField edit={p.edit} field="eyebrow" value={p.eyebrow ?? ""} as="div" className="guru-eyebrow" placeholder="Eyebrow…" hideWhenEmpty />
            <EditableField edit={p.edit} field="title" value={p.title ?? ""} as="h2" className="guruplus-story__title" placeholder="Judul cerita…" hideWhenEmpty />
            <EditableField edit={p.edit} field="byline" value={p.byline ?? ""} as="div" className="guruplus-story__byline" placeholder="Oleh … · Tanggal" hideWhenEmpty />
          </header>
          {p.image ? (
            <figure className="guruplus-story__figure">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.image} alt={p.imageCaption ?? ""} />
              <EditableField edit={p.edit} field="imageCaption" value={p.imageCaption ?? ""} as="div" placeholder="Caption foto…" hideWhenEmpty />
            </figure>
          ) : null}
          <div className="guruplus-story__body">
            {paragraphs.length > 0 ? (
              paragraphs.map((para, i) => (
                <p key={i} className={i === 0 ? "guruplus-story__p guruplus-story__p--first" : "guruplus-story__p"}>
                  {para}
                </p>
              ))
            ) : (
              <p className="guruplus-story__p" style={{ color: "#8aa", fontStyle: "italic" }}>
                Isi badan cerita di panel kanan (pisahkan paragraf dengan baris kosong) →
              </p>
            )}
          </div>
          {p.pullquote ? (
            <blockquote className="guruplus-story__pullquote">
              <span className="guruplus-story__pullquote-mark" aria-hidden>&ldquo;</span>
              <EditableField edit={p.edit} field="pullquote" value={p.pullquote} as="p" placeholder="Pullquote…" multiline />
            </blockquote>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// GuruPlusStylesEditor — inject CSS sekali di editor root (mirror pattern dari
// GuruStylesEditor).
// ----------------------------------------------------------------------------

export function GuruPlusStylesEditor() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
.guruplus-faq,.guruplus-stats,.guruplus-timeline,.guruplus-testi,.guruplus-shelf,.guruplus-video,.guruplus-photos,.guruplus-audio,.guruplus-certs,.guruplus-ba,.guruplus-lesson,.guruplus-map,.guruplus-skills,.guruplus-awards,.guruplus-cta,.guruplus-booking,.guruplus-news,.guruplus-wall,.guruplus-story{padding:72px 0;background:var(--guru-cream,#fbf8f1);color:var(--guru-ink,#263247);font-family:var(--font-body,Inter),system-ui,sans-serif}
.guruplus-faq__head,.guruplus-stats__head,.guruplus-timeline__head,.guruplus-testi__head,.guruplus-shelf__head,.guruplus-video__head,.guruplus-photos__head,.guruplus-audio__head,.guruplus-certs__head,.guruplus-ba__head,.guruplus-lesson__head,.guruplus-map__head,.guruplus-skills__head,.guruplus-awards__head,.guruplus-booking__head,.guruplus-wall__head{margin-bottom:40px;max-width:680px}
.guruplus-faq__head h2,.guruplus-stats__head h2,.guruplus-timeline__head h2,.guruplus-testi__head h2,.guruplus-shelf__head h2,.guruplus-video__head h2,.guruplus-photos__head h2,.guruplus-audio__head h2,.guruplus-certs__head h2,.guruplus-ba__head h2,.guruplus-lesson__head h2,.guruplus-map__head h2,.guruplus-skills__head h2,.guruplus-awards__head h2,.guruplus-booking__head h2,.guruplus-wall__head h2{font-family:var(--font-heading,Georgia),serif;font-size:clamp(28px,3.5vw,44px);letter-spacing:-.035em;line-height:1.15;color:var(--guru-navy,#14233b);margin:0}
.guruplus-faq__list{display:grid;gap:12px;max-width:820px}
.guruplus-faq__item{background:var(--guru-paper,#fff);border:1px solid var(--guru-line,#e9e5dc);border-radius:18px;overflow:hidden;transition:border-color .25s ease,box-shadow .25s ease}
.guruplus-faq__item[open]{border-color:color-mix(in srgb,var(--guru-navy,#14233b) 30%,var(--guru-line,#e9e5dc));box-shadow:0 10px 30px color-mix(in srgb,var(--guru-navy,#14233b) 8%,transparent)}
.guruplus-faq__item summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:18px;padding:22px 24px;outline:none}
.guruplus-faq__item summary::-webkit-details-marker{display:none}
.guruplus-faq__num{font-family:var(--font-heading,Georgia),serif;font-size:28px;font-weight:800;line-height:1;color:var(--guru-navy,#14233b);min-width:52px;letter-spacing:-.02em;opacity:.6;transition:opacity .2s ease}
.guruplus-faq__item[open] .guruplus-faq__num{opacity:1}
.guruplus-faq__q{flex:1;font-size:17px;font-weight:650;color:var(--guru-navy,#14233b);line-height:1.4}
.guruplus-faq__chev{flex-shrink:0;color:var(--guru-muted,#6f7888);transition:transform .25s ease,color .25s ease}
.guruplus-faq__chev svg{width:22px;height:22px}
.guruplus-faq__item[open] .guruplus-faq__chev{transform:rotate(180deg);color:var(--guru-navy,#14233b)}
.guruplus-faq__a{padding:0 24px 22px 94px;color:var(--guru-muted,#6f7888);line-height:1.7}
.guruplus-faq__a p{margin:0}
.guruplus-stats__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px}
.guruplus-stats__card{background:var(--guru-paper,#fff);border:1px solid var(--guru-line,#e9e5dc);border-radius:22px;padding:36px 28px;text-align:center;transition:transform .3s ease,box-shadow .3s ease}
.guruplus-stats__card:hover{transform:translateY(-4px);box-shadow:0 20px 50px color-mix(in srgb,var(--guru-navy,#14233b) 15%,transparent)}
.guruplus-stats__num{font-family:var(--font-heading,Georgia),serif;font-size:clamp(42px,5vw,64px);font-weight:700;line-height:1;letter-spacing:-.03em;color:var(--guru-navy,#14233b);display:inline-flex;align-items:baseline;gap:4px;font-variant-numeric:tabular-nums}
.guruplus-stats__suffix{font-size:.6em;color:var(--guru-red,#b6423d);font-weight:700}
.guruplus-stats__label{margin-top:12px;font-size:13px;font-weight:650;text-transform:uppercase;letter-spacing:.08em;color:var(--guru-muted,#6f7888)}
.guruplus-tl{position:relative;padding-left:36px;max-width:720px}
.guruplus-tl::before{content:"";position:absolute;left:11px;top:8px;bottom:8px;width:2px;background:linear-gradient(to bottom,var(--guru-navy,#14233b) 0%,color-mix(in srgb,var(--guru-navy,#14233b) 30%,transparent) 100%)}
.guruplus-tl__item{position:relative;padding:0 0 36px;opacity:0;transform:translateY(14px);transition:opacity .55s ease,transform .55s ease}
.guruplus-tl__item.is-visible{opacity:1;transform:translateY(0)}
.guruplus-tl__item:last-child{padding-bottom:0}
.guruplus-tl__dot{position:absolute;left:-30px;top:6px;width:14px;height:14px;border-radius:50%;background:var(--guru-navy,#14233b);box-shadow:0 0 0 4px var(--guru-cream,#fbf8f1),0 0 0 5px color-mix(in srgb,var(--guru-navy,#14233b) 25%,transparent)}
.guruplus-tl__year{font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--guru-red,#b6423d);margin-bottom:6px}
.guruplus-tl__title{font-family:var(--font-heading,Georgia),serif;font-size:22px;color:var(--guru-navy,#14233b);margin:0;line-height:1.2}
.guruplus-tl__desc{margin:8px 0 0;color:var(--guru-muted,#6f7888);line-height:1.7;font-size:15px;max-width:520px}
.guruplus-testi__grid{columns:3;column-gap:20px}
@media(max-width:900px){.guruplus-testi__grid{columns:2}}
@media(max-width:600px){.guruplus-testi__grid{columns:1}}
.guruplus-testi__card{break-inside:avoid;margin:0 0 20px;background:var(--guru-paper,#fff);border:1px solid var(--guru-line,#e9e5dc);border-radius:22px;padding:24px;transition:transform .25s ease,box-shadow .25s ease,border-color .25s ease}
.guruplus-testi__card:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--guru-red,#b6423d) 30%,var(--guru-line,#e9e5dc));box-shadow:0 16px 40px color-mix(in srgb,var(--guru-navy,#14233b) 10%,transparent)}
.guruplus-testi__card blockquote{font-family:var(--font-heading,Georgia),serif;font-size:17px;line-height:1.55;letter-spacing:-.005em;color:var(--guru-navy,#14233b);margin:0 0 16px}
.guruplus-testi__card figcaption{display:flex;align-items:center;gap:12px;font-size:13px;color:var(--guru-muted,#6f7888)}
.guruplus-testi__card figcaption strong{display:block;font-weight:700;color:var(--guru-navy,#14233b)}
.guruplus-testi__card figcaption small{display:block;font-size:11px;margin-top:1px;text-transform:uppercase;letter-spacing:.05em}
.guruplus-testi__avatar{width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0}
.guruplus-testi__avatar--initials{display:grid;place-items:center;background:color-mix(in srgb,var(--guru-red,#b6423d) 15%,var(--guru-cream,#fbf8f1));color:var(--guru-red,#b6423d);font-weight:700;font-size:14px;letter-spacing:.02em}
.guruplus-marquee{padding:28px 0;overflow:hidden;background:var(--guru-navy,#14233b);color:color-mix(in srgb,var(--guru-cream,#fbf8f1) 65%,#ffffff);position:relative}
.guruplus-marquee::before,.guruplus-marquee::after{content:"";position:absolute;top:0;bottom:0;width:80px;z-index:2;pointer-events:none}
.guruplus-marquee::before{left:0;background:linear-gradient(to right,var(--guru-navy,#14233b),transparent)}
.guruplus-marquee::after{right:0;background:linear-gradient(to left,var(--guru-navy,#14233b),transparent)}
.guruplus-marquee__track{display:flex;gap:48px;width:max-content;animation:guruplus-marquee 32s linear infinite}
.guruplus-marquee--slow .guruplus-marquee__track{animation-duration:52s}
.guruplus-marquee--fast .guruplus-marquee__track{animation-duration:18s}
.guruplus-marquee__item{display:inline-flex;align-items:center;gap:14px;font-family:var(--font-heading,Georgia),serif;font-size:22px;letter-spacing:-.01em;white-space:nowrap}
.guruplus-marquee__dot{color:var(--guru-red,#b6423d);font-size:14px;opacity:.7}
@keyframes guruplus-marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.guruplus-shelf__grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:28px 24px}
.guruplus-shelf__card{background:var(--guru-paper,#fff);border:1px solid var(--guru-line,#e9e5dc);border-radius:16px;overflow:hidden;display:flex;flex-direction:column;transition:transform .35s cubic-bezier(.2,.9,.3,1),box-shadow .35s ease}
.guruplus-shelf__card:hover{transform:translateY(-6px) rotate(-.3deg);box-shadow:0 24px 50px color-mix(in srgb,var(--guru-navy,#14233b) 18%,transparent)}
.guruplus-shelf__cover{aspect-ratio:3/4;overflow:hidden;background:var(--guru-cream,#fbf8f1);position:relative}
.guruplus-shelf__cover img{width:100%;height:100%;object-fit:cover;transition:transform .5s ease}
.guruplus-shelf__card:hover .guruplus-shelf__cover img{transform:scale(1.04)}
.guruplus-shelf__fallback{position:absolute;inset:0;display:grid;place-items:center;background:linear-gradient(135deg,var(--guru-navy,#14233b) 0%,color-mix(in srgb,var(--guru-navy,#14233b) 70%,var(--guru-red,#b6423d)) 100%);color:#fff}
.guruplus-shelf__fallback span{font-family:var(--font-heading,Georgia),serif;font-size:48px;font-weight:700;letter-spacing:.02em}
.guruplus-shelf__body{padding:16px 18px 20px}
.guruplus-shelf__title{font-family:var(--font-heading,Georgia),serif;font-size:17px;color:var(--guru-navy,#14233b);margin:0 0 4px;line-height:1.3}
.guruplus-shelf__author{font-size:13px;color:var(--guru-muted,#6f7888);font-weight:600}
.guruplus-shelf__year{font-size:11px;color:var(--guru-red,#b6423d);font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-top:4px}
.guruplus-shelf__note{margin:10px 0 0;font-size:13px;line-height:1.6;color:var(--guru-muted,#6f7888)}
.guruplus-video__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:24px}
.guruplus-video__card{background:var(--guru-paper,#fff);border:1px solid var(--guru-line,#e9e5dc);border-radius:20px;overflow:hidden;transition:transform .3s ease,box-shadow .3s ease}
.guruplus-video__card:hover{transform:translateY(-3px);box-shadow:0 18px 40px color-mix(in srgb,var(--guru-navy,#14233b) 14%,transparent)}
.guruplus-video__frame{position:relative;aspect-ratio:16/9;background:#000;overflow:hidden}
.guruplus-video__thumb{all:unset;cursor:pointer;position:absolute;inset:0;display:block;width:100%;height:100%}
.guruplus-video__thumb img{width:100%;height:100%;object-fit:cover}
.guruplus-video__thumb-fallback{position:absolute;inset:0;background:linear-gradient(135deg,var(--guru-navy,#14233b),color-mix(in srgb,var(--guru-navy,#14233b) 50%,var(--guru-red,#b6423d)))}
.guruplus-video__play{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none}
.guruplus-video__play svg{width:72px;height:72px;color:#fff;filter:drop-shadow(0 6px 18px rgba(0,0,0,.4))}
.guruplus-video__body{padding:18px 20px 22px}
.guruplus-video__title{font-family:var(--font-heading,Georgia),serif;font-size:19px;color:var(--guru-navy,#14233b);margin:0 0 6px;line-height:1.3}
.guruplus-video__desc{margin:0;font-size:14px;line-height:1.6;color:var(--guru-muted,#6f7888)}
.guruplus-photos__grid{display:grid;grid-template-columns:repeat(6,1fr);grid-auto-rows:140px;gap:14px}
.guruplus-photos__cell{position:relative;overflow:hidden;border-radius:16px;margin:0;background:var(--guru-paper,#fff)}
.guruplus-photos__cell img{width:100%;height:100%;object-fit:cover;display:block}
.guruplus-photos__cell figcaption{position:absolute;left:0;right:0;bottom:0;padding:14px 16px;color:#fff;background:linear-gradient(to top,rgba(0,0,0,.75),transparent);display:flex;flex-direction:column;gap:2px;font-size:13px}
.guruplus-photos__cap{font-weight:600;line-height:1.3}
.guruplus-photos__meta{font-size:11px;opacity:.8;letter-spacing:.05em;text-transform:uppercase}
.guruplus-photos__cell--0{grid-column:span 4;grid-row:span 2}
.guruplus-photos__cell--1{grid-column:span 2;grid-row:span 1}
.guruplus-photos__cell--2{grid-column:span 2;grid-row:span 1}
.guruplus-photos__cell--3{grid-column:span 3;grid-row:span 2}
.guruplus-photos__cell--4{grid-column:span 3;grid-row:span 1}
.guruplus-photos__cell--5{grid-column:span 3;grid-row:span 1}
.guruplus-audio__list{list-style:none;padding:0;margin:0;display:grid;gap:16px;max-width:820px}
.guruplus-audio__row{display:grid;grid-template-columns:88px 1fr;gap:18px;background:var(--guru-paper,#fff);border:1px solid var(--guru-line,#e9e5dc);border-radius:18px;padding:16px}
.guruplus-audio__cover{aspect-ratio:1/1;border-radius:12px;overflow:hidden;background:linear-gradient(135deg,var(--guru-navy,#14233b),color-mix(in srgb,var(--guru-navy,#14233b) 60%,var(--guru-red,#b6423d)));display:grid;place-items:center;color:#fff;flex-shrink:0}
.guruplus-audio__cover img{width:100%;height:100%;object-fit:cover}
.guruplus-audio__num{font-family:var(--font-heading,Georgia),serif;font-size:28px;font-weight:700;letter-spacing:-.02em}
.guruplus-audio__body{display:flex;flex-direction:column;gap:8px;min-width:0}
.guruplus-audio__meta{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.guruplus-audio__title{font-family:var(--font-heading,Georgia),serif;font-size:18px;color:var(--guru-navy,#14233b);margin:0;line-height:1.3}
.guruplus-audio__dur{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--guru-red,#b6423d)}
.guruplus-audio__desc{margin:0;font-size:13px;line-height:1.6;color:var(--guru-muted,#6f7888)}
.guruplus-audio__player{width:100%;max-width:100%;margin-top:4px;border-radius:999px;outline:none}
.guruplus-certs__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}
.guruplus-certs__card{display:flex;flex-direction:column;text-decoration:none;color:inherit;background:var(--guru-paper,#fff);border:1px solid var(--guru-line,#e9e5dc);border-radius:18px;overflow:hidden;transition:transform .3s ease,box-shadow .3s ease}
.guruplus-certs__card:hover{transform:translateY(-4px) rotate(.2deg);box-shadow:0 16px 40px color-mix(in srgb,var(--guru-navy,#14233b) 15%,transparent)}
.guruplus-certs__image{aspect-ratio:4/3;overflow:hidden;background:var(--guru-cream,#fbf8f1);display:grid;place-items:center}
.guruplus-certs__image img{width:100%;height:100%;object-fit:cover;display:block}
.guruplus-certs__ribbon{color:var(--guru-red,#b6423d);opacity:.5}
.guruplus-certs__ribbon svg{width:72px;height:72px}
.guruplus-certs__body{padding:18px 20px 22px}
.guruplus-certs__title{font-family:var(--font-heading,Georgia),serif;font-size:17px;color:var(--guru-navy,#14233b);margin:0 0 6px;line-height:1.3}
.guruplus-certs__issuer{font-size:13px;color:var(--guru-muted,#6f7888);font-weight:600}
.guruplus-certs__date{margin-top:4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--guru-red,#b6423d);font-weight:700}
.guruplus-ba__wrap{position:relative;overflow:hidden;border-radius:22px;aspect-ratio:16/9;max-width:960px;cursor:ew-resize;user-select:none;touch-action:none;border:1px solid var(--guru-line,#e9e5dc);background:#000}
.guruplus-ba__img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none}
.guruplus-ba__clip{position:absolute;inset:0;will-change:clip-path}
.guruplus-ba__divider{position:absolute;top:0;bottom:0;width:3px;background:var(--guru-cream,#fbf8f1);transform:translateX(-50%);pointer-events:none;box-shadow:0 0 20px rgba(0,0,0,.4)}
.guruplus-ba__handle{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:44px;height:44px;border-radius:50%;background:var(--guru-cream,#fbf8f1);color:var(--guru-navy,#14233b);display:grid;place-items:center;box-shadow:0 4px 16px rgba(0,0,0,.3);pointer-events:auto}
.guruplus-ba__handle svg{width:22px;height:22px}
.guruplus-ba__label{position:absolute;top:16px;padding:6px 12px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;background:rgba(0,0,0,.6);color:#fff}
.guruplus-ba__label--before{left:16px}
.guruplus-ba__label--after{right:16px}
.guruplus-ba__caption{margin:16px 0 0;max-width:960px;font-size:14px;color:var(--guru-muted,#6f7888);line-height:1.6}
.guruplus-lesson__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}
.guruplus-lesson__card{background:var(--guru-paper,#fff);border:1px solid var(--guru-line,#e9e5dc);border-radius:22px;padding:28px 24px;display:flex;flex-direction:column;gap:12px;transition:transform .3s ease,box-shadow .3s ease,border-color .3s ease}
.guruplus-lesson__card:hover{transform:translateY(-4px);border-color:color-mix(in srgb,var(--guru-navy,#14233b) 20%,var(--guru-line,#e9e5dc));box-shadow:0 18px 40px color-mix(in srgb,var(--guru-navy,#14233b) 12%,transparent)}
.guruplus-lesson__icon{width:52px;height:52px;border-radius:14px;background:color-mix(in srgb,var(--guru-red,#b6423d) 12%,var(--guru-cream,#fbf8f1));display:grid;place-items:center;font-size:26px}
.guruplus-lesson__badges{display:flex;gap:8px;flex-wrap:wrap}
.guruplus-lesson__level,.guruplus-lesson__dur{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:4px 10px;border-radius:999px}
.guruplus-lesson__level{background:color-mix(in srgb,var(--guru-navy,#14233b) 10%,var(--guru-cream,#fbf8f1));color:var(--guru-navy,#14233b)}
.guruplus-lesson__dur{background:color-mix(in srgb,var(--guru-red,#b6423d) 12%,var(--guru-cream,#fbf8f1));color:var(--guru-red,#b6423d)}
.guruplus-lesson__title{font-family:var(--font-heading,Georgia),serif;font-size:20px;color:var(--guru-navy,#14233b);margin:0;line-height:1.3}
.guruplus-lesson__desc{margin:0;font-size:14px;line-height:1.6;color:var(--guru-muted,#6f7888);flex:1}
.guruplus-lesson__cta{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:var(--guru-navy,#14233b);text-decoration:none;padding-top:4px}
.guruplus-lesson__cta svg{width:14px;height:14px}
.guruplus-map__wrap{display:grid;grid-template-columns:2fr 1fr;gap:0;border:1px solid var(--guru-line,#e9e5dc);border-radius:22px;overflow:hidden;background:var(--guru-paper,#fff)}
.guruplus-map__frame{width:100%;min-height:360px;border:0;display:block}
.guruplus-map__panel{padding:28px 24px;display:flex;flex-direction:column;gap:14px;border-left:1px solid var(--guru-line,#e9e5dc)}
.guruplus-map__label{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--guru-red,#b6423d)}
.guruplus-map__address{margin:0;font-size:15px;line-height:1.6;color:var(--guru-navy,#14233b);font-weight:600}
.guruplus-map__cta{display:inline-flex;align-items:center;gap:6px;align-self:flex-start;padding:10px 18px;border-radius:999px;background:var(--guru-navy,#14233b);color:var(--guru-cream,#fbf8f1);font-size:13px;font-weight:700;text-decoration:none}
.guruplus-map__cta svg{width:12px;height:12px}
.guruplus-skills__list{display:grid;gap:22px;max-width:720px}
.guruplus-skill{display:flex;flex-direction:column;gap:8px}
.guruplus-skill__meta{display:flex;justify-content:space-between;align-items:baseline}
.guruplus-skill__label{font-size:14px;font-weight:650;color:var(--guru-navy,#14233b)}
.guruplus-skill__value{font-family:var(--font-heading,Georgia),serif;font-size:16px;font-weight:700;color:var(--guru-red,#b6423d);font-variant-numeric:tabular-nums}
.guruplus-skill__track{position:relative;height:10px;border-radius:999px;overflow:hidden;background:color-mix(in srgb,var(--guru-navy,#14233b) 8%,var(--guru-cream,#fbf8f1))}
.guruplus-skill__fill{position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(to right,var(--guru-navy,#14233b),var(--guru-red,#b6423d));border-radius:999px}
.guruplus-skill__note{font-size:12px;color:var(--guru-muted,#6f7888)}
.guruplus-awards__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px}
.guruplus-award{text-align:center;padding:36px 24px;background:var(--guru-paper,#fff);border:1px solid var(--guru-line,#e9e5dc);border-radius:22px;display:flex;flex-direction:column;align-items:center;gap:10px}
.guruplus-award__medal{width:72px;height:72px;border-radius:50%;display:grid;place-items:center;font-size:36px;background:color-mix(in srgb,var(--guru-cream,#fbf8f1) 50%,#fff);box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--guru-navy,#14233b) 10%,transparent)}
.guruplus-award--gold .guruplus-award__medal{background:linear-gradient(135deg,#fff2c4,#f4c759);box-shadow:inset 0 0 0 2px #d4a52b,0 8px 24px rgba(212,165,43,.3)}
.guruplus-award--silver .guruplus-award__medal{background:linear-gradient(135deg,#f2f2f2,#c3c6cb);box-shadow:inset 0 0 0 2px #9ba1a9,0 8px 24px rgba(155,161,169,.3)}
.guruplus-award--bronze .guruplus-award__medal{background:linear-gradient(135deg,#f3d4b4,#c48553);box-shadow:inset 0 0 0 2px #9d6a44,0 8px 24px rgba(157,106,68,.3)}
.guruplus-award__rank{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--guru-red,#b6423d)}
.guruplus-award__title{font-family:var(--font-heading,Georgia),serif;font-size:18px;color:var(--guru-navy,#14233b);margin:0;line-height:1.3}
.guruplus-award__sub{margin:0;font-size:13px;line-height:1.5;color:var(--guru-muted,#6f7888)}
.guruplus-award__year{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--guru-muted,#6f7888);margin-top:4px}
.guruplus-cta--navy{background:var(--guru-navy,#14233b);color:var(--guru-cream,#fbf8f1)}
.guruplus-cta--cream{background:var(--guru-cream,#fbf8f1);color:var(--guru-ink,#263247)}
.guruplus-cta__inner{display:grid;grid-template-columns:1.3fr 1fr;gap:48px;align-items:center}
.guruplus-cta__eyebrow{font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--guru-red,#b6423d);margin-bottom:12px}
.guruplus-cta--navy .guruplus-cta__eyebrow{color:color-mix(in srgb,var(--guru-red,#b6423d) 70%,var(--guru-cream,#fbf8f1))}
.guruplus-cta__title{font-family:var(--font-heading,Georgia),serif;font-size:clamp(32px,4vw,52px);letter-spacing:-.03em;line-height:1.12;margin:0}
.guruplus-cta__sub{margin:16px 0 0;font-size:17px;line-height:1.6;opacity:.85;max-width:540px}
.guruplus-cta__btns{display:flex;gap:12px;margin-top:28px;flex-wrap:wrap}
.guruplus-cta__btn{display:inline-flex;align-items:center;gap:8px;padding:14px 28px;border-radius:999px;font-size:15px;font-weight:700;text-decoration:none}
.guruplus-cta__btn--primary{background:var(--guru-red,#b6423d);color:#fff}
.guruplus-cta__btn--ghost{background:transparent;color:inherit;box-shadow:inset 0 0 0 1.5px currentColor}
.guruplus-cta__contacts{list-style:none;padding:0;margin:0;display:grid;gap:12px}
.guruplus-cta__contact a,.guruplus-cta__contact>div{display:flex;align-items:center;gap:16px;padding:16px 20px;border-radius:16px;text-decoration:none;color:inherit;background:color-mix(in srgb,currentColor 6%,transparent)}
.guruplus-cta__contact-icon{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font-size:18px;flex-shrink:0;background:color-mix(in srgb,var(--guru-red,#b6423d) 15%,transparent)}
.guruplus-cta__contact small{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.6}
.guruplus-cta__contact strong{display:block;font-size:15px;font-weight:700;margin-top:2px}
.guruplus-booking__sub{margin:12px 0 0;color:var(--guru-muted,#6f7888);line-height:1.6;font-size:15px}
.guruplus-booking__grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px}
.guruplus-booking__slot{display:flex;flex-direction:column;align-items:center;gap:6px;padding:20px 16px;border-radius:16px;background:var(--guru-paper,#fff);border:1px solid var(--guru-line,#e9e5dc);text-decoration:none;color:inherit}
.guruplus-booking__slot--booked{opacity:.55}
.guruplus-booking__slot--full{opacity:.4;background:color-mix(in srgb,var(--guru-muted,#6f7888) 10%,var(--guru-paper,#fff))}
.guruplus-booking__day{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--guru-muted,#6f7888)}
.guruplus-booking__time{font-family:var(--font-heading,Georgia),serif;font-size:22px;font-weight:700;color:var(--guru-navy,#14233b);letter-spacing:-.01em}
.guruplus-booking__status{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:3px 10px;border-radius:999px;margin-top:4px}
.guruplus-booking__status--available{background:color-mix(in srgb,#16a34a 15%,var(--guru-cream,#fbf8f1));color:#16a34a}
.guruplus-booking__status--booked{background:color-mix(in srgb,var(--guru-red,#b6423d) 15%,var(--guru-cream,#fbf8f1));color:var(--guru-red,#b6423d)}
.guruplus-booking__status--full{background:color-mix(in srgb,var(--guru-muted,#6f7888) 20%,var(--guru-cream,#fbf8f1));color:var(--guru-muted,#6f7888)}
.guruplus-booking__footer{margin:28px 0 0;font-size:13px;color:var(--guru-muted,#6f7888)}
.guruplus-news__card{background:linear-gradient(135deg,var(--guru-navy,#14233b) 0%,color-mix(in srgb,var(--guru-navy,#14233b) 70%,var(--guru-red,#b6423d)) 100%);color:var(--guru-cream,#fbf8f1);border-radius:28px;padding:56px 48px;display:grid;grid-template-columns:1.1fr 1fr;gap:40px;align-items:center}
.guruplus-news__text h2{font-family:var(--font-heading,Georgia),serif;font-size:clamp(26px,3vw,38px);line-height:1.2;letter-spacing:-.025em;margin:0}
.guruplus-news__sub{margin:12px 0 0;font-size:15px;line-height:1.6;opacity:.85}
.guruplus-news__form{display:flex;gap:8px;align-items:stretch;background:#fff;border-radius:999px;padding:6px}
.guruplus-news__input{flex:1;min-width:0;border:0;outline:none;background:transparent;padding:10px 20px;font-size:15px;color:var(--guru-navy,#14233b)}
.guruplus-news__btn{background:var(--guru-navy,#14233b);color:#fff;border:0;padding:12px 24px;border-radius:999px;font-size:14px;font-weight:700}
.guruplus-news__disclaimer{grid-column:1/-1;display:block;margin-top:16px;font-size:12px;opacity:.7;line-height:1.5}
.guruplus-wall__grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:24px}
.guruplus-wall__note{padding:24px 20px 20px;border-radius:4px;min-height:180px;display:flex;flex-direction:column;justify-content:space-between;font-family:var(--font-handwriting,"Caveat","Comic Sans MS",cursive,var(--font-body));box-shadow:0 10px 24px rgba(0,0,0,.12),0 2px 4px rgba(0,0,0,.06);position:relative}
.guruplus-wall__note::before{content:"";position:absolute;top:-8px;left:50%;transform:translateX(-50%);width:40px;height:12px;background:rgba(0,0,0,.1);border-radius:0 0 4px 4px}
.guruplus-wall__note--amber{background:#fde68a;color:#78350f}
.guruplus-wall__note--pink{background:#fbcfe8;color:#831843}
.guruplus-wall__note--blue{background:#bfdbfe;color:#1e3a8a}
.guruplus-wall__note--green{background:#bbf7d0;color:#14532d}
.guruplus-wall__msg{margin:0;font-size:20px;line-height:1.35;font-weight:500}
.guruplus-wall__sig{display:flex;flex-direction:column;gap:1px;margin-top:14px;font-family:var(--font-body,Inter),system-ui,sans-serif}
.guruplus-wall__author{font-weight:700;font-size:13px}
.guruplus-wall__grade{font-size:11px;opacity:.75;letter-spacing:.05em;text-transform:uppercase}
.guruplus-story__wrap{max-width:720px;margin:0 auto}
.guruplus-story__header{margin-bottom:28px;text-align:center}
.guruplus-story__title{font-family:var(--font-heading,Georgia),serif;font-size:clamp(32px,4vw,52px);letter-spacing:-.03em;line-height:1.1;color:var(--guru-navy,#14233b);margin:12px 0 0}
.guruplus-story__byline{margin-top:12px;font-size:13px;color:var(--guru-muted,#6f7888);letter-spacing:.04em}
.guruplus-story__figure{margin:0 -40px 36px;border-radius:20px;overflow:hidden;background:var(--guru-paper,#fff)}
.guruplus-story__figure img{width:100%;height:auto;display:block;max-height:460px;object-fit:cover}
.guruplus-story__figure figcaption{padding:12px 20px;font-size:13px;color:var(--guru-muted,#6f7888);background:var(--guru-cream,#fbf8f1);border-top:1px solid var(--guru-line,#e9e5dc)}
.guruplus-story__body{display:flex;flex-direction:column;gap:18px}
.guruplus-story__p{margin:0;font-size:18px;line-height:1.75;color:var(--guru-ink,#263247);font-family:var(--font-body,Inter),system-ui,sans-serif}
.guruplus-story__p--first::first-letter{float:left;font-family:var(--font-heading,Georgia),serif;font-size:72px;line-height:.85;padding:8px 12px 0 0;color:var(--guru-red,#b6423d);font-weight:700}
.guruplus-story__pullquote{position:relative;margin:32px -32px;padding:28px 44px;border-left:4px solid var(--guru-red,#b6423d)}
.guruplus-story__pullquote-mark{position:absolute;top:-16px;left:16px;font-family:var(--font-heading,Georgia),serif;font-size:72px;line-height:1;color:var(--guru-red,#b6423d);opacity:.3}
.guruplus-story__pullquote p{margin:0;font-family:var(--font-heading,Georgia),serif;font-size:24px;line-height:1.4;color:var(--guru-navy,#14233b);font-weight:500;letter-spacing:-.015em}
@media(prefers-reduced-motion:reduce){.guruplus-tl__item{opacity:1;transform:none;transition:none}.guruplus-marquee__track{animation:none}.guruplus-stats__card,.guruplus-testi__card,.guruplus-shelf__card,.guruplus-video__card,.guruplus-certs__card,.guruplus-lesson__card,.guruplus-award,.guruplus-wall__note{transition:none}}
`,
      }}
    />
  );
}
