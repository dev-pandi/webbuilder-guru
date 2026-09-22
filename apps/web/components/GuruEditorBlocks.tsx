"use client";

import { useEffect, useRef, useState } from "react";

// GuruEditorBlocks.tsx — Client-side copies of renderer's GuruBlocks
// dengan CSS scoped `.guru-*`. Dipakai HANYA di editor canvas untuk
// preview visual yang identik dengan template preview.
//
// Kenapa duplikat (bukan import dari apps/renderer):
//   1. Beda Next.js app (apps/web ≠ apps/renderer) — tidak bisa share
//      React component tree langsung tanpa monorepo package
//   2. Renderer components async-safe untuk server component;
//      editor client component tidak perlu itu
//   3. Divergence rendah — template spec sudah stable
//
// Kalau CSS/JSX renderer berubah, sync-manual file ini. Test dengan
// buka editor + buka template preview URL, bandingkan visual.

// ---------------------------------------------------------------------------
// GuruStylesEditor — inject CSS scoped `.guru-*`. Include sekali di root
// editor Preview supaya semua block Guru bisa render dengan style benar.
// ---------------------------------------------------------------------------
export function GuruStylesEditor() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
:root{
  --guru-navy: var(--color-primary, #14233b);
  --guru-navy-2: #233b60;
  --guru-ink: var(--color-fg, #263247);
  --guru-muted: #6f7888;
  --guru-cream: var(--color-bg, #fbf8f1);
  --guru-paper: #ffffff;
  --guru-line: #e9e5dc;
  --guru-red: var(--color-secondary, #b6423d);
  --guru-red-soft: #f5e9e7;
  --guru-gold: #d6a84d;
  --guru-blue-soft: #eaf1f7;
  --guru-sage: #e9f0e8;
  --guru-shadow: 0 20px 60px rgba(29,42,62,.08);
  --guru-shadow-sm: 0 10px 30px rgba(29,42,62,.07);
  --guru-radius: 26px;
  --guru-radius-sm: 18px;
  --guru-max: 1180px;
}
.guru-container{width:min(var(--guru-max),calc(100% - 40px));margin-inline:auto}
.guru-eyebrow{display:inline-flex;align-items:center;gap:8px;color:var(--guru-red);font-size:12px;font-weight:800;letter-spacing:.15em;text-transform:uppercase;margin-bottom:16px}
.guru-eyebrow:before{content:"";width:28px;height:2px;background:currentColor;border-radius:2px}
.guru-meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:11px;font-weight:750;letter-spacing:.08em;text-transform:uppercase;color:var(--guru-red)}
.guru-engagement-meta{display:flex;flex-wrap:wrap;gap:7px 14px;margin-top:12px;color:var(--guru-muted);font-size:12px;font-weight:700}
.guru-site-header{background:rgba(251,248,241,.94);border-bottom:1px solid rgba(20,35,59,.08);font-family:var(--font-body,Inter),ui-sans-serif,system-ui,sans-serif;color:var(--guru-ink)}
.guru-nav-shell{min-height:76px;display:flex;align-items:center;gap:28px}
.guru-brand{display:flex;align-items:center;gap:10px;font-weight:800;color:var(--guru-navy);min-width:max-content;text-decoration:none}
.guru-brand__mark{width:38px;height:38px;border-radius:50%;background:var(--guru-navy);display:grid;place-items:center;color:#fff;font-family:var(--font-heading,Georgia),serif;font-size:20px}
.guru-brand__copy{line-height:1.1;font-size:15px}
.guru-brand__copy small{display:block;color:var(--guru-muted);font-weight:600;font-size:10px;letter-spacing:.13em;text-transform:uppercase;margin-top:4px}
.guru-site-nav{display:flex;align-items:center;gap:2px;margin-left:auto}
.guru-site-nav a{padding:10px 11px;border-radius:10px;color:#4e596a;font-size:14px;font-weight:650;white-space:nowrap;text-decoration:none}
.guru-site-nav a.is-active{color:var(--guru-navy);background:#fff}
.guru-hero{position:relative;overflow:hidden;padding:70px 0 54px;background:var(--guru-cream);color:var(--guru-ink);font-family:var(--font-body,Inter),system-ui,sans-serif}
.guru-hero__blob{position:absolute;width:500px;height:500px;border-radius:50%;background:#f2e8db;right:-180px;top:-180px;opacity:.65}
.guru-hero__grid{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(360px,.92fr);gap:60px;align-items:center;position:relative}
.guru-hero__title{font-family:var(--font-heading,Georgia),"Times New Roman",serif;color:var(--guru-navy);line-height:1.12;margin:0;font-size:clamp(38px,5vw,64px);letter-spacing:-.045em}
.guru-hero__title em{font-weight:400;color:var(--guru-red);font-style:italic}
.guru-hero__lead{font-size:17px;color:#5f6978;max-width:650px;margin:22px 0 0;line-height:1.7}
.guru-hero__actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}
.guru-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:999px;padding:11px 18px;font-weight:750;font-size:13px;border:1px solid transparent;text-decoration:none;cursor:pointer}
.guru-btn--primary{background:var(--guru-navy);color:#fff;box-shadow:0 10px 24px rgba(20,35,59,.18)}
.guru-btn--secondary{background:#fff;border-color:var(--guru-line);color:var(--guru-navy)}
.guru-hero__stats{display:flex;gap:20px;flex-wrap:wrap;margin-top:30px;padding-top:22px;border-top:1px solid var(--guru-line)}
.guru-hero__stat strong{font-family:var(--font-heading,Georgia),serif;color:var(--guru-navy);font-size:22px;display:block}
.guru-hero__stat span{font-size:11px;color:var(--guru-muted);text-transform:uppercase;letter-spacing:.08em}
.guru-hero__visual{position:relative;min-height:440px;display:grid;place-items:end center}
.guru-hero__figure-blob{position:absolute;inset:60px 28px 0;background:linear-gradient(145deg,#dfeaf1,#f5ede5);border-radius:48% 52% 44% 56%/52% 42% 58% 48%;transform:rotate(-5deg)}
.guru-hero__img{position:relative;z-index:2;max-height:420px;object-fit:contain;filter:drop-shadow(0 20px 24px rgba(30,45,66,.12));max-width:100%;display:block}
.guru-hero__note{position:absolute;z-index:3;background:#fff;border:1px solid rgba(20,35,59,.07);box-shadow:var(--guru-shadow-sm);border-radius:16px;padding:12px 15px;font-size:12px;color:var(--guru-ink);display:grid;gap:2px}
.guru-hero__note strong{color:var(--guru-navy);font-family:var(--font-heading,Georgia),serif;font-size:15px;font-weight:700}
.guru-hero__note--a{left:10px;top:80px}
.guru-hero__note--b{right:0;bottom:44px}
.guru-section{padding:64px 0;background:var(--guru-cream);color:var(--guru-ink);font-family:var(--font-body,Inter),system-ui,sans-serif}
.guru-section--alt{background:#fff}
.guru-section-heading{display:grid;grid-template-columns:.8fr 1.2fr;gap:40px;align-items:end;margin-bottom:28px}
.guru-section-heading h2{font-family:var(--font-heading,Georgia),serif;font-size:clamp(28px,3.5vw,42px);letter-spacing:-.035em;color:var(--guru-navy);line-height:1.15;margin:0}
.guru-section-heading p{margin:0;color:var(--guru-muted);max-width:640px;line-height:1.7;font-size:14px}
.guru-promo{padding:24px 0;background:var(--guru-cream)}
.guru-promo__viewport{position:relative;overflow:hidden;border-radius:var(--guru-radius);box-shadow:var(--guru-shadow);background:#fff;width:100%}
.guru-promo__slide{aspect-ratio:2/1;display:block;overflow:hidden;position:relative;background:linear-gradient(135deg,#dce8ef,#f2e3d6)}
.guru-promo__slide img{width:100%;height:100%;object-fit:cover}
.guru-promo__dots{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);display:flex;gap:8px;z-index:2}
.guru-promo__dot{width:9px;height:9px;border:0;border-radius:50%;background:rgba(255,255,255,.65);padding:0}
.guru-promo__dot.is-active{width:24px;border-radius:999px;background:#fff}
.guru-rubric-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.guru-rubric-card{position:relative;min-height:200px;background:#fff;border:1px solid var(--guru-line);border-radius:22px;padding:22px;overflow:hidden;text-decoration:none;color:inherit;display:block}
.guru-rubric-card__icon{width:44px;height:44px;border-radius:13px;display:grid;place-items:center;margin-bottom:22px;background:var(--guru-blue-soft);color:var(--guru-navy)}
.guru-rubric-card--v2 .guru-rubric-card__icon{background:var(--guru-red-soft);color:var(--guru-red)}
.guru-rubric-card--v3 .guru-rubric-card__icon{background:var(--guru-sage);color:#496b55}
.guru-rubric-card__icon svg{width:20px;height:20px}
.guru-rubric-card h3{font-family:var(--font-heading,Georgia),serif;font-size:22px;margin:0 0 8px;color:var(--guru-navy);line-height:1.15}
.guru-rubric-card p{font-size:13px;color:var(--guru-muted);margin:0;max-width:280px;line-height:1.6}
.guru-rubric-card__arrow{position:absolute;right:18px;bottom:16px;width:32px;height:32px;border-radius:50%;border:1px solid var(--guru-line);display:grid;place-items:center;color:var(--guru-navy);background:#fff;font-size:13px}
.guru-latest-grid{display:grid;grid-template-columns:1.25fr .75fr;gap:16px}
.guru-featured-post{background:var(--guru-navy);color:#fff;border-radius:var(--guru-radius);padding:28px;min-height:320px;position:relative;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;text-decoration:none}
.guru-featured-post .guru-meta{color:#e9d8bb}
.guru-featured-post h3{font-family:var(--font-heading,Georgia),serif;color:#fff;font-size:30px;max-width:560px;margin:8px 0 10px;line-height:1.15}
.guru-featured-post p{color:#d5dce6;max-width:540px;margin:0;line-height:1.6;font-size:14px}
.guru-featured-post .guru-engagement-meta{color:#dbe4ed}
.guru-side-posts{display:grid;gap:14px}
.guru-post-card{background:#fff;border:1px solid var(--guru-line);border-radius:20px;padding:18px;display:flex;gap:14px;align-items:flex-start;text-decoration:none;color:inherit}
.guru-post-card__mini-cover{flex:0 0 64px;height:64px;border-radius:14px;background:linear-gradient(145deg,#e9f1f6,#f1e5d9);display:grid;place-items:center;color:var(--guru-navy)}
.guru-post-card__mini-cover svg{width:22px;height:22px}
.guru-post-card h3{font-family:var(--font-heading,Georgia),serif;font-size:17px;margin:4px 0 5px;color:var(--guru-navy);line-height:1.2}
.guru-post-card p{font-size:12px;color:var(--guru-muted);margin:0;line-height:1.6}
.guru-quote-section{padding:48px 0 68px;background:var(--guru-cream)}
.guru-quote-card{background:#efe7db;border-radius:30px;padding:44px 50px;display:grid;grid-template-columns:auto 1fr;gap:26px;align-items:start}
.guru-quote-card__mark{font-family:var(--font-heading,Georgia),serif;font-size:76px;color:var(--guru-red);line-height:.7}
.guru-quote-card blockquote{font-family:var(--font-heading,Georgia),serif;color:var(--guru-navy);font-size:clamp(20px,2.5vw,30px);line-height:1.3;margin:0}
.guru-quote-card cite{display:block;font-family:var(--font-body,Inter),system-ui,sans-serif;font-style:normal;font-size:12px;color:var(--guru-muted);margin-top:14px;text-transform:uppercase;letter-spacing:.1em}
.guru-stats-section{background:#fff}
.guru-website-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.guru-stat-card{background:var(--guru-cream);border:1px solid var(--guru-line);border-radius:var(--guru-radius-sm);padding:22px;box-shadow:var(--guru-shadow-sm)}
.guru-stat-card__num{display:block;color:var(--guru-navy);font-family:var(--font-heading,Georgia),serif;font-size:clamp(28px,4vw,44px);line-height:1}
.guru-stat-card__label{display:block;margin-top:8px;color:var(--guru-muted);font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}
.guru-rubric-hero{padding:52px 0 22px;background:var(--guru-cream);color:var(--guru-ink);font-family:var(--font-body,Inter),system-ui,sans-serif}
.guru-rubric-hero__grid{display:grid;grid-template-columns:1fr auto;gap:24px;align-items:end}
.guru-rubric-hero h1{font-family:var(--font-heading,Georgia),serif;font-size:clamp(36px,5vw,56px);letter-spacing:-.04em;color:var(--guru-navy);margin:0;line-height:1.15}
.guru-rubric-hero p{color:var(--guru-muted);max-width:620px;margin:14px 0 0;line-height:1.7;font-size:14px}
.guru-rubric-badge{width:88px;height:88px;border-radius:24px;background:#fff;border:1px solid var(--guru-line);display:grid;place-items:center;color:var(--guru-navy);box-shadow:var(--guru-shadow-sm)}
.guru-rubric-badge svg{width:36px;height:36px}
.guru-content-layout{display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:24px;align-items:start}
.guru-article-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
.guru-article-card{background:#fff;border:1px solid var(--guru-line);border-radius:22px;overflow:hidden}
.guru-article-card--featured{grid-column:1/-1;display:grid;grid-template-columns:1fr 1.2fr}
.guru-article-cover{min-height:160px;background:linear-gradient(135deg,#dce8ef,#f2e3d6);position:relative;overflow:hidden}
.guru-article-cover--red{background:linear-gradient(135deg,#f1deda,#e7edf3)}
.guru-article-cover--sage{background:linear-gradient(135deg,#dce8df,#f2eadb)}
.guru-article-cover--gold{background:linear-gradient(135deg,#f1e8cc,#e7edf4)}
.guru-article-card__body{padding:20px}
.guru-article-card h2,.guru-article-card h3{font-family:var(--font-heading,Georgia),serif;font-size:22px;margin:6px 0 8px;color:var(--guru-navy);line-height:1.15}
.guru-article-card p{color:var(--guru-muted);font-size:13px;margin:0;line-height:1.6}
.guru-read-more{display:inline-flex;margin-top:14px;color:var(--guru-red);font-size:12px;font-weight:800;text-decoration:none}
.guru-sidebar{display:grid;gap:14px}
.guru-sidebar-card{background:#fff;border:1px solid var(--guru-line);border-radius:19px;padding:18px}
.guru-sidebar-card h3{font-family:var(--font-heading,Georgia),serif;font-size:18px;margin:0 0 10px;color:var(--guru-navy)}
.guru-sidebar-card p{color:var(--guru-muted);font-size:12px;margin:0;line-height:1.6}
.guru-tag-list{display:flex;flex-wrap:wrap;gap:6px}
.guru-tag{display:inline-flex;padding:6px 10px;border-radius:999px;background:#f4f1eb;border:1px solid var(--guru-line);font-size:11px;font-weight:700;color:#596273}
/* Profile page layout — halaman /profil template guru */
.guru-profile-layout{display:grid;grid-template-columns:340px 1fr;gap:28px;align-items:start}
.guru-profile-card{background:#fff;border:1px solid var(--guru-line);border-radius:26px;overflow:hidden}
.guru-profile-card__photo{background:linear-gradient(160deg,#e3ecf3,#f2e7dc);height:340px;display:flex;align-items:flex-end;justify-content:center;overflow:hidden}
.guru-profile-card__photo img{height:94%;width:auto;object-fit:contain}
.guru-profile-card__body{padding:22px}
.guru-profile-card h2{font-family:var(--font-heading,Georgia),serif;font-size:26px;color:var(--guru-navy);margin:0;line-height:1.15}
.guru-profile-card p{color:var(--guru-muted);margin:6px 0 16px;line-height:1.6;font-size:13px}
.guru-profile-contact{display:grid;gap:8px;font-size:13px;color:#5d6777}
.guru-profile-contact span{display:flex;gap:9px;align-items:center}
.guru-profile-content{display:grid;gap:16px}
.guru-content-panel{background:#fff;border:1px solid var(--guru-line);border-radius:22px;padding:24px}
.guru-content-panel h2{font-family:var(--font-heading,Georgia),serif;color:var(--guru-navy);font-size:24px;margin:0 0 10px;line-height:1.2}
.guru-content-panel p{color:#5d6777;line-height:1.7;margin:0;font-size:14px}
/* Timeline — dipakai di halaman profil untuk jejak mengajar */
.guru-timeline{display:grid;gap:16px;margin-top:14px}
.guru-timeline-item{display:grid;grid-template-columns:80px 1fr;gap:16px;padding-top:16px;border-top:1px solid var(--guru-line)}
.guru-timeline-item:first-child{border-top:0;padding-top:0}
.guru-timeline-item time{font-size:11px;color:var(--guru-red);font-weight:800;letter-spacing:.08em}
.guru-timeline-item strong{color:var(--guru-navy);font-size:14px}
.guru-timeline-item span{color:var(--guru-muted);font-size:13px;line-height:1.6}
.guru-topic-list{display:grid;gap:0}
.guru-topic-link{padding:9px 0;border-top:1px solid var(--guru-line);font-size:12px;color:#566174;text-decoration:none}
.guru-topic-link:first-child{border-top:0}
.guru-forum-layout{display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:24px;align-items:start}
.guru-thread-list{display:grid;gap:12px}
.guru-thread-card{background:#fff;border:1px solid var(--guru-line);border-radius:20px;padding:18px;display:grid;grid-template-columns:44px minmax(0,1fr);gap:14px;align-items:start}
.guru-thread-card--featured{border-color:#d9b0a9;background:linear-gradient(135deg,#fff,#fbf3f1)}
.guru-thread-avatar{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;font-size:11px;font-weight:900}
.guru-thread-avatar--red{background:#ead7d2;color:#8c3935}
.guru-thread-avatar--blue{background:#dce8ef;color:#27455e}
.guru-thread-avatar--sage{background:#dfe9df;color:#3d5d45}
.guru-thread-avatar--gold{background:#efe5c8;color:#70581d}
.guru-thread-topline{display:flex;justify-content:space-between;gap:12px;color:var(--guru-muted);font-size:10px}
.guru-thread-label{color:var(--guru-red);font-weight:900;text-transform:uppercase;letter-spacing:.08em}
.guru-thread-main h2{font-family:var(--font-heading,Georgia),serif;font-size:20px;margin:6px 0 6px;color:var(--guru-navy);line-height:1.2}
.guru-thread-main p{color:var(--guru-muted);font-size:12px;margin:0;line-height:1.6}
.guru-thread-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.guru-thread-tags span{background:#f4f1eb;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:800;color:#687181}
.guru-site-footer{background:var(--guru-navy);color:#d9e0e9;padding:44px 0 24px;font-family:var(--font-body,Inter),system-ui,sans-serif}
.guru-footer-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:50px;padding-bottom:30px;border-bottom:1px solid rgba(255,255,255,.12)}
.guru-site-footer .guru-brand{color:#fff}
.guru-site-footer .guru-brand__mark{background:#fff;color:var(--guru-navy)}
.guru-footer-copy{color:#aeb9c8;max-width:520px;font-size:13px;margin-top:12px;line-height:1.6}
.guru-footer-links{display:grid;grid-template-columns:repeat(2,1fr);gap:8px 24px}
.guru-footer-links a{font-size:12px;color:#d4dce6;text-decoration:none}
.guru-footer-bottom{display:flex;justify-content:space-between;gap:20px;padding-top:20px;color:#9aa7b7;font-size:11px}
`,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Inline icons — sama seperti renderer, biar rubric card icon konsisten
// ---------------------------------------------------------------------------
const RUBRIC_ICONS: Record<string, JSX.Element> = {
  book: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" />
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
      <path d="M4 5h16v11H8l-4 4z" /><path d="M8 9h8M8 12h5" />
    </svg>
  ),
};

// ---------------------------------------------------------------------------
// Static components — match renderer JSX
// ---------------------------------------------------------------------------

export function GuruNavbarEditor(p: {
  brandName?: string;
  brandRole?: string;
  brandMark?: string;
  links?: Array<{ label: string; href: string; active?: boolean }>;
}) {
  const links = p.links && p.links.length > 0 ? p.links : [
    { label: "Beranda", href: "/", active: true },
    { label: "Profil", href: "/profil" },
    { label: "Ceritaku", href: "/ceritaku" },
    { label: "Bacaanku", href: "/bacaanku" },
    { label: "Inspirasiku", href: "/inspirasiku" },
    { label: "Bangsaku", href: "/bangsaku" },
    { label: "Peradaban", href: "/peradaban" },
    { label: "Forum Diskusi", href: "/forum-diskusi" },
    { label: "Pembelajaran", href: "/pembelajaran" },
  ];
  const mark = p.brandMark || (p.brandName ?? "G").charAt(0);
  return (
    <header className="guru-site-header">
      <div className="guru-container guru-nav-shell">
        <a className="guru-brand" href="#" aria-label={`Beranda ${p.brandName ?? ""}`}>
          <span className="guru-brand__mark">{mark}</span>
          <span className="guru-brand__copy">
            {p.brandName ?? "Nama Guru"}
            {p.brandRole ? <small>{p.brandRole}</small> : null}
          </span>
        </a>
        <nav className="guru-site-nav">
          {links.map((l, i) => (
            <a key={i} href={l.href || "#"} className={l.active ? "is-active" : undefined}>
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}

// noteStyle — sama dengan renderer, inline style dari X/Y user.
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

// DraggableNote — wrap note dengan mouse drag handler. Update posisi live
// saat mouse move, commit ke onMoved saat mouse up. Anchor "top-left" pakai
// left/top; "bottom-right" pakai right/bottom (invert delta X/Y karena
// bergerak kanan = right value berkurang).
function DraggableNote({
  children,
  className,
  anchor,
  x,
  y,
  onMoved,
}: {
  children: React.ReactNode;
  className?: string;
  anchor: "top-left" | "bottom-right";
  x?: number | string;
  y?: number | string;
  onMoved?: (x: number, y: number) => void;
}) {
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const startRef = useRef<{
    mouseX: number;
    mouseY: number;
    startX: number;
    startY: number;
  } | null>(null);

  // Sinkron drag state kalau props diubah dari luar (mis. PropEditor).
  useEffect(() => {
    setDragPos(null);
  }, [x, y]);

  const numX = typeof x === "number" ? x : parseFloat(String(x ?? 0)) || 0;
  const numY = typeof y === "number" ? y : parseFloat(String(y ?? 0)) || 0;

  function onMouseDown(e: React.MouseEvent) {
    // Skip kalau ini bukan tombol kiri.
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    startRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: numX,
      startY: numY,
    };

    function onMove(ev: MouseEvent) {
      const s = startRef.current;
      if (!s) return;
      const dx = ev.clientX - s.mouseX;
      const dy = ev.clientY - s.mouseY;
      // top-left: bergerak kanan/bawah = tambah nilai
      // bottom-right: bergerak kanan/bawah = kurangi nilai (offset dari sisi)
      const newX = anchor === "top-left" ? s.startX + dx : s.startX - dx;
      const newY = anchor === "top-left" ? s.startY + dy : s.startY - dy;
      setDragPos({ x: newX, y: newY });
    }

    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      // Commit ke callback pakai posisi terakhir dari state (via functional update)
      setDragPos((p) => {
        if (p && onMoved) onMoved(Math.round(p.x), Math.round(p.y));
        startRef.current = null;
        return p; // biar tidak reset — useEffect di atas reset otomatis saat props update
      });
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const activeX = dragPos?.x ?? numX;
  const activeY = dragPos?.y ?? numY;
  const styleAnchor =
    anchor === "top-left"
      ? { left: activeX, top: activeY }
      : { right: activeX, bottom: activeY };

  return (
    <div
      className={className}
      style={{
        ...noteStyle(styleAnchor),
        cursor: dragPos ? "grabbing" : "grab",
        userSelect: "none",
        touchAction: "none",
      }}
      onMouseDown={onMouseDown}
      title="Klik dan geser untuk pindahkan"
    >
      {children}
    </div>
  );
}

export function GuruHeroEditor(p: {
  eyebrow?: string; title?: string; titleEm?: string; subtitle?: string;
  ctaLabel?: string; ctaHref?: string;
  ctaSecondaryLabel?: string; ctaSecondaryHref?: string;
  image?: string; imageAlt?: string;
  stats?: Array<{ value: string; label: string }>;
  noteAText?: string; noteASub?: string;
  noteAShow?: "show" | "hide"; noteAX?: number | string; noteAY?: number | string;
  noteBText?: string; noteBSub?: string;
  noteBShow?: "show" | "hide"; noteBX?: number | string; noteBY?: number | string;
  // Callback dipanggil saat user selesai drag salah satu note. Callback
  // update block props di editor state → posisi persist saat save.
  onNoteMove?: (which: "A" | "B", x: number, y: number) => void;
}) {
  return (
    <section className="guru-hero">
      <div className="guru-hero__blob" aria-hidden />
      <div className="guru-container guru-hero__grid">
        <div>
          {p.eyebrow ? <div className="guru-eyebrow">{p.eyebrow}</div> : null}
          <h1 className="guru-hero__title">
            {p.title}
            {p.titleEm ? (<><br /><em>{p.titleEm}</em></>) : null}
          </h1>
          {p.subtitle ? <p className="guru-hero__lead">{p.subtitle}</p> : null}
          {(p.ctaLabel || p.ctaSecondaryLabel) && (
            <div className="guru-hero__actions">
              {p.ctaLabel ? (
                <a className="guru-btn guru-btn--primary" href="#">{p.ctaLabel} <span>→</span></a>
              ) : null}
              {p.ctaSecondaryLabel ? (
                <a className="guru-btn guru-btn--secondary" href="#">{p.ctaSecondaryLabel}</a>
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
            <img src={p.image} alt={p.imageAlt ?? ""} className="guru-hero__img" />
          ) : null}
          {p.noteAText && p.noteAShow !== "hide" ? (
            <DraggableNote
              className="guru-hero__note guru-hero__note--a"
              anchor="top-left"
              x={p.noteAX}
              y={p.noteAY}
              onMoved={(x, y) => p.onNoteMove?.("A", x, y)}
            >
              <strong>{p.noteAText}</strong>
              {p.noteASub ? <span>{p.noteASub}</span> : null}
            </DraggableNote>
          ) : null}
          {p.noteBText && p.noteBShow !== "hide" ? (
            <DraggableNote
              className="guru-hero__note guru-hero__note--b"
              anchor="bottom-right"
              x={p.noteBX}
              y={p.noteBY}
              onMoved={(x, y) => p.onNoteMove?.("B", x, y)}
            >
              <strong>{p.noteBText}</strong>
              {p.noteBSub ? <span>{p.noteBSub}</span> : null}
            </DraggableNote>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function GuruRubricGridEditor(p: {
  eyebrow?: string; title?: string; subtitle?: string;
  items?: Array<{ title: string; desc?: string; href?: string; icon?: string }>;
}) {
  const items = p.items ?? [
    { title: "Ceritaku", desc: "Cerita keseharian dan pengalaman mengajar.", icon: "book" },
    { title: "Bacaanku", desc: "Buku yang saya baca dan bawa kembali ke ruang kelas.", icon: "bookmark" },
    { title: "Inspirasiku", desc: "Praktik baik, ide sederhana, dan orang yang menginspirasi.", icon: "sparkle" },
    { title: "Bangsaku", desc: "Belajar Indonesia lewat kewargaan, keberagaman, bahasa.", icon: "flag" },
    { title: "Peradaban", desc: "Membaca sejarah, budaya, dan warisan sebagai percakapan.", icon: "temple" },
    { title: "Forum Diskusi", desc: "Ruang percakapan bersama pembaca dan sesama guru.", icon: "chat" },
  ];
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
              <a key={i} href="#" className={`guru-rubric-card guru-rubric-card--v${(i % 3) + 1}`}>
                <div className="guru-rubric-card__icon">{iconEl}</div>
                <h3>{it.title}</h3>
                {it.desc ? <p>{it.desc}</p> : null}
                <span className="guru-rubric-card__arrow" aria-hidden>→</span>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function GuruRubricHeroEditor(p: {
  eyebrow?: string; title?: string; subtitle?: string; iconKey?: string;
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

export function GuruQuoteEditor(p: { text?: string; author?: string }) {
  if (!p.text) return null;
  return (
    <section className="guru-quote-section">
      <div className="guru-container">
        <div className="guru-quote-card">
          <div className="guru-quote-card__mark" aria-hidden>&ldquo;</div>
          <blockquote>
            {p.text}
            {p.author ? <cite>{p.author}</cite> : null}
          </blockquote>
        </div>
      </div>
    </section>
  );
}

export function GuruFooterEditor(p: {
  brandName?: string;
  brandRole?: string;
  brandMark?: string;
  copyText?: string;
  builderTitle?: string;
  builderBrand?: string;
  builderNote?: string;
  links?: Array<{ label: string; href: string }>;
  bottomLeft?: string;
  bottomRight?: string;
}) {
  const links = p.links && p.links.length > 0 ? p.links : [
    { label: "Ceritaku", href: "/ceritaku" },
    { label: "Bacaanku", href: "/bacaanku" },
    { label: "Inspirasiku", href: "/inspirasiku" },
    { label: "Bangsaku", href: "/bangsaku" },
    { label: "Peradaban", href: "/peradaban" },
    { label: "Forum Diskusi", href: "/forum-diskusi" },
    { label: "Pembelajaran", href: "/pembelajaran" },
    { label: "Profil", href: "/profil" },
  ];
  const mark = p.brandMark || (p.brandName ?? "G").charAt(0);
  return (
    <footer className="guru-site-footer">
      <div className="guru-container">
        <div className="guru-footer-grid">
          <div>
            <a className="guru-brand" href="/">
              <span className="guru-brand__mark">{mark}</span>
              <span className="guru-brand__copy">
                {p.brandName ?? "Nama Guru"}
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
          <nav className="guru-footer-links" aria-label="Navigasi footer">
            {links.map((l, i) => <a key={i} href={l.href || "#"}>{l.label}</a>)}
          </nav>
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
// Dynamic block previews — render dengan sample data untuk visualization.
// Data live akan di-fetch di renderer. Di editor cukup tampilkan mock supaya
// visual mirip result live.
// ---------------------------------------------------------------------------

// Sample fallback untuk kondisi kosong (belum ada items) — 3 slide gradient
// warna dengan label copy.
const FALLBACK_PROMO_SLIDES = [
  { bg: "linear-gradient(135deg,#dce8ef 0%,#f2e3d6 100%)", label: "Contoh Banner 1", sub: "1200 × 600" },
  { bg: "linear-gradient(135deg,#f1deda 0%,#e7edf3 100%)", label: "Contoh Banner 2", sub: "1200 × 600" },
  { bg: "linear-gradient(135deg,#dce8df 0%,#f2eadb 100%)", label: "Contoh Banner 3", sub: "1200 × 600" },
];

// Sample banners untuk Dynamic variant — image path match backend seed
// (seed_guru.go → sampleGuruBanners). Kalau file asset ada di renderer
// static, akan render image asli; kalau tidak, browser tampil broken +
// fallback ke gradient bg CSS `.guru-promo__slide`.
const DYNAMIC_SAMPLE_BANNERS: Array<{ image: string; alt: string }> = [
  { image: "/templates/guru-pandi-upi/promo-pelatihan-guru.png",
    alt: "Program pelatihan pengembangan guru" },
  { image: "/templates/guru-pandi-upi/promo-literasi-kelas.png",
    alt: "Program literasi kelas" },
  { image: "/templates/guru-pandi-upi/promo-komunitas-guru.png",
    alt: "Komunitas berbagi praktik baik guru" },
];

export function GuruPromoCarouselEditorPreview(p: {
  items?: Array<{ image?: string; alt?: string; href?: string; caption?: string }>;
  isDynamic?: boolean;
}) {
  // Kalau ada items dengan image, pakai; kalau tidak:
  //   - isDynamic → tampil sample banner asli dari asset seed (biar preview
  //     mirip yang akan muncul di /template-preview beneran)
  //   - static → tampil fallback gradient dengan label placeholder
  const userItems = (p.items ?? []).filter((it) => it && (it.image || it.alt));
  const hasUserItems = userItems.length > 0;

  const slides = hasUserItems
    ? userItems.map((it, i) => ({
        image: it.image ?? "",
        alt: it.alt ?? `Banner ${i + 1}`,
      }))
    : p.isDynamic
    ? DYNAMIC_SAMPLE_BANNERS
    : FALLBACK_PROMO_SLIDES.map((s) => ({ image: "", alt: s.label, bg: s.bg, sub: s.sub, isFallback: true as const }));

  const total = slides.length;
  // Preview: slide pertama aktif + hint 3 dots + arrow chrome.
  return (
    <section className="guru-promo">
      <div className="guru-container">
        <div
          className="guru-promo__viewport"
          style={{ position: "relative" }}
          aria-label={hasUserItems ? "Preview carousel promosi" : "Placeholder carousel — belum ada banner"}
        >
          <div className="guru-promo__slide" style={{ background: (slides[0] as { bg?: string }).bg ?? undefined }}>
            {slides[0].image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={slides[0].image} alt={slides[0].alt} />
            ) : (
              // Placeholder content di dalam slide — tetap render gradient bg.
              <div
                style={{
                  position: "absolute", inset: 0, display: "flex",
                  flexDirection: "column", alignItems: "center", justifyContent: "center",
                  color: "#4c5b70", textAlign: "center", padding: 20, gap: 8,
                }}
              >
                <div style={{ fontSize: 34, opacity: 0.55 }}>🖼</div>
                <div style={{ fontFamily: "Georgia, serif", fontSize: 20, fontWeight: 700, color: "#172033" }}>
                  {(slides[0] as { isFallback?: boolean }).isFallback ? slides[0].alt : "Belum ada gambar"}
                </div>
                <div style={{ fontSize: 12, color: "#6f7888", letterSpacing: ".05em" }}>
                  {(slides[0] as { sub?: string }).sub ?? "Rasio 2:1 · unggah gambar di panel kanan"}
                </div>
              </div>
            )}
          </div>
          {/* Prev/next chrome (visual only di editor) */}
          <button
            type="button"
            className="guru-promo__ctrl guru-promo__ctrl--prev"
            aria-hidden
            tabIndex={-1}
            disabled
          >‹</button>
          <button
            type="button"
            className="guru-promo__ctrl guru-promo__ctrl--next"
            aria-hidden
            tabIndex={-1}
            disabled
          >›</button>
          <div className="guru-promo__dots" aria-hidden>
            {Array.from({ length: Math.max(total, 1) }).map((_, i) => (
              <span key={i} className={`guru-promo__dot${i === 0 ? " is-active" : ""}`} />
            ))}
          </div>
        </div>
        {/* Info footer untuk kejelasan sumber data */}
        {p.isDynamic ? (
          <p style={{ marginTop: 10, fontSize: 12, color: "#6f7888", textAlign: "center" }}>
            📊 <strong>Dynamic</strong> — banner asli diambil dari menu <strong>Guru → Ruang Promosi</strong> saat website di-render.
          </p>
        ) : !hasUserItems ? (
          <p style={{ marginTop: 10, fontSize: 12, color: "#6f7888", textAlign: "center" }}>
            💡 Placeholder — tambahkan item banner di panel <strong>Properti</strong> kanan supaya carousel terisi.
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function GuruStatsBarEditorPreview(p: {
  eyebrow?: string; title?: string; subtitle?: string; sample?: boolean;
}) {
  const items = p.sample === false
    ? [
        { value: "0", label: "Total Views" },
        { value: "0", label: "Tanggapan" },
        { value: "0", label: "Tulisan" },
      ]
    : [
        { value: "42.680", label: "Total Views" },
        { value: "324", label: "Tanggapan" },
        { value: "186", label: "Tulisan" },
      ];
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

export function GuruLatestGridEditorPreview(p: {
  eyebrow?: string; title?: string; subtitle?: string;
}) {
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
          <a className="guru-featured-post" href="#">
            <div className="guru-meta"><span>Ceritaku · Contoh</span></div>
            <h3>Judul tulisan featured akan tampil di sini</h3>
            <p>Excerpt tulisan terbaru dari salah satu rubrik akan diambil otomatis dari DB.</p>
            <div className="guru-engagement-meta"><span>0 views · 0 tanggapan</span></div>
          </a>
          <div className="guru-side-posts">
            {[0, 1, 2].map((i) => (
              <a key={i} className="guru-post-card" href="#">
                <div className="guru-post-card__mini-cover">{RUBRIC_ICONS.book}</div>
                <div>
                  <div className="guru-meta"><span>Rubrik</span></div>
                  <h3>Tulisan side {i + 1}</h3>
                  <p>Excerpt singkat contoh.</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function GuruArticleGridEditorPreview(p: {
  rubric?: string; sidebarTitle?: string; sidebarBody?: string;
  sidebarTags?: string[]; sidebarLinks?: Array<{ label: string; href: string }>;
}) {
  const items = [
    { title: "Contoh tulisan featured", excerpt: "Excerpt tulisan pertama dari rubrik ini.", meta: `${p.rubric ?? "ceritaku"} · Contoh`, coverVariant: "red", featured: true },
    { title: "Contoh tulisan kedua", excerpt: "Excerpt kedua.", meta: `${p.rubric ?? "ceritaku"} · Contoh`, coverVariant: "default" },
    { title: "Contoh tulisan ketiga", excerpt: "Excerpt ketiga.", meta: `${p.rubric ?? "ceritaku"} · Contoh`, coverVariant: "sage" },
    { title: "Contoh tulisan keempat", excerpt: "Excerpt keempat.", meta: `${p.rubric ?? "ceritaku"} · Contoh`, coverVariant: "gold" },
  ];
  return (
    <section className="guru-section">
      <div className="guru-container guru-content-layout">
        <div className="guru-article-grid">
          {items.map((it, i) => {
            const coverClass = it.coverVariant ? `guru-article-cover--${it.coverVariant}` : "";
            const featuredClass = it.featured ? "guru-article-card--featured" : "";
            return (
              <article key={i} className={`guru-article-card ${featuredClass}`.trim()}>
                <div className={`guru-article-cover ${coverClass}`.trim()} />
                <div className="guru-article-card__body">
                  <div className="guru-meta"><span>{it.meta}</span></div>
                  <h2>{it.title}</h2>
                  <p>{it.excerpt}</p>
                  <a className="guru-read-more" href="#">Baca selengkapnya →</a>
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
                {p.sidebarTags.map((t, i) => <span key={i} className="guru-tag">{t}</span>)}
              </div>
            </div>
          ) : null}
          {p.sidebarLinks && p.sidebarLinks.length > 0 ? (
            <div className="guru-sidebar-card">
              <h3>Jelajahi ruang lain</h3>
              <div className="guru-topic-list">
                {p.sidebarLinks.map((l, i) => <a key={i} href="#" className="guru-topic-link">{l.label}</a>)}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}

export function GuruForumThreadListEditorPreview() {
  const items = [
    { initials: "RP", variant: "red", label: "Diskusi Utama", date: "Contoh", title: "Contoh topik forum utama", excerpt: "Topik pertama akan tampil di sini.", tags: ["Contoh", "Diskusi"], engagement: "0 views · 0 tanggapan", featured: true },
    { initials: "GS", variant: "blue", label: "Guru & Siswa", date: "Contoh", title: "Contoh topik kedua", excerpt: "Topik kedua.", tags: ["Contoh"], engagement: "0 views · 0 tanggapan" },
    { initials: "OT", variant: "sage", label: "Orang Tua", date: "Contoh", title: "Contoh topik ketiga", excerpt: "Topik ketiga.", tags: ["Contoh"], engagement: "0 views · 0 tanggapan" },
  ];
  return (
    <section className="guru-section">
      <div className="guru-container guru-forum-layout">
        <div className="guru-thread-list">
          {items.map((it, i) => (
            <article key={i} className={`guru-thread-card ${it.featured ? "guru-thread-card--featured" : ""}`.trim()}>
              <div className={`guru-thread-avatar guru-thread-avatar--${it.variant}`}>{it.initials}</div>
              <div className="guru-thread-main">
                <div className="guru-thread-topline">
                  <span className="guru-thread-label">{it.label}</span>
                  <span>{it.date}</span>
                </div>
                <h2><a href="#">{it.title}</a></h2>
                <p>{it.excerpt}</p>
                <div className="guru-thread-tags">
                  {it.tags.map((t) => <span key={t}>{t}</span>)}
                </div>
                <div className="guru-engagement-meta"><span>{it.engagement}</span></div>
              </div>
            </article>
          ))}
        </div>
        <aside className="guru-sidebar">
          <div className="guru-sidebar-card">
            <h3>Ruang Diskusi</h3>
            <p>List topik akan diambil dari rubric <strong>forum-diskusi</strong> di DB.</p>
          </div>
        </aside>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Profile page components — dipakai di halaman /profil template guru
// ---------------------------------------------------------------------------

// Sample profil default — mirror seed dari sampleGuruProfile() di
// seed_guru.go supaya editor preview identik dengan tampilan live setelah
// user pilih template guru.
const SAMPLE_PROFILE_CONTACTS = [
  { icon: "📍", label: "Bandung, Indonesia" },
  { icon: "✉️", label: "guru@rumahguru.id" },
  { icon: "🌐", label: "rumahguru.id" },
];

const SAMPLE_PROFILE_PANELS = [
  {
    eyebrow: "Tentang Saya",
    title: "Ruang kelas sebagai ruang tumbuh.",
    body: "Selama lebih dari satu dekade, saya belajar bahwa mengajar bukan hanya memindahkan pengetahuan. Ia juga tentang mendengar, memberi ruang, dan membantu siswa menemukan bahasa untuk menjelaskan apa yang mereka pikirkan.",
  },
  {
    title: "Nilai yang saya pegang",
    body: "Keingintahuan lebih penting daripada terlihat selalu benar. Bahasa dapat menjadi jembatan, bukan sekadar mata pelajaran.",
  },
];

const SAMPLE_TIMELINE_ITEMS = [
  { date: "2014—2018", title: "Guru Bahasa Indonesia", desc: "Mengembangkan kebiasaan jurnal membaca dan presentasi buku." },
  { date: "2019—2023", title: "Koordinator program literasi sekolah", desc: "Mendampingi klub baca, pojok literasi, dan lokakarya menulis sederhana." },
  { date: "2024—Kini", title: "Guru & pembelajar", desc: "Fokus pada dokumentasi praktik baik dan percakapan antarguru." },
];

const SAMPLE_TAGS = ["Literasi", "Bahasa Indonesia", "Sastra", "Refleksi Mengajar", "Budaya Nusantara", "Diskusi Kelas"];

export function GuruProfileCardEditor(p: {
  image?: string;
  name?: string;
  role?: string;
  contacts?: Array<{ icon?: string; label: string }>;
  panels?: Array<{ eyebrow?: string; title?: string; body?: string }>;
}) {
  // Kalau semua kosong (block baru drag ke canvas), tampilkan sample
  // supaya user lihat contoh layout — bukan card kosong.
  const isEmpty = !p.image && !p.name && !p.role
    && (!p.contacts || p.contacts.length === 0)
    && (!p.panels || p.panels.length === 0);
  const contacts = p.contacts && p.contacts.length > 0 ? p.contacts : (isEmpty ? SAMPLE_PROFILE_CONTACTS : []);
  const panels = p.panels && p.panels.length > 0 ? p.panels : (isEmpty ? SAMPLE_PROFILE_PANELS : []);
  const name = p.name ?? (isEmpty ? "Nama Guru" : "");
  const role = p.role ?? (isEmpty ? "Guru Bahasa Indonesia · SMP Nusantara Raya" : "");

  return (
    <section className="guru-section">
      <div className="guru-container guru-profile-layout">
        <aside className="guru-profile-card">
          <div
            className="guru-profile-card__photo"
            style={p.image ? undefined : { alignItems: "center", justifyContent: "center", color: "#a5aebf" }}
          >
            {p.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image} alt={name} decoding="async" />
            ) : (
              <div style={{ textAlign: "center", padding: 20 }}>
                <div style={{ fontSize: 48, marginBottom: 8 }}>👤</div>
                <div style={{ fontSize: 12, letterSpacing: ".05em", color: "#8790a1" }}>
                  Placeholder foto profil
                </div>
              </div>
            )}
          </div>
          <div className="guru-profile-card__body">
            {name ? <h2>{name}</h2> : null}
            {role ? <p>{role}</p> : null}
            {contacts.length > 0 ? (
              <div className="guru-profile-contact">
                {contacts.map((c, i) => (
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
          {panels.map((panel, i) => (
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

export function GuruTimelineEditor(p: {
  title?: string;
  items?: Array<{ date: string; title: string; desc?: string }>;
}) {
  const items = p.items && p.items.length > 0 ? p.items : SAMPLE_TIMELINE_ITEMS;
  return (
    <section className="guru-section">
      <div className="guru-container">
        <div className="guru-content-panel">
          <h2>{p.title ?? "Jejak mengajar"}</h2>
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

export function GuruTagListEditor(p: {
  title?: string;
  // Accept dua format:
  //   - Legacy string[] (dari template lama / seed data)
  //   - Array<{label}> (dari editor UI items field)
  tags?: Array<string | { label?: string }>;
}) {
  const list = normalizeTags(p.tags);
  const tags = list.length > 0 ? list : SAMPLE_TAGS;
  return (
    <section className="guru-section">
      <div className="guru-container">
        <div className="guru-content-panel">
          <h2>{p.title ?? "Fokus & minat"}</h2>
          <div className="guru-tag-list">
            {tags.map((t, i) => (
              <span key={i} className="guru-tag">{t}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// normalizeTags — flatten string[] ATAU Array<{label}> ke plain string[].
// Filter empty entries + trim.
function normalizeTags(tags?: Array<string | { label?: string }>): string[] {
  if (!tags) return [];
  return tags
    .map((t) => (typeof t === "string" ? t : (t?.label ?? "")))
    .map((s) => s.trim())
    .filter(Boolean);
}

export function GuruLearningGridEditorPreview(p: {
  sidebarTitle?: string; sidebarBody?: string;
}) {
  const items = [
    { title: "Contoh materi 1", excerpt: "Deskripsi materi pertama.", meta: "Pembelajaran · Contoh", coverVariant: "", featured: true },
    { title: "Contoh materi 2", excerpt: "Deskripsi materi kedua.", meta: "Pembelajaran · Contoh", coverVariant: "red" },
    { title: "Contoh materi 3", excerpt: "Deskripsi materi ketiga.", meta: "Pembelajaran · Contoh", coverVariant: "sage" },
    { title: "Contoh materi 4", excerpt: "Deskripsi materi keempat.", meta: "Pembelajaran · Contoh", coverVariant: "gold" },
  ];
  return (
    <section className="guru-section">
      <div className="guru-container guru-content-layout">
        <div className="guru-article-grid">
          {items.map((it, i) => (
            <article key={i} className={`guru-article-card ${it.featured ? "guru-article-card--featured" : ""}`.trim()}>
              <div className={`guru-article-cover ${it.coverVariant ? `guru-article-cover--${it.coverVariant}` : ""}`.trim()} />
              <div className="guru-article-card__body">
                <div className="guru-meta"><span>{it.meta}</span></div>
                <h2>{it.title}</h2>
                <p>{it.excerpt}</p>
                <a className="guru-read-more" href="#">Lihat materi →</a>
              </div>
            </article>
          ))}
        </div>
        <aside className="guru-sidebar">
          {p.sidebarTitle ? (
            <div className="guru-sidebar-card">
              <h3>{p.sidebarTitle}</h3>
              {p.sidebarBody ? <p>{p.sidebarBody}</p> : null}
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
