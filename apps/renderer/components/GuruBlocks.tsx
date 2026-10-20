// GuruBlocks.tsx — Custom block set khusus untuk template "guru-pandi-upi"
// (co-branding PANDI × UPI). Dipanggil dari Blocks.tsx dispatcher untuk block
// type dengan prefix "Guru*".
//
// Design decisions:
//   - Semua block server-render (no JS) — konsisten dengan renderer pattern.
//     Carousel pakai CSS scroll-snap supaya tetap interaktif tanpa client bundle.
//   - Style inline / scoped supaya tidak conflict dengan tailwind global.
//   - Palette pakai CSS var (--color-primary, --color-secondary, --color-bg,
//     --color-fg) yang di-set dari theme site — tetap themeable user.
//   - Font pakai var --font-heading (Georgia default di template ini) dan
//     --font-body (Inter default).

// ---------------------------------------------------------------------------
// GuruHero — Hero 2-kolom: text kiri + illustration kanan dengan blob bg
// + 2 floating notes absolute. Faithful mockup hero-grid section.
// ---------------------------------------------------------------------------

// noteStyle — build inline style dari X/Y user, hanya include property yang
// ada nilainya (jangan override CSS default kalau user tidak set).
function noteStyle(opts: {
  left?: number | string;
  top?: number | string;
  right?: number | string;
  bottom?: number | string;
}): React.CSSProperties {
  const s: React.CSSProperties = {};
  const norm = (v: number | string | undefined) =>
    v === undefined || v === "" ? undefined : typeof v === "number" ? `${v}px` : String(v);
  const l = norm(opts.left);
  const t = norm(opts.top);
  const r = norm(opts.right);
  const b = norm(opts.bottom);
  if (l !== undefined) s.left = l;
  if (t !== undefined) s.top = t;
  if (r !== undefined) s.right = r;
  if (b !== undefined) s.bottom = b;
  return s;
}

export function GuruHero(p: {
  eyebrow?: string;
  title?: string;
  titleEm?: string; // bagian title yang jadi warna secondary + italic
  subtitle?: string;
  ctaLabel?: string;
  ctaHref?: string;
  ctaSecondaryLabel?: string;
  ctaSecondaryHref?: string;
  image?: string;
  imageAlt?: string;
  stats?: Array<{ value: string; label: string }>;
  // Floating notes — 2 kartu absolute yang menempel di visual figure.
  // *Show="hide"* sembunyikan note (default show). *X/Y* override posisi
  // default (px) supaya user bisa geser note biar tidak nutupi wajah.
  noteAText?: string;
  noteASub?: string;
  noteAShow?: "show" | "hide";
  noteAX?: number | string;
  noteAY?: number | string;
  noteBText?: string;
  noteBSub?: string;
  noteBShow?: "show" | "hide";
  noteBX?: number | string;
  noteBY?: number | string;
}) {
  return (
    <section className="guru-hero">
      <div className="guru-hero__blob" aria-hidden />
      <div className="guru-container guru-hero__grid">
        <div>
          {p.eyebrow ? <div className="guru-eyebrow">{p.eyebrow}</div> : null}
          <h1 className="guru-hero__title">
            {p.title}
            {p.titleEm ? (
              <>
                <br />
                <em>{p.titleEm}</em>
              </>
            ) : null}
          </h1>
          {p.subtitle ? <p className="guru-hero__lead">{p.subtitle}</p> : null}
          {(p.ctaLabel || p.ctaSecondaryLabel) && (
            <div className="guru-hero__actions">
              {p.ctaLabel ? (
                <a className="guru-btn guru-btn--primary" href={p.ctaHref ?? "#"}>
                  {p.ctaLabel} <span>→</span>
                </a>
              ) : null}
              {p.ctaSecondaryLabel ? (
                <a
                  className="guru-btn guru-btn--secondary"
                  href={p.ctaSecondaryHref ?? "#"}
                >
                  {p.ctaSecondaryLabel}
                </a>
              ) : null}
            </div>
          )}
          {p.stats && p.stats.length > 0 && (
            <div className="guru-hero__stats">
              {p.stats.map((s, i) => (
                <div key={i} className="guru-hero__stat">
                  <strong>{s.value}</strong>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="guru-hero__visual">
          <div className="guru-hero__figure-blob" aria-hidden />
          {p.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.image}
              alt={p.imageAlt ?? ""}
              className="guru-hero__img"
              fetchPriority="high"
              decoding="async"
            />
          ) : null}
          {p.noteAText && p.noteAShow !== "hide" ? (
            <div
              className="guru-hero__note guru-hero__note--a"
              style={noteStyle({ left: p.noteAX, top: p.noteAY })}
            >
              <strong>{p.noteAText}</strong>
              {p.noteASub ? <span>{p.noteASub}</span> : null}
            </div>
          ) : null}
          {p.noteBText && p.noteBShow !== "hide" ? (
            <div
              className="guru-hero__note guru-hero__note--b"
              style={noteStyle({ right: p.noteBX, bottom: p.noteBY })}
            >
              <strong>{p.noteBText}</strong>
              {p.noteBSub ? <span>{p.noteBSub}</span> : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// GuruPromoCarousel — Server wrapper yang delegate ke client component
// GuruPromoCarouselClient untuk carousel dinamis (auto-play + click navigasi).
// Client component sudah SSR-friendly: slide pertama render tanpa JS.
// ---------------------------------------------------------------------------

import type { ReactElement } from "react";
import { GuruPromoCarouselClient } from "./GuruPromoCarouselClient";

export function GuruPromoCarousel(p: {
  items?: Array<{ image: string; alt?: string; href?: string; caption?: string }>;
}) {
  const items = p.items ?? [];
  if (items.length === 0) return null;
  return (
    <section className="guru-promo">
      <div className="guru-container">
        <GuruPromoCarouselClient items={items} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// GuruRubricGrid — 6 rubric cards. Rotating icon color (blue / red / sage)
// per card, arrow badge di kanan bawah. Faithful mockup .rubric-grid.
// ---------------------------------------------------------------------------

// Inline SVG icons (bukan lucide) supaya match mockup's stroke style.
const RUBRIC_ICONS: Record<string, ReactElement> = {
  book: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 4h14v16H5z" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  ),
  bookmark: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H20v16H7.5A3.5 3.5 0 0 0 4 21.5z" />
      <path d="M4 5.5v16M8 6h8" />
    </svg>
  ),
  sparkle: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />
      <path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
    </svg>
  ),
  flag: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 21V4m0 1h12l-2 4 2 4H5" />
    </svg>
  ),
  temple: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 10h16M6 10V8l6-4 6 4v2M6 20h12M8 10v8M12 10v8M16 10v8" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 5h16v11H8l-4 4z" />
      <path d="M8 9h8M8 12h5" />
    </svg>
  ),
};

export function GuruRubricGrid(p: {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  items?: Array<{ title: string; desc?: string; href?: string; icon?: string }>;
}) {
  const items = p.items ?? [];
  return (
    <section className="guru-section guru-section--alt">
      <div className="guru-container">
        <div className="guru-section-heading">
          <div>
            {p.eyebrow ? <div className="guru-eyebrow">{p.eyebrow}</div> : null}
            {p.title ? <h2>{p.title}</h2> : null}
          </div>
          {p.subtitle ? <p>{p.subtitle}</p> : null}
        </div>
        <div className="guru-rubric-grid">
          {items.map((it, i) => {
            const iconKey = it.icon ?? Object.keys(RUBRIC_ICONS)[i % 6];
            const iconEl = RUBRIC_ICONS[iconKey] ?? RUBRIC_ICONS.book;
            return (
              <a
                key={i}
                href={it.href ?? "#"}
                className={`guru-rubric-card guru-rubric-card--v${(i % 3) + 1}`}
              >
                <div className="guru-rubric-card__icon">{iconEl}</div>
                <h3>{it.title}</h3>
                {it.desc ? <p>{it.desc}</p> : null}
                <span className="guru-rubric-card__arrow" aria-hidden>
                  →
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// GuruFeaturedPost + GuruSidePosts — Featured (big navy card) + 3 side cards.
// Faithful mockup .latest-grid dengan featured-post + side-posts.
// ---------------------------------------------------------------------------

export function GuruLatestGrid(p: {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  featured?: {
    meta?: string;
    title: string;
    excerpt?: string;
    href?: string;
    engagement?: string; // e.g. "1.248 views · 18 tanggapan"
  };
  side?: Array<{
    meta?: string;
    title: string;
    excerpt?: string;
    href?: string;
    engagement?: string;
    iconKey?: keyof typeof RUBRIC_ICONS;
  }>;
}) {
  const featured = p.featured;
  const side = p.side ?? [];
  return (
    <section className="guru-section">
      <div className="guru-container">
        <div className="guru-section-heading">
          <div>
            {p.eyebrow ? <div className="guru-eyebrow">{p.eyebrow}</div> : null}
            {p.title ? <h2>{p.title}</h2> : null}
          </div>
          {p.subtitle ? <p>{p.subtitle}</p> : null}
        </div>
        <div className="guru-latest-grid">
          {featured ? (
            <a className="guru-featured-post" href={featured.href ?? "#"}>
              {featured.meta ? <div className="guru-meta">{featured.meta}</div> : null}
              <h3>{featured.title}</h3>
              {featured.excerpt ? <p>{featured.excerpt}</p> : null}
              {featured.engagement ? (
                <div className="guru-engagement-meta">
                  <span>{featured.engagement}</span>
                </div>
              ) : null}
            </a>
          ) : null}
          <div className="guru-side-posts">
            {side.map((s, i) => {
              const iconEl = RUBRIC_ICONS[s.iconKey ?? "book"];
              return (
                <a key={i} className="guru-post-card" href={s.href ?? "#"}>
                  <div className="guru-post-card__mini-cover">{iconEl}</div>
                  <div>
                    {s.meta ? <div className="guru-meta">{s.meta}</div> : null}
                    <h3>{s.title}</h3>
                    {s.excerpt ? <p>{s.excerpt}</p> : null}
                    {s.engagement ? (
                      <div className="guru-engagement-meta">
                        <span>{s.engagement}</span>
                      </div>
                    ) : null}
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// GuruQuote — Large quote card dengan quote mark serif 90px.
// Faithful mockup .quote-card.
// ---------------------------------------------------------------------------

export function GuruQuote(p: { text?: string; author?: string }) {
  if (!p.text) return null;
  return (
    <section className="guru-quote-section">
      <div className="guru-container">
        <div className="guru-quote-card">
          <div className="guru-quote-card__mark" aria-hidden>
            "
          </div>
          <blockquote>
            {p.text}
            {p.author ? <cite>{p.author}</cite> : null}
          </blockquote>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// GuruStatsBar — 3 big-number stat cards dengan serif style.
// Faithful mockup .website-stats.
// ---------------------------------------------------------------------------

export function GuruStatsBar(p: {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  items?: Array<{ value: string; label: string }>;
}) {
  const items = p.items ?? [];
  return (
    <section className="guru-section guru-stats-section">
      <div className="guru-container">
        <div className="guru-section-heading">
          <div>
            {p.eyebrow ? <div className="guru-eyebrow">{p.eyebrow}</div> : null}
            {p.title ? <h2>{p.title}</h2> : null}
          </div>
          {p.subtitle ? <p>{p.subtitle}</p> : null}
        </div>
        <div className="guru-website-stats">
          {items.map((s, i) => (
            <div key={i} className="guru-stat-card">
              <strong className="guru-stat-card__num">{s.value}</strong>
              <span className="guru-stat-card__label">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// GuruProfileCard — Profile card kiri (foto + kontak) + content panels kanan.
// Faithful mockup .profile-layout.
// ---------------------------------------------------------------------------

export function GuruProfileCard(p: {
  image?: string;
  name?: string;
  role?: string;
  contacts?: Array<{ icon?: string; label: string }>;
  panels?: Array<{ eyebrow?: string; title?: string; body?: string }>;
}) {
  return (
    <section className="guru-section">
      <div className="guru-container guru-profile-layout">
        <aside className="guru-profile-card">
          {p.image ? (
            <div className="guru-profile-card__photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.image} alt={p.name ?? ""} decoding="async" />
            </div>
          ) : null}
          <div className="guru-profile-card__body">
            {p.name ? <h2>{p.name}</h2> : null}
            {p.role ? <p>{p.role}</p> : null}
            {p.contacts && p.contacts.length > 0 ? (
              <div className="guru-profile-contact">
                {p.contacts.map((c, i) => (
                  <span key={i}>
                    {c.icon ? <em aria-hidden>{c.icon} </em> : null}
                    {c.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </aside>
        <div className="guru-profile-content">
          {(p.panels ?? []).map((panel, i) => (
            <div key={i} className="guru-content-panel">
              {panel.eyebrow ? <div className="guru-eyebrow">{panel.eyebrow}</div> : null}
              {panel.title ? <h2>{panel.title}</h2> : null}
              {panel.body ? <p>{panel.body}</p> : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// GuruTimeline — Vertical timeline dengan date red + border-top style.
// Faithful mockup .timeline.
// ---------------------------------------------------------------------------

export function GuruTimeline(p: {
  title?: string;
  items?: Array<{ date: string; title: string; desc?: string }>;
}) {
  const items = p.items ?? [];
  return (
    <section className="guru-section">
      <div className="guru-container">
        <div className="guru-content-panel">
          {p.title ? <h2>{p.title}</h2> : null}
          <div className="guru-timeline">
            {items.map((it, i) => (
              <div key={i} className="guru-timeline-item">
                <time>{it.date}</time>
                <div>
                  <strong>{it.title}</strong>
                  {it.desc ? (
                    <>
                      <br />
                      <span>{it.desc}</span>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// GuruTagList — Tag chips (fokus & minat, topik).
// Faithful mockup .tag-list.
// ---------------------------------------------------------------------------

export function GuruTagList(p: {
  title?: string;
  // Accept string[] (template seed) atau Array<{label}> (editor UI).
  tags?: Array<string | { label?: string }>;
}) {
  const tags = normalizeTags(p.tags);
  if (tags.length === 0) return null;
  return (
    <section className="guru-section">
      <div className="guru-container">
        <div className="guru-content-panel">
          {p.title ? <h2>{p.title}</h2> : null}
          <div className="guru-tag-list">
            {tags.map((t, i) => (
              <span key={i} className="guru-tag">
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// normalizeTags — flatten string[] ATAU Array<{label}> ke plain string[].
// Filter empty entries + trim. Kompatibel dengan template seed lama.
function normalizeTags(tags?: Array<string | { label?: string }>): string[] {
  if (!tags) return [];
  return tags
    .map((t) => (typeof t === "string" ? t : (t?.label ?? "")))
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// GuruRubricHero — Page hero untuk rubrik pribadi (ceritaku, bacaanku, dst.).
// Rubric title kiri + icon badge kanan. Faithful mockup .rubric-hero.
// ---------------------------------------------------------------------------

export function GuruRubricHero(p: {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  iconKey?: keyof typeof RUBRIC_ICONS;
}) {
  const iconEl = RUBRIC_ICONS[p.iconKey ?? "book"];
  return (
    <section className="guru-rubric-hero">
      <div className="guru-container guru-rubric-hero__grid">
        <div>
          {p.eyebrow ? <div className="guru-eyebrow">{p.eyebrow}</div> : null}
          {p.title ? <h1>{p.title}</h1> : null}
          {p.subtitle ? <p>{p.subtitle}</p> : null}
        </div>
        <div className="guru-rubric-badge">{iconEl}</div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// GuruArticleGrid — Article cards grid dengan colored cover mini.
// Faithful mockup .article-grid + .article-card (+ .featured).
// ---------------------------------------------------------------------------

export function GuruArticleGrid(p: {
  items?: Array<{
    title: string;
    excerpt?: string;
    meta?: string;
    href?: string;
    engagement?: string;
    coverVariant?: "default" | "red" | "sage" | "gold";
    // coverImage — kalau diisi, render <img> di area cover. Kalau kosong,
    // fallback ke colored gradient (via coverVariant / default). Dipakai
    // dynamic variant yang pull cover_image_url dari backend.
    coverImage?: string;
    featured?: boolean;
  }>;
  // Label CTA "read more" per card. Default "Baca selengkapnya →" untuk
  // artikel; caller `GuruLearningGridDynamic` override jadi "Lihat materi →"
  // supaya sesuai konteks (materi pembelajaran ≠ artikel).
  ctaLabel?: string;
  sidebarTitle?: string;
  sidebarBody?: string;
  sidebarTags?: string[];
  sidebarLinks?: Array<{ label: string; href: string }>;
}) {
  const items = p.items ?? [];
  const ctaLabel = p.ctaLabel ?? "Baca selengkapnya →";
  return (
    <section className="guru-section">
      <div className="guru-container guru-content-layout">
        <div className="guru-article-grid">
          {items.map((it, i) => {
            const coverClass = it.coverVariant
              ? `guru-article-cover--${it.coverVariant}`
              : "";
            const featuredClass = it.featured ? "guru-article-card--featured" : "";
            return (
              <article
                key={i}
                className={`guru-article-card ${featuredClass}`.trim()}
              >
                {it.coverImage ? (
                  <div className="guru-article-cover guru-article-cover--img">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.coverImage} alt={it.title} />
                  </div>
                ) : (
                  <div className={`guru-article-cover ${coverClass}`.trim()} />
                )}
                <div className="guru-article-card__body">
                  {it.meta ? <div className="guru-meta">{it.meta}</div> : null}
                  <h2>{it.title}</h2>
                  {it.excerpt ? <p>{it.excerpt}</p> : null}
                  {it.engagement ? (
                    <div className="guru-engagement-meta">
                      <span>{it.engagement}</span>
                    </div>
                  ) : null}
                  {it.href ? (
                    <a className="guru-read-more" href={it.href}>
                      {ctaLabel}
                    </a>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
        <aside className="guru-sidebar">
          {p.sidebarTitle ? (
            <div className="guru-sidebar-card">
              <h3>{p.sidebarTitle}</h3>
              {p.sidebarBody ? <p>{p.sidebarBody}</p> : null}
            </div>
          ) : null}
          {p.sidebarTags && p.sidebarTags.length > 0 ? (
            <div className="guru-sidebar-card">
              <h3>Topik</h3>
              <div className="guru-tag-list">
                {p.sidebarTags.map((t, i) => (
                  <span key={i} className="guru-tag">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {p.sidebarLinks && p.sidebarLinks.length > 0 ? (
            <div className="guru-sidebar-card">
              <h3>Jelajahi ruang lain</h3>
              <div className="guru-topic-list">
                {p.sidebarLinks.map((l, i) => (
                  <a key={i} href={l.href} className="guru-topic-link">
                    {l.label}
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// GuruForumThreadList — Forum diskusi thread cards dengan avatar variants +
// tags + engagement meta. Faithful mockup .thread-list + .thread-card.
// ---------------------------------------------------------------------------

export function GuruForumThreadList(p: {
  items?: Array<{
    initials: string;
    avatarVariant?: "red" | "blue" | "sage" | "gold";
    label?: string;
    date?: string;
    title: string;
    excerpt?: string;
    tags?: string[];
    engagement?: string;
    featured?: boolean;
    href?: string;
  }>;
  moderationNote?: { badge: string; title: string; body: string };
  participants?: string[];
  sidebarLinks?: Array<{ label: string; href: string }>;
}) {
  const items = p.items ?? [];
  return (
    <section className="guru-section">
      <div className="guru-container guru-forum-layout">
        <div className="guru-thread-list">
          {items.map((t, i) => (
            <article
              key={i}
              className={`guru-thread-card ${t.featured ? "guru-thread-card--featured" : ""}`}
            >
              <div
                className={`guru-thread-avatar guru-thread-avatar--${t.avatarVariant ?? "red"}`}
              >
                {t.initials}
              </div>
              <div className="guru-thread-main">
                <div className="guru-thread-topline">
                  {t.label ? <span className="guru-thread-label">{t.label}</span> : null}
                  {t.date ? <span>{t.date}</span> : null}
                </div>
                <h2>
                  {t.href ? <a href={t.href}>{t.title}</a> : t.title}
                </h2>
                {t.excerpt ? <p>{t.excerpt}</p> : null}
                {t.tags && t.tags.length > 0 ? (
                  <div className="guru-thread-tags">
                    {t.tags.map((tag, ti) => (
                      <span key={ti}>{tag}</span>
                    ))}
                  </div>
                ) : null}
                {t.engagement ? (
                  <div className="guru-thread-meta-inline">
                    <span>{t.engagement}</span>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
        <aside className="guru-sidebar">
          {p.moderationNote ? (
            <div className="guru-sidebar-card guru-moderation-card">
              <div className="guru-moderation-badge">{p.moderationNote.badge}</div>
              <h3>{p.moderationNote.title}</h3>
              <p>{p.moderationNote.body}</p>
            </div>
          ) : null}
          {p.participants && p.participants.length > 0 ? (
            <div className="guru-sidebar-card">
              <h3>Siapa yang bisa ikut?</h3>
              <div className="guru-participant-list">
                {p.participants.map((pp, i) => (
                  <span key={i}>{pp}</span>
                ))}
              </div>
            </div>
          ) : null}
          {p.sidebarLinks && p.sidebarLinks.length > 0 ? (
            <div className="guru-sidebar-card">
              <h3>Jelajahi ruang lain</h3>
              <div className="guru-topic-list">
                {p.sidebarLinks.map((l, i) => (
                  <a key={i} href={l.href} className="guru-topic-link">
                    {l.label}
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// GuruFooter — Footer navy dengan grid brand + link + builder-credit
// PANDI × UPI. Faithful mockup .site-footer.
// ---------------------------------------------------------------------------

export function GuruFooter(p: {
  brandName?: string;
  brandRole?: string;
  brandMark?: string; // 1-char initial
  copyText?: string;
  builderTitle?: string; // e.g. "Web Builder Guru"
  builderBrand?: string; // e.g. "PANDI × UPI"
  builderNote?: string; // e.g. "Co-branding mockup ..."
  links?: Array<{ label: string; href: string }>;
  bottomLeft?: string;
  bottomRight?: string;
}) {
  return (
    <footer className="guru-site-footer">
      <div className="guru-container">
        <div className="guru-footer-grid">
          <div>
            <a className="guru-brand" href="/">
              {p.brandMark ? <span className="guru-brand__mark">{p.brandMark}</span> : null}
              <span className="guru-brand__copy">
                {p.brandName}
                {p.brandRole ? <small>{p.brandRole}</small> : null}
              </span>
            </a>
            {p.copyText ? <p className="guru-footer-copy">{p.copyText}</p> : null}
            {(p.builderTitle || p.builderBrand) && (
              <div className="guru-builder-credit">
                {p.builderTitle ? <span>{p.builderTitle}</span> : null}
                {p.builderBrand ? <strong>{p.builderBrand}</strong> : null}
                {p.builderNote ? <small>{p.builderNote}</small> : null}
              </div>
            )}
          </div>
          {p.links && p.links.length > 0 ? (
            <nav className="guru-footer-links" aria-label="Navigasi footer">
              {p.links.map((l, i) => (
                <a key={i} href={l.href}>
                  {l.label}
                </a>
              ))}
            </nav>
          ) : null}
        </div>
        <div className="guru-footer-bottom">
          {p.bottomLeft ? <span>{p.bottomLeft}</span> : null}
          {p.bottomRight ? <span>{p.bottomRight}</span> : null}
        </div>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// GuruNavbar — Sticky nav dengan brand + menu horizontal + mobile toggle.
// Faithful mockup .site-header + .site-nav. Toggle pure CSS (checkbox hack).
// ---------------------------------------------------------------------------

export function GuruNavbar(p: {
  brandName?: string;
  brandRole?: string;
  brandMark?: string;
  links?: Array<{ label: string; href: string; active?: boolean }>;
}) {
  const toggleId = "guru-nav-toggle";
  return (
    <header className="guru-site-header">
      <div className="guru-container guru-nav-shell">
        <a className="guru-brand" href="/" aria-label={`Beranda ${p.brandName ?? ""}`}>
          {p.brandMark ? <span className="guru-brand__mark">{p.brandMark}</span> : null}
          <span className="guru-brand__copy">
            {p.brandName}
            {p.brandRole ? <small>{p.brandRole}</small> : null}
          </span>
        </a>
        <input type="checkbox" id={toggleId} className="guru-nav-toggle-input" />
        <label htmlFor={toggleId} className="guru-nav-toggle" aria-label="Buka navigasi">
          <span />
          <span />
          <span />
        </label>
        <nav className="guru-site-nav" aria-label="Navigasi utama">
          {(p.links ?? []).map((l, i) => (
            <a
              key={i}
              href={l.href}
              className={l.active ? "is-active" : undefined}
            >
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// GuruStyles — Injects the CSS <style> block once per page. Blocks.tsx dispatch
// calls this at the first Guru* occurrence via a sentinel prop.
// ---------------------------------------------------------------------------

export function GuruStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
/* NOTE: --guru-* color vars DIHILANGKAN dari sini. themeToCss di-emit lebih
   dulu di <head> dengan direct user colors + color-mix() derivations.
   Kalau di-declare lagi di :root sini (yang di-mount belakangan di body),
   "later wins" cascade bikin value-nya menang dan user theme kalah.
   Hanya non-color constants yang di-declare di sini. */
:root{
  --guru-radius: 26px;
  --guru-radius-sm: 18px;
  --guru-max: 1180px;
}
.guru-container{width:min(var(--guru-max),calc(100% - 40px));margin-inline:auto}
/* Global focus ring for template (red-transparent per mockup :focus-visible) */
.guru-hero :focus-visible,.guru-section :focus-visible,.guru-quote-section :focus-visible,
.guru-rubric-hero :focus-visible,.guru-forum-layout :focus-visible,
.guru-site-header :focus-visible,.guru-site-footer :focus-visible{
  outline:3px solid rgba(182,66,61,.35);outline-offset:3px;border-radius:6px
}
.guru-eyebrow{display:inline-flex;align-items:center;gap:8px;color:var(--guru-red);font-size:12px;font-weight:800;letter-spacing:.15em;text-transform:uppercase;margin-bottom:16px}
.guru-eyebrow:before{content:"";width:28px;height:2px;background:currentColor;border-radius:2px}
.guru-meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:11px;font-weight:750;letter-spacing:.08em;text-transform:uppercase;color:var(--guru-red)}
.guru-engagement-meta{display:flex;flex-wrap:wrap;gap:7px 14px;margin-top:12px;color:var(--guru-muted);font-size:12px;font-weight:700}

/* Navbar */
.guru-site-header{position:sticky;top:0;z-index:50;background:rgba(251,248,241,.94);backdrop-filter:blur(14px);border-bottom:1px solid rgba(20,35,59,.08);font-family:var(--font-body,Inter),ui-sans-serif,system-ui,sans-serif;color:var(--guru-ink)}
.guru-nav-shell{min-height:76px;display:flex;align-items:center;gap:28px}
.guru-brand{display:flex;align-items:center;gap:10px;font-weight:800;color:var(--guru-navy);min-width:max-content;text-decoration:none}
.guru-brand__mark{width:38px;height:38px;border-radius:50%;background:var(--guru-navy);display:grid;place-items:center;color:#fff;font-family:var(--font-heading,Georgia),serif;font-size:20px;box-shadow:inset 0 0 0 5px rgba(255,255,255,.08)}
.guru-brand__copy{line-height:1.1;font-size:15px}
.guru-brand__copy small{display:block;color:var(--guru-muted);font-weight:600;font-size:10px;letter-spacing:.13em;text-transform:uppercase;margin-top:4px}
.guru-site-nav{display:flex;align-items:center;gap:2px;margin-left:auto}
.guru-site-nav a{padding:10px 11px;border-radius:10px;color:var(--guru-muted);font-size:14px;font-weight:650;white-space:nowrap;text-decoration:none}
.guru-site-nav a:hover,.guru-site-nav a.is-active{color:var(--guru-navy);background:#fff;box-shadow:0 1px 0 rgba(20,35,59,.04)}
.guru-nav-toggle-input{display:none}
.guru-nav-toggle{display:none;margin-left:auto;border:1px solid var(--guru-line);background:#fff;border-radius:12px;width:44px;height:44px;color:var(--guru-navy);cursor:pointer;place-items:center;align-content:center}
.guru-nav-toggle span{display:block;width:18px;height:2px;background:currentColor;margin:4px auto;border-radius:3px}

/* Hero */
.guru-hero{position:relative;overflow:hidden;padding:70px 0 54px;background:var(--guru-cream);color:var(--guru-ink);font-family:var(--font-body,Inter),system-ui,sans-serif}
.guru-hero__blob{position:absolute;width:500px;height:500px;border-radius:50%;background:var(--guru-red-soft);right:-180px;top:-180px;opacity:.65}
.guru-hero__grid{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(360px,.92fr);gap:60px;align-items:center;position:relative}
.guru-hero__title{font-family:var(--font-heading,Georgia),"Times New Roman",serif;color:var(--guru-navy);line-height:1.12;margin:0;font-size:clamp(46px,6vw,76px);letter-spacing:-.045em}
.guru-hero__title em{font-weight:400;color:var(--guru-red);font-style:italic}
.guru-hero__lead{font-size:18px;color:var(--guru-muted);max-width:650px;margin:24px 0 0;line-height:1.7}
.guru-hero__actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:30px}
.guru-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:999px;padding:12px 20px;font-weight:750;font-size:14px;border:1px solid transparent;transition:.2s;text-decoration:none;cursor:pointer}
.guru-btn:hover{transform:translateY(-1px)}
.guru-btn--primary{background:var(--guru-navy);color:#fff;box-shadow:0 10px 24px rgba(20,35,59,.18)}
.guru-btn--secondary{background:#fff;border-color:var(--guru-line);color:var(--guru-navy)}
.guru-hero__stats{display:flex;gap:24px;flex-wrap:wrap;margin-top:34px;padding-top:24px;border-top:1px solid var(--guru-line)}
.guru-hero__stat strong{font-family:var(--font-heading,Georgia),serif;color:var(--guru-navy);font-size:24px;display:block}
.guru-hero__stat span{font-size:12px;color:var(--guru-muted);text-transform:uppercase;letter-spacing:.08em}
.guru-hero__visual{position:relative;min-height:520px;display:grid;place-items:end center}
.guru-hero__figure-blob{position:absolute;inset:60px 28px 0;background:linear-gradient(145deg,var(--guru-blue-soft),var(--guru-red-soft));border-radius:48% 52% 44% 56%/52% 42% 58% 48%;transform:rotate(-5deg)}
.guru-hero__img{position:relative;z-index:2;max-height:500px;object-fit:contain;filter:drop-shadow(0 28px 28px rgba(30,45,66,.12));max-width:100%;display:block}
.guru-hero__note{position:absolute;z-index:3;background:#fff;border:1px solid rgba(20,35,59,.07);box-shadow:var(--guru-shadow-sm);border-radius:16px;padding:13px 16px;font-size:13px;color:var(--guru-ink);display:grid;gap:2px}
.guru-hero__note strong{color:var(--guru-navy);font-family:var(--font-heading,Georgia),serif;font-size:17px;font-weight:700}
.guru-hero__note--a{left:10px;top:92px}
.guru-hero__note--b{right:0;bottom:54px}

/* Section base */
.guru-section{padding:84px 0;background:var(--guru-cream);color:var(--guru-ink);font-family:var(--font-body,Inter),system-ui,sans-serif}
.guru-section--alt{background:#fff}
.guru-section-heading{display:grid;grid-template-columns:.8fr 1.2fr;gap:50px;align-items:end;margin-bottom:34px}
.guru-section-heading h2{font-family:var(--font-heading,Georgia),serif;font-size:clamp(34px,4.5vw,54px);letter-spacing:-.035em;color:var(--guru-navy);line-height:1.12;margin:0}
.guru-section-heading p{margin:0;color:var(--guru-muted);max-width:640px;line-height:1.7}

/* Promo carousel — JS-driven (auto-play, clickable dots + prev/next, hover pause)
 * CRITICAL: viewport overflow-hidden clips, track width:100% mengunci lebar
 * track = 1 viewport supaya translateX(-N*100%) geser N slide (bukan N*track).
 * Slide flex:0 0 100% + min-width:0 fit 1 viewport tanpa track auto-expand.
 * Sebelumnya pakai min-width:100% bikin track = 3x viewport = misalign. */
.guru-promo{padding:30px 0;background:var(--guru-cream)}
.guru-promo__viewport{position:relative;overflow:hidden;border-radius:var(--guru-radius);box-shadow:var(--guru-shadow);background:#fff;width:100%}
.guru-promo__track{display:flex;transition:transform .45s ease;width:100%;will-change:transform}
.guru-promo__track--js{transform:translateX(0)}
.guru-promo__slide{flex:0 0 100%;min-width:0;aspect-ratio:2/1;display:block;overflow:hidden;position:relative}
.guru-promo__slide img{width:100%;height:100%;object-fit:cover}
.guru-promo__slide:focus-visible{outline:4px solid var(--guru-gold);outline-offset:-4px}
/* Prev/next control buttons — mockup .promo-control */
.guru-promo__ctrl{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;border:0;border-radius:50%;background:rgba(20,35,59,.86);color:#fff;cursor:pointer;z-index:2;font-size:22px;line-height:1;display:grid;place-items:center;transition:.2s;font-family:inherit}
.guru-promo__ctrl:hover{background:var(--guru-navy);transform:translateY(-50%) scale(1.08)}
.guru-promo__ctrl:focus-visible{outline:3px solid rgba(214,168,77,.65);outline-offset:2px}
.guru-promo__ctrl--prev{left:16px}
.guru-promo__ctrl--next{right:16px}
/* Dots — active state = pill width 24px */
.guru-promo__dots{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);display:flex;gap:8px;z-index:2}
.guru-promo__dot{width:9px;height:9px;border:0;border-radius:50%;background:rgba(255,255,255,.65);cursor:pointer;padding:0;transition:width .3s ease,background .3s ease}
.guru-promo__dot:hover{background:rgba(255,255,255,.85)}
.guru-promo__dot:focus-visible{outline:2px solid var(--guru-gold);outline-offset:3px}
.guru-promo__dot.is-active{width:24px;border-radius:999px;background:#fff}

/* Rubric grid */
.guru-rubric-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.guru-rubric-card{position:relative;min-height:220px;background:#fff;border:1px solid var(--guru-line);border-radius:24px;padding:24px;overflow:hidden;box-shadow:0 8px 30px rgba(30,43,62,.04);transition:.25s;text-decoration:none;color:inherit;display:block}
.guru-rubric-card:hover{transform:translateY(-4px);box-shadow:var(--guru-shadow-sm);border-color:color-mix(in srgb,var(--guru-navy) 20%,var(--guru-line))}
.guru-rubric-card__icon{width:48px;height:48px;border-radius:15px;display:grid;place-items:center;margin-bottom:28px;background:var(--guru-blue-soft);color:var(--guru-navy)}
.guru-rubric-card--v2 .guru-rubric-card__icon{background:var(--guru-red-soft);color:var(--guru-red)}
.guru-rubric-card--v3 .guru-rubric-card__icon{background:var(--guru-sage);color:color-mix(in srgb,var(--guru-navy) 60%,#496b55)}
.guru-rubric-card__icon svg{width:23px;height:23px}
.guru-rubric-card h3{font-family:var(--font-heading,Georgia),serif;font-size:25px;margin:0 0 8px;color:var(--guru-navy);line-height:1.12}
.guru-rubric-card p{font-size:14px;color:var(--guru-muted);margin:0;max-width:290px;line-height:1.6}
.guru-rubric-card__arrow{position:absolute;right:20px;bottom:18px;width:36px;height:36px;border-radius:50%;border:1px solid var(--guru-line);display:grid;place-items:center;color:var(--guru-navy);background:#fff}

/* Latest grid (featured + side) */
.guru-latest-grid{display:grid;grid-template-columns:1.25fr .75fr;gap:18px}
.guru-featured-post{background:var(--guru-navy);color:#fff;border-radius:var(--guru-radius);padding:34px;min-height:390px;position:relative;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;text-decoration:none}
.guru-featured-post:before{content:"";position:absolute;width:330px;height:330px;border-radius:50%;background:rgba(255,255,255,.07);right:-80px;top:-100px}
.guru-featured-post .guru-meta{color:color-mix(in srgb, var(--guru-red) 55%, #ffffff)}
.guru-featured-post h3{font-family:var(--font-heading,Georgia),serif;color:#fff;font-size:38px;max-width:580px;margin:10px 0 12px;line-height:1.12}
.guru-featured-post p{color:color-mix(in srgb, var(--guru-cream) 65%, #ffffff)}
.guru-featured-post .guru-engagement-meta{color:color-mix(in srgb, var(--guru-cream) 55%, #ffffff)}
.guru-side-posts{display:grid;gap:16px}
.guru-post-card{background:#fff;border:1px solid var(--guru-line);border-radius:22px;padding:22px;display:flex;gap:18px;align-items:flex-start;text-decoration:none;color:inherit}
.guru-post-card__mini-cover{flex:0 0 78px;height:78px;border-radius:17px;background:linear-gradient(145deg,var(--guru-blue-soft),var(--guru-red-soft));display:grid;place-items:center;color:var(--guru-navy)}
.guru-post-card__mini-cover svg{width:26px;height:26px}
.guru-post-card h3{font-family:var(--font-heading,Georgia),serif;font-size:20px;margin:4px 0 5px;color:var(--guru-navy);line-height:1.2}
.guru-post-card p{font-size:13px;color:var(--guru-muted);margin:0;line-height:1.6}

/* Quote */
.guru-quote-section{padding:64px 0 92px;background:var(--guru-cream)}
.guru-quote-card{background:var(--guru-paper);border-radius:34px;padding:54px 60px;display:grid;grid-template-columns:auto 1fr;gap:30px;align-items:start}
.guru-quote-card__mark{font-family:var(--font-heading,Georgia),serif;font-size:90px;color:var(--guru-red);line-height:.7}
.guru-quote-card blockquote{font-family:var(--font-heading,Georgia),serif;color:var(--guru-navy);font-size:clamp(26px,3vw,38px);line-height:1.3;margin:0}
.guru-quote-card cite{display:block;font-family:var(--font-body,Inter),system-ui,sans-serif;font-style:normal;font-size:13px;color:var(--guru-muted);margin-top:16px;text-transform:uppercase;letter-spacing:.1em}

/* Stats */
.guru-stats-section{background:#fff}
.guru-website-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.guru-stat-card{background:var(--guru-cream);border:1px solid var(--guru-line);border-radius:var(--guru-radius-sm);padding:26px;box-shadow:var(--guru-shadow-sm)}
.guru-stat-card__num{display:block;color:var(--guru-navy);font-family:var(--font-heading,Georgia),serif;font-size:clamp(34px,5vw,54px);line-height:1}
.guru-stat-card__label{display:block;margin-top:10px;color:var(--guru-muted);font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}

/* Profile card layout */
.guru-profile-layout{display:grid;grid-template-columns:390px 1fr;gap:32px;align-items:start}
.guru-profile-card{background:#fff;border:1px solid var(--guru-line);border-radius:28px;overflow:hidden;position:sticky;top:100px}
.guru-profile-card__photo{background:linear-gradient(160deg,var(--guru-blue-soft),var(--guru-red-soft));height:390px;display:flex;align-items:flex-end;justify-content:center;overflow:hidden}
.guru-profile-card__photo img{height:94%;width:auto;object-fit:contain}
.guru-profile-card__body{padding:24px}
.guru-profile-card h2{font-family:var(--font-heading,Georgia),serif;font-size:31px;color:var(--guru-navy);margin:0;line-height:1.12}
.guru-profile-card p{color:var(--guru-muted);margin:7px 0 18px;line-height:1.6}
.guru-profile-contact{display:grid;gap:9px;font-size:14px;color:var(--guru-muted)}
.guru-profile-contact span{display:flex;gap:10px;align-items:center}
.guru-profile-content{display:grid;gap:18px}
.guru-content-panel{background:#fff;border:1px solid var(--guru-line);border-radius:24px;padding:28px}
.guru-content-panel h2{font-family:var(--font-heading,Georgia),serif;color:var(--guru-navy);font-size:30px;margin:0 0 12px;line-height:1.15}
.guru-content-panel p{color:var(--guru-muted);line-height:1.7;margin:0}

/* Tag list */
.guru-tag-list{display:flex;flex-wrap:wrap;gap:8px}
.guru-tag{display:inline-flex;padding:7px 11px;border-radius:999px;background:var(--guru-paper);border:1px solid var(--guru-line);font-size:12px;font-weight:700;color:var(--guru-muted)}

/* Timeline */
.guru-timeline{display:grid;gap:18px;margin-top:18px}
.guru-timeline-item{display:grid;grid-template-columns:90px 1fr;gap:18px;padding-top:18px;border-top:1px solid var(--guru-line)}
.guru-timeline-item:first-child{border-top:0;padding-top:0}
.guru-timeline-item time{font-size:12px;color:var(--guru-red);font-weight:800;letter-spacing:.08em}
.guru-timeline-item strong{color:var(--guru-navy)}
.guru-timeline-item span{color:var(--guru-muted);font-size:14px;line-height:1.6}

/* Rubric page hero */
.guru-rubric-hero{padding:62px 0 26px;background:var(--guru-cream);color:var(--guru-ink);font-family:var(--font-body,Inter),system-ui,sans-serif}
.guru-rubric-hero__grid{display:grid;grid-template-columns:1fr auto;gap:30px;align-items:end}
.guru-rubric-hero h1{font-family:var(--font-heading,Georgia),serif;font-size:clamp(48px,6vw,74px);letter-spacing:-.04em;color:var(--guru-navy);margin:0;line-height:1.12}
.guru-rubric-hero p{color:var(--guru-muted);max-width:650px;margin:17px 0 0;line-height:1.7}
.guru-rubric-badge{width:110px;height:110px;border-radius:30px;background:#fff;border:1px solid var(--guru-line);display:grid;place-items:center;color:var(--guru-navy);box-shadow:var(--guru-shadow-sm)}
.guru-rubric-badge svg{width:44px;height:44px}

/* Article grid + sidebar */
.guru-content-layout{display:grid;grid-template-columns:minmax(0,1fr) 290px;gap:28px;align-items:start}
.guru-article-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}
.guru-article-card{background:#fff;border:1px solid var(--guru-line);border-radius:24px;overflow:hidden;transition:.22s}
.guru-article-card:hover{transform:translateY(-3px);box-shadow:var(--guru-shadow-sm)}
.guru-article-card--featured{grid-column:1/-1;display:grid;grid-template-columns:1fr 1.2fr}
.guru-article-cover{min-height:190px;background:linear-gradient(135deg,var(--guru-blue-soft),var(--guru-red-soft));position:relative;overflow:hidden}
.guru-article-cover:before,.guru-article-cover:after{content:"";position:absolute;border-radius:50%;background:rgba(255,255,255,.55)}
.guru-article-cover:before{width:140px;height:140px;right:-30px;top:-30px}
.guru-article-cover:after{width:55px;height:55px;left:24px;bottom:28px}
/* Image cover — override gradient + blob decorative dengan photo asli.
   Pakai object-fit:cover supaya image fill area tanpa distortion. */
.guru-article-cover--img{background:var(--guru-paper)}
.guru-article-cover--img:before,.guru-article-cover--img:after{display:none}
.guru-article-cover--img img{width:100%;height:100%;min-height:190px;object-fit:cover;display:block;position:absolute;inset:0}
.guru-article-cover--red{background:linear-gradient(135deg,var(--guru-red-soft),var(--guru-blue-soft))}
.guru-article-cover--sage{background:linear-gradient(135deg,var(--guru-sage),var(--guru-red-soft))}
.guru-article-cover--gold{background:linear-gradient(135deg,color-mix(in srgb,var(--guru-gold) 25%,var(--guru-cream)),var(--guru-blue-soft))}
.guru-article-card__body{padding:22px}
.guru-article-card h2,.guru-article-card h3{font-family:var(--font-heading,Georgia),serif;font-size:25px;margin:8px 0 10px;color:var(--guru-navy);line-height:1.15}
.guru-article-card p{color:var(--guru-muted);font-size:14px;margin:0;line-height:1.6}
.guru-read-more{display:inline-flex;margin-top:16px;color:var(--guru-red);font-size:13px;font-weight:800;text-decoration:none}

/* Sidebar */
.guru-sidebar{display:grid;gap:16px;position:sticky;top:100px}
.guru-sidebar-card{background:#fff;border:1px solid var(--guru-line);border-radius:21px;padding:21px}
.guru-sidebar-card h3{font-family:var(--font-heading,Georgia),serif;font-size:21px;margin:0 0 12px;color:var(--guru-navy)}
.guru-sidebar-card p{color:var(--guru-muted);font-size:13px;margin:0;line-height:1.6}
.guru-topic-list{display:grid;gap:0}
.guru-topic-link{padding:11px 0;border-top:1px solid var(--guru-line);font-size:13px;color:var(--guru-muted);text-decoration:none}
.guru-topic-link:first-child{border-top:0}
.guru-topic-link:hover{color:var(--guru-red)}

/* Forum */
.guru-forum-layout{display:grid;grid-template-columns:minmax(0,1fr) 290px;gap:28px;align-items:start}
.guru-thread-list{display:grid;gap:14px}
.guru-thread-card{background:#fff;border:1px solid var(--guru-line);border-radius:22px;padding:20px;display:grid;grid-template-columns:48px minmax(0,1fr);gap:16px;align-items:start;transition:.22s}
.guru-thread-card:hover{transform:translateY(-2px);box-shadow:var(--guru-shadow-sm)}
.guru-thread-card--featured{border-color:color-mix(in srgb,var(--guru-red) 40%,var(--guru-line));background:linear-gradient(135deg,var(--guru-paper),var(--guru-red-soft))}
.guru-thread-avatar{width:48px;height:48px;border-radius:15px;display:grid;place-items:center;font-size:12px;font-weight:900}
.guru-thread-avatar--red{background:var(--guru-red-soft);color:var(--guru-red)}
.guru-thread-avatar--blue{background:var(--guru-blue-soft);color:var(--guru-navy)}
.guru-thread-avatar--sage{background:var(--guru-sage);color:color-mix(in srgb,var(--guru-navy) 70%,#3d5d45)}
.guru-thread-avatar--gold{background:color-mix(in srgb,var(--guru-gold) 25%,var(--guru-cream));color:color-mix(in srgb,var(--guru-gold) 80%,var(--guru-ink))}
.guru-thread-topline{display:flex;justify-content:space-between;gap:12px;color:var(--guru-muted);font-size:11px}
.guru-thread-label{color:var(--guru-red);font-weight:900;text-transform:uppercase;letter-spacing:.08em}
.guru-thread-main h2{font-family:var(--font-heading,Georgia),serif;font-size:23px;margin:6px 0 7px;color:var(--guru-navy);line-height:1.2}
.guru-thread-main h2 a{color:inherit;text-decoration:none}
.guru-thread-main p{color:var(--guru-muted);font-size:13px;margin:0;line-height:1.6}
.guru-thread-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}
.guru-thread-tags span{background:var(--guru-paper);border-radius:999px;padding:5px 8px;font-size:10px;font-weight:800;color:var(--guru-muted)}
.guru-thread-meta-inline{display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:12px;color:var(--guru-muted);font-size:12px;font-weight:750}
.guru-moderation-card{background:color-mix(in srgb,var(--guru-gold) 15%,var(--guru-paper))}
.guru-moderation-badge{display:inline-flex;background:var(--guru-sage);color:color-mix(in srgb,var(--guru-navy) 70%,#3d5d45);border-radius:999px;padding:6px 9px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
.guru-participant-list{display:flex;flex-wrap:wrap;gap:7px}
.guru-participant-list span{padding:7px 10px;background:var(--guru-paper);border-radius:999px;font-size:11px;font-weight:800;color:var(--guru-muted)}

/* Footer */
.guru-site-footer{background:var(--guru-navy);color:color-mix(in srgb,var(--guru-cream) 60%,#ffffff);padding:54px 0 28px;margin-top:30px;font-family:var(--font-body,Inter),system-ui,sans-serif}
.guru-footer-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:60px;padding-bottom:36px;border-bottom:1px solid rgba(255,255,255,.12)}
.guru-site-footer .guru-brand{color:#fff}
.guru-site-footer .guru-brand__mark{background:#fff;color:var(--guru-navy)}
.guru-footer-copy{color:color-mix(in srgb,var(--guru-cream) 50%,#ffffff);max-width:520px;font-size:14px;margin-top:14px;line-height:1.6}
.guru-footer-links{display:grid;grid-template-columns:repeat(2,1fr);gap:10px 30px}
.guru-footer-links a{font-size:13px;color:color-mix(in srgb,var(--guru-cream) 55%,#ffffff);text-decoration:none}
.guru-footer-links a:hover{color:#fff}
.guru-footer-bottom{display:flex;justify-content:space-between;gap:20px;padding-top:24px;color:color-mix(in srgb,var(--guru-cream) 40%,#ffffff);font-size:11px}
.guru-builder-credit{margin-top:22px;padding-top:18px;border-top:1px solid rgba(255,255,255,.12);display:flex;flex-wrap:wrap;gap:7px 10px;align-items:center;color:color-mix(in srgb,var(--guru-cream) 50%,#ffffff)}
.guru-builder-credit span{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:color-mix(in srgb,var(--guru-cream) 35%,#ffffff)}
.guru-builder-credit strong{font-size:13px;color:#fff}
.guru-builder-credit small{flex-basis:100%;font-size:11px;color:color-mix(in srgb,var(--guru-cream) 30%,#ffffff)}

/* Responsive */
@media(max-width:1080px){
  .guru-site-nav a{padding:9px 7px;font-size:12px}
  .guru-hero__grid{gap:28px}
  .guru-profile-layout{grid-template-columns:320px 1fr}
}
@media(max-width:900px){
  .guru-nav-toggle{display:grid}
  .guru-site-nav{position:absolute;left:20px;right:20px;top:68px;background:#fff;border:1px solid var(--guru-line);box-shadow:var(--guru-shadow);border-radius:18px;padding:12px;display:none;flex-direction:column;align-items:stretch}
  .guru-nav-toggle-input:checked ~ .guru-site-nav{display:flex}
  .guru-site-nav a{font-size:14px;padding:11px 12px}
  .guru-hero{padding-top:44px}
  .guru-hero__grid{grid-template-columns:1fr}
  .guru-hero__visual{min-height:440px}
  .guru-rubric-grid{grid-template-columns:repeat(2,1fr)}
  .guru-section-heading{grid-template-columns:1fr;gap:14px}
  .guru-latest-grid{grid-template-columns:1fr}
  .guru-profile-layout{grid-template-columns:1fr}
  .guru-profile-card{position:relative;top:auto;display:grid;grid-template-columns:300px 1fr}
  .guru-profile-card__photo{height:320px}
  .guru-content-layout{grid-template-columns:1fr}
  .guru-sidebar{position:relative;top:auto;grid-template-columns:repeat(2,1fr)}
  .guru-forum-layout{grid-template-columns:1fr}
  .guru-footer-grid{grid-template-columns:1fr;gap:28px}
}
@media(max-width:640px){
  .guru-container{width:min(100% - 28px,var(--guru-max))}
  .guru-nav-shell{min-height:68px}
  .guru-brand__copy small{display:none}
  .guru-hero__title{font-size:48px}
  .guru-hero__visual{min-height:390px}
  .guru-hero__img{max-height:390px}
  .guru-hero__note--a{left:0;top:70px}
  .guru-hero__note--b{right:0;bottom:25px}
  .guru-section{padding:64px 0}
  .guru-rubric-grid{grid-template-columns:1fr}
  .guru-quote-card{padding:36px 26px;grid-template-columns:1fr;gap:5px}
  .guru-quote-card__mark{font-size:68px}
  .guru-profile-card{display:block}
  .guru-profile-card__photo{height:340px}
  .guru-rubric-hero__grid{grid-template-columns:1fr}
  .guru-rubric-badge{width:84px;height:84px}
  .guru-article-grid{grid-template-columns:1fr}
  .guru-article-card--featured{grid-column:auto;display:block}
  .guru-sidebar{grid-template-columns:1fr}
  .guru-website-stats{grid-template-columns:1fr}
  .guru-footer-links{grid-template-columns:1fr}
  .guru-footer-bottom{flex-direction:column}
  .guru-promo__ctrl{width:38px;height:38px;font-size:18px}
  .guru-promo__ctrl--prev{left:10px}
  .guru-promo__ctrl--next{right:10px}
}

/* --- Article detail + response form (Fase 4) ---
   Semua warna di-wire ke --guru-* vars supaya ikut berubah waktu user
   ganti theme (primary / secondary / bg / fg). */
.guru-article-detail{max-width:760px;margin:0 auto;padding:60px 24px}
.guru-article-detail__meta{color:var(--guru-muted);font-size:13px;font-weight:700;letter-spacing:.02em;text-transform:uppercase;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.guru-article-detail__meta a{color:var(--guru-red);text-decoration:none}
.guru-article-detail__meta a:hover{text-decoration:underline}
.guru-article-detail h1{font-family:Georgia,serif;font-size:clamp(2rem,4vw,2.75rem);line-height:1.15;letter-spacing:-.02em;color:var(--guru-navy);margin:16px 0 10px}
.guru-article-detail__deck{color:var(--guru-ink);font-size:1.15rem;line-height:1.5;margin:0 0 24px}
.guru-article-detail__stats{display:flex;gap:16px;color:var(--guru-muted);font-size:13px;font-weight:600;padding:12px 0;border-top:1px solid var(--guru-line);border-bottom:1px solid var(--guru-line);margin-bottom:32px}
.guru-article-detail__cover{margin:0 0 32px;overflow:hidden;border-radius:16px;background:var(--guru-line)}
.guru-article-detail__cover img{display:block;width:100%;height:auto;object-fit:cover}
.guru-article-detail__body{color:var(--guru-ink);font-size:1.05rem;line-height:1.75}
.guru-article-detail__body p{margin:0 0 1.1em}
.guru-article-detail__body h2{font-family:Georgia,serif;font-size:1.6rem;margin:2em 0 .6em;color:var(--guru-navy)}
.guru-article-detail__body h3{font-family:Georgia,serif;font-size:1.3rem;margin:1.6em 0 .5em;color:var(--guru-navy)}
.guru-article-detail__body a{color:var(--guru-navy);text-decoration:underline;text-underline-offset:2px}
.guru-article-detail__body ul,.guru-article-detail__body ol{margin:0 0 1.1em;padding-left:1.4em}
.guru-article-detail__body li{margin:.25em 0}
.guru-article-detail__body blockquote{border-left:3px solid var(--guru-red);margin:1.4em 0;padding:.1em 0 .1em 1.2em;color:var(--guru-ink);font-style:italic}
.guru-article-detail__body img{display:block;max-width:100%;height:auto;border-radius:12px;margin:1.4em auto}
.guru-article-detail__body table{width:100%;border-collapse:collapse;margin:1.4em 0;font-size:.95em}
.guru-article-detail__body th,.guru-article-detail__body td{padding:.65em .9em;border:1px solid var(--guru-line);text-align:left;vertical-align:top}
.guru-article-detail__body th{background:var(--guru-paper);font-weight:700;color:var(--guru-navy)}
.guru-article-detail__body code{background:color-mix(in srgb,var(--guru-navy) 8%,transparent);padding:.15em .4em;border-radius:4px;font-size:.9em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.guru-article-detail__body pre{background:var(--guru-navy);color:color-mix(in srgb,var(--guru-cream) 50%,#ffffff);padding:1em 1.2em;border-radius:12px;overflow-x:auto;margin:1.4em 0;font-size:.9em}
.guru-article-detail__body pre code{background:none;padding:0;color:inherit}
.guru-article-detail__body iframe{width:100%;aspect-ratio:16/9;border:0;border-radius:12px;margin:1.4em 0}
.guru-article-detail__body audio{display:block;width:100%;max-width:520px;margin:1.4em auto}
.guru-article-detail__body ul[data-type="taskList"]{list-style:none;padding-left:0}
.guru-article-detail__body ul[data-type="taskList"] li{display:flex;gap:.5em;align-items:flex-start}
.guru-article-detail__body ul[data-type="taskList"] li input[type="checkbox"]{margin-top:.3em}
.guru-article-detail__tags{display:flex;flex-wrap:wrap;gap:8px;margin:32px 0}
.guru-article-detail__tags a{background:var(--guru-paper);color:var(--guru-ink);padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;text-decoration:none}

.guru-responses{margin-top:48px;border-top:1px solid var(--guru-line);padding-top:32px}
.guru-responses h2{font-family:Georgia,serif;font-size:1.5rem;color:var(--guru-navy);margin:0 0 20px}
.guru-response{padding:20px 0;border-bottom:1px solid var(--guru-line)}
.guru-response:last-child{border-bottom:0}
.guru-response__head{display:flex;align-items:center;gap:12px;margin-bottom:8px}
.guru-response__avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--guru-blue-soft),var(--guru-red-soft));display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--guru-navy);font-size:14px}
.guru-response__name{font-weight:800;color:var(--guru-navy);font-size:14px;line-height:1.2}
.guru-response__meta{color:var(--guru-muted);font-size:12px;line-height:1.2;margin-top:2px}
.guru-response__body{color:var(--guru-ink);font-size:14px;line-height:1.6;margin-left:48px;white-space:pre-wrap}

.guru-response-form{margin-top:32px;padding:24px;background:var(--guru-paper);border:1px solid var(--guru-line);border-radius:16px}
.guru-response-form h3{font-family:Georgia,serif;font-size:1.25rem;color:var(--guru-navy);margin:0 0 6px}
.guru-response-form__hint{color:var(--guru-muted);font-size:13px;margin:0 0 16px}
.guru-response-form label{display:block;margin-bottom:12px}
.guru-response-form label > span{display:block;font-size:12px;font-weight:700;color:var(--guru-ink);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
.guru-response-form input,.guru-response-form select,.guru-response-form textarea{width:100%;padding:10px 12px;border:1px solid var(--guru-line);border-radius:8px;background:#fff;font-family:inherit;font-size:14px;color:var(--guru-navy)}
.guru-response-form input:focus,.guru-response-form select:focus,.guru-response-form textarea:focus{outline:none;border-color:var(--guru-navy);box-shadow:0 0 0 3px color-mix(in srgb,var(--guru-navy) 15%,transparent)}
.guru-response-form textarea{min-height:100px;resize:vertical}
.guru-response-form__row{display:grid;gap:12px;grid-template-columns:1fr 1fr}
.guru-response-form__err{color:var(--guru-red);background:var(--guru-red-soft);border:1px solid color-mix(in srgb,var(--guru-red) 35%,var(--guru-line));border-radius:8px;padding:10px 12px;font-size:13px;margin-bottom:12px}
.guru-response-form button{background:var(--guru-red);color:#fff;font-weight:800;padding:11px 22px;border:0;border-radius:10px;font-size:14px;cursor:pointer;transition:background .15s}
.guru-response-form button:hover:not(:disabled){background:color-mix(in srgb,var(--guru-red) 85%,#000000)}
.guru-response-form button:disabled{opacity:.6;cursor:not-allowed}
.guru-response-form-success{margin-top:32px;padding:24px;background:var(--guru-sage);border:1px solid color-mix(in srgb,var(--guru-sage) 40%,var(--guru-navy));border-radius:16px;color:color-mix(in srgb,var(--guru-navy) 80%,#1a4a35)}
.guru-response-form-success strong{display:block;font-size:16px;margin-bottom:6px}
.guru-response-form-success p{margin:0;font-size:14px;line-height:1.5}
@media(max-width:520px){.guru-response-form__row{grid-template-columns:1fr}}
`,
      }}
    />
  );
}
