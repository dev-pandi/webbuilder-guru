// PembelajaranStyles — scoped CSS inject sekali per halaman detail
// pembelajaran. Pakai pola yang sama dengan GuruStyles / GuruPlusStyles.
// Semua selector .pembelajaran-* — tidak conflict dengan block Guru lainnya.

export function PembelajaranStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
/* ================= READING PROGRESS BAR ================= */
.pembelajaran-progress{
  position:fixed;top:0;left:0;height:3px;z-index:999;
  background:linear-gradient(to right,var(--guru-navy, #14233b),var(--guru-red, #b6423d));
  pointer-events:none;
  transition:width .08s linear;
  will-change:width;
}
@media(prefers-reduced-motion:reduce){.pembelajaran-progress{transition:none}}

/* ================= GRID + ADAPTIVE LAYOUT ================= */
.pembelajaran-grid{
  display:grid;grid-template-columns:1fr;
  max-width:1280px;margin:0 auto;padding:32px 24px 72px;gap:48px;
  color:var(--guru-ink, #263247);
  font-family:var(--font-body,Inter),system-ui,sans-serif;
}
/* Center-only (short standalone materi) → max-width lebih sempit untuk readability */
.pembelajaran-grid:not([data-sidebar]):not([data-toc]) .pembelajaran-main{
  max-width:720px;margin:0 auto;
}
/* Center + TOC (standalone materi panjang) */
.pembelajaran-grid[data-toc]:not([data-sidebar]){
  grid-template-columns:minmax(0,1fr) 220px;max-width:1080px;
}
/* Sidebar + center (banyak materi flat) */
.pembelajaran-grid[data-sidebar]:not([data-toc]){
  grid-template-columns:260px minmax(0,1fr);
}
/* Full 3-column (kurikulum berjenjang) */
.pembelajaran-grid[data-sidebar][data-toc]{
  grid-template-columns:260px minmax(0,1fr) 220px;
}
@media(max-width:1024px){
  .pembelajaran-grid[data-sidebar][data-toc],
  .pembelajaran-grid[data-sidebar]:not([data-toc]){
    grid-template-columns:1fr;
  }
  .pembelajaran-grid[data-toc]:not([data-sidebar]){
    grid-template-columns:1fr;
  }
  .pembelajaran-sidebar,.pembelajaran-toc{display:none}
  .pembelajaran-sidebar-mobile{display:block}
}
@media(min-width:1025px){
  .pembelajaran-sidebar-mobile{display:none}
}

/* ================= SIDEBAR NAV (desktop + mobile) ================= */
.pembelajaran-sidebar{
  position:sticky;top:24px;align-self:start;max-height:calc(100vh - 48px);
  overflow-y:auto;padding-right:12px;
}
.pembelajaran-sidebar__home{margin-bottom:16px}
.pembelajaran-sidebar__home a{
  display:inline-flex;align-items:center;gap:8px;
  padding:8px 12px;border-radius:10px;
  font-size:13px;font-weight:650;
  color:var(--guru-muted, #6f7888);text-decoration:none;
  transition:color .15s ease,background .15s ease;
}
.pembelajaran-sidebar__home a:hover{color:var(--guru-navy, #14233b);background:var(--guru-cream, #fbf8f1)}
.pembelajaran-sidebar__home svg{width:14px;height:14px}
.pembelajaran-sidebar__tree{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:4px}
.pembelajaran-sidebar__section{margin-top:12px;margin-bottom:4px}
.pembelajaran-sidebar__parent{
  display:block;padding:6px 12px;
  font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;
  color:var(--guru-navy, #14233b);text-decoration:none;
  transition:color .15s ease;
}
.pembelajaran-sidebar__parent:hover{color:var(--guru-red, #b6423d)}
.pembelajaran-sidebar__parent.is-active{color:var(--guru-red, #b6423d)}
.pembelajaran-sidebar__emoji{display:inline-block;margin-right:6px;font-size:1.1em;line-height:1}
.pembelajaran-sidebar__children{
  list-style:none;padding:0;margin:0 0 0 10px;
  border-left:1px solid var(--guru-line, #e9e5dc);
  display:flex;flex-direction:column;gap:2px;
}
.pembelajaran-sidebar__link{
  display:block;padding:7px 12px 7px 14px;
  margin-left:-1px;border-left:2px solid transparent;
  font-size:14px;font-weight:500;
  color:var(--guru-muted, #6f7888);text-decoration:none;
  transition:color .15s ease,border-color .15s ease,background .15s ease;
  line-height:1.4;
}
.pembelajaran-sidebar__link:hover{color:var(--guru-navy, #14233b)}
.pembelajaran-sidebar__link.is-active{
  color:var(--guru-navy, #14233b);font-weight:650;
  border-left-color:var(--guru-red, #b6423d);
  background:color-mix(in srgb,var(--guru-red, #b6423d) 6%,transparent);
  border-radius:0 6px 6px 0;
}
.pembelajaran-sidebar__link--flat{
  margin-left:0;padding:8px 12px;border-left:0;
}
.pembelajaran-sidebar__link--flat.is-active{
  background:color-mix(in srgb,var(--guru-red, #b6423d) 10%,transparent);
  border-radius:8px;
}

/* ================= MOBILE DRAWER <details> ================= */
.pembelajaran-sidebar-mobile{
  border:1px solid var(--guru-line, #e9e5dc);
  border-radius:12px;background:var(--guru-paper, #fff);
  margin-bottom:20px;
}
.pembelajaran-sidebar-mobile summary{
  list-style:none;cursor:pointer;
  display:flex;align-items:center;justify-content:space-between;
  padding:12px 16px;
  font-size:14px;font-weight:650;color:var(--guru-navy, #14233b);
}
.pembelajaran-sidebar-mobile summary::-webkit-details-marker{display:none}
.pembelajaran-sidebar-mobile summary svg{width:14px;height:14px;transition:transform .2s ease}
.pembelajaran-sidebar-mobile[open] summary svg{transform:rotate(180deg)}
.pembelajaran-sidebar-mobile nav{padding:0 16px 16px}

/* ================= MAIN CONTENT ================= */
.pembelajaran-main{min-width:0;max-width:760px}
.pembelajaran-grid[data-sidebar][data-toc] .pembelajaran-main,
.pembelajaran-grid[data-sidebar]:not([data-toc]) .pembelajaran-main{max-width:none}

/* Breadcrumb — minimal */
.pembelajaran-breadcrumb{
  display:flex;align-items:center;gap:10px;
  font-size:13px;color:var(--guru-muted, #6f7888);
  margin-bottom:20px;flex-wrap:wrap;
  font-weight:500;
}
.pembelajaran-breadcrumb a{
  color:inherit;text-decoration:none;
  transition:color .15s ease;
}
.pembelajaran-breadcrumb a:hover{color:var(--guru-navy, #14233b)}
.pembelajaran-breadcrumb__sep{
  opacity:.4;font-weight:400;
}

/* H1 — refined, lebih tight */
.pembelajaran-main h1{
  font-family:var(--font-heading,Georgia),serif;
  font-size:clamp(30px,3.6vw,42px);
  letter-spacing:-.028em;line-height:1.1;
  color:var(--guru-navy, #14233b);margin:0 0 20px;
  font-weight:700;
}
.pembelajaran-main__deck{
  font-size:18px;line-height:1.6;color:var(--guru-muted, #6f7888);
  margin:20px 0 32px;font-weight:400;max-width:680px;
}

/* Metadata chip row — kontekstual + compact */
.pembelajaran-meta{
  display:flex;flex-wrap:wrap;gap:14px 20px;
  margin:0 0 28px;
  font-size:13px;color:var(--guru-muted, #6f7888);
  font-weight:500;
}
.pembelajaran-meta__chip{
  display:inline-flex;align-items:center;gap:6px;
  text-decoration:none;color:inherit;
  transition:color .15s ease;
}
.pembelajaran-meta__chip svg{width:14px;height:14px;opacity:.7}
a.pembelajaran-meta__chip:hover{color:var(--guru-navy, #14233b)}

/* Cover — modernized */
.pembelajaran-cover{
  margin:0 0 32px;border-radius:16px;overflow:hidden;
  background:var(--guru-cream, #fbf8f1);
  border:1px solid var(--guru-line, #e9e5dc);
  aspect-ratio:16/9;
}
.pembelajaran-cover img{
  width:100%;height:100%;object-fit:cover;display:block;
}

/* Divider halus antara head & body */
.pembelajaran-divider{
  border:0;height:1px;margin:28px 0;
  background:linear-gradient(to right,
    transparent,
    color-mix(in srgb,var(--guru-line, #e9e5dc) 80%,transparent) 10%,
    color-mix(in srgb,var(--guru-line, #e9e5dc) 80%,transparent) 90%,
    transparent);
}

/* Body prose — line length tuned for readability */
.pembelajaran-body{
  line-height:1.75;font-size:16.5px;
  color:var(--guru-ink, #263247);
  font-weight:400;
}
.pembelajaran-body h2,.pembelajaran-body h3{
  font-family:var(--font-heading,Georgia),serif;
  color:var(--guru-navy, #14233b);
  letter-spacing:-.022em;scroll-margin-top:88px;
  position:relative;font-weight:700;
}
.pembelajaran-body h2{font-size:26px;margin:48px 0 14px;line-height:1.25}
.pembelajaran-body h3{font-size:19px;margin:32px 0 10px;line-height:1.3}
.pembelajaran-body h2 .pembelajaran-anchor,
.pembelajaran-body h3 .pembelajaran-anchor{
  opacity:0;margin-left:8px;color:var(--guru-muted, #6f7888);
  text-decoration:none;font-weight:400;
  transition:opacity .15s ease;
}
.pembelajaran-body h2:hover .pembelajaran-anchor,
.pembelajaran-body h3:hover .pembelajaran-anchor{opacity:1}
.pembelajaran-body p{margin:0 0 16px}
.pembelajaran-body ul,.pembelajaran-body ol{margin:0 0 16px;padding-left:28px}
.pembelajaran-body li{margin:4px 0}
.pembelajaran-body a{color:var(--guru-red, #b6423d);text-decoration:underline;text-underline-offset:3px}
.pembelajaran-body a:hover{text-decoration:none}
.pembelajaran-body blockquote{
  margin:20px 0;padding:14px 20px;
  border-left:4px solid var(--guru-red, #b6423d);
  background:var(--guru-cream, #fbf8f1);
  border-radius:0 10px 10px 0;color:var(--guru-navy, #14233b);
  font-style:italic;
}
.pembelajaran-body code{
  background:color-mix(in srgb,var(--guru-navy, #14233b) 6%,var(--guru-cream, #fbf8f1));
  padding:2px 6px;border-radius:4px;font-size:.9em;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
}
.pembelajaran-body pre{
  background:var(--guru-navy, #14233b);color:var(--guru-cream, #fbf8f1);
  padding:16px 20px;border-radius:12px;overflow-x:auto;margin:20px 0;
}
.pembelajaran-body pre code{background:transparent;padding:0;color:inherit}
.pembelajaran-body img{max-width:100%;height:auto;border-radius:12px;margin:20px 0}
.pembelajaran-body table{width:100%;border-collapse:collapse;margin:20px 0;font-size:14px}
.pembelajaran-body th,.pembelajaran-body td{
  padding:10px 14px;border:1px solid var(--guru-line, #e9e5dc);text-align:left;
}
.pembelajaran-body th{background:var(--guru-cream, #fbf8f1);font-weight:700}

/* ================= CALLOUTS (info/tip/warning/danger/note/success) ================= */
.pembelajaran-callout{
  margin:24px 0;padding:16px 20px;
  border-radius:12px;border:1px solid;
  display:flex;flex-direction:column;gap:8px;
  background:var(--guru-paper, #fff);
}
.pembelajaran-callout__head{
  display:flex;align-items:center;gap:10px;
  font-weight:700;font-size:14px;letter-spacing:-.005em;
}
.pembelajaran-callout__icon{display:inline-flex;align-items:center;justify-content:center}
.pembelajaran-callout__icon svg{width:18px;height:18px}
.pembelajaran-callout__title{line-height:1}
.pembelajaran-callout__body{font-size:15px;line-height:1.65;color:var(--guru-ink, #263247)}
.pembelajaran-callout__body > p:first-child{margin-top:0}
.pembelajaran-callout__body > p:last-child{margin-bottom:0}
.pembelajaran-callout__body p{margin:0 0 8px}

/* Info — biru */
.pembelajaran-callout--info{
  border-color:#bfdbfe;background:color-mix(in srgb,#dbeafe 60%,#fff);
}
.pembelajaran-callout--info .pembelajaran-callout__head{color:#1e40af}
/* Tip — hijau */
.pembelajaran-callout--tip{
  border-color:#bbf7d0;background:color-mix(in srgb,#dcfce7 60%,#fff);
}
.pembelajaran-callout--tip .pembelajaran-callout__head{color:#166534}
/* Warning — kuning/amber */
.pembelajaran-callout--warning{
  border-color:#fde68a;background:color-mix(in srgb,#fef3c7 60%,#fff);
}
.pembelajaran-callout--warning .pembelajaran-callout__head{color:#92400e}
/* Danger — merah */
.pembelajaran-callout--danger{
  border-color:#fecaca;background:color-mix(in srgb,#fee2e2 60%,#fff);
}
.pembelajaran-callout--danger .pembelajaran-callout__head{color:#991b1b}
/* Note — abu-abu */
.pembelajaran-callout--note{
  border-color:var(--guru-line, #e9e5dc);
  background:color-mix(in srgb,var(--guru-cream, #fbf8f1) 70%,#fff);
}
.pembelajaran-callout--note .pembelajaran-callout__head{color:var(--guru-navy, #14233b)}
/* Success — hijau lebih terang */
.pembelajaran-callout--success{
  border-color:#86efac;background:color-mix(in srgb,#d1fae5 60%,#fff);
}
.pembelajaran-callout--success .pembelajaran-callout__head{color:#065f46}

/* Summary callout — refined */
.pembelajaran-summary{
  margin:36px 0 0;padding:18px 22px;
  background:color-mix(in srgb,var(--guru-cream, #fbf8f1) 60%,#fff);
  border:1px solid var(--guru-line, #e9e5dc);
  border-radius:14px;
  display:flex;flex-direction:column;gap:6px;
}
.pembelajaran-summary__label{
  display:inline-flex;align-items:center;gap:6px;
  font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;
  color:var(--guru-navy, #14233b);
}
.pembelajaran-summary__label svg{width:14px;height:14px;color:var(--guru-red, #b6423d)}
.pembelajaran-summary__body{
  font-size:15.5px;line-height:1.65;color:var(--guru-ink, #263247);
}

/* Tags — minimal border */
.pembelajaran-tags{
  display:flex;flex-wrap:wrap;gap:6px;margin-top:28px;
}
.pembelajaran-tags span{
  padding:4px 11px;border-radius:999px;
  border:1px solid var(--guru-line, #e9e5dc);
  background:transparent;
  color:var(--guru-muted, #6f7888);
  font-size:12px;font-weight:550;
  transition:border-color .15s ease,color .15s ease;
}
.pembelajaran-tags span:hover{
  border-color:var(--guru-navy, #14233b);
  color:var(--guru-navy, #14233b);
}

/* Prev / Next CTA — modern dengan arrow slide */
.pembelajaran-nav{
  display:grid;grid-template-columns:1fr 1fr;gap:12px;
  margin-top:48px;padding-top:32px;
  border-top:1px solid var(--guru-line, #e9e5dc);
}
@media(max-width:600px){.pembelajaran-nav{grid-template-columns:1fr}}
.pembelajaran-nav__card{
  display:flex;align-items:center;gap:14px;
  padding:18px 20px;
  border:1px solid var(--guru-line, #e9e5dc);border-radius:14px;
  background:var(--guru-paper, #fff);text-decoration:none;color:inherit;
  transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease;
  min-width:0;
}
.pembelajaran-nav__card:hover{
  transform:translateY(-2px);
  border-color:var(--guru-navy, #14233b);
  box-shadow:0 10px 26px color-mix(in srgb,var(--guru-navy, #14233b) 12%,transparent);
}
.pembelajaran-nav__card--next{justify-content:flex-end;text-align:right}
.pembelajaran-nav__body{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
.pembelajaran-nav__arrow{
  display:grid;place-items:center;
  width:36px;height:36px;border-radius:50%;
  background:color-mix(in srgb,var(--guru-navy, #14233b) 6%,var(--guru-cream, #fbf8f1));
  color:var(--guru-navy, #14233b);
  flex-shrink:0;
  transition:transform .25s cubic-bezier(.2,.9,.3,1),background .25s ease,color .25s ease;
}
.pembelajaran-nav__arrow svg{width:16px;height:16px}
.pembelajaran-nav__card:hover .pembelajaran-nav__arrow{
  background:var(--guru-red, #b6423d);color:#fff;
}
.pembelajaran-nav__card:not(.pembelajaran-nav__card--next):hover .pembelajaran-nav__arrow{
  transform:translateX(-4px);
}
.pembelajaran-nav__card--next:hover .pembelajaran-nav__arrow{
  transform:translateX(4px);
}
.pembelajaran-nav__label{
  font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;
  color:var(--guru-muted, #6f7888);
}
.pembelajaran-nav__title{
  font-family:var(--font-heading,Georgia),serif;
  font-size:16px;color:var(--guru-navy, #14233b);line-height:1.3;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}

/* ================= RESPONSES ================= */
.pembelajaran-responses{
  margin-top:56px;padding-top:40px;
  border-top:1px solid var(--guru-line, #e9e5dc);
}
.pembelajaran-responses__head{
  display:flex;align-items:baseline;gap:10px;margin-bottom:20px;
}
.pembelajaran-responses__head h2{
  font-family:var(--font-heading,Georgia),serif;
  font-size:24px;color:var(--guru-navy, #14233b);
  margin:0;line-height:1.2;letter-spacing:-.02em;
}
.pembelajaran-responses__count{
  padding:2px 10px;border-radius:999px;
  background:color-mix(in srgb,var(--guru-navy, #14233b) 8%,var(--guru-cream, #fbf8f1));
  color:var(--guru-navy, #14233b);
  font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;
}
.pembelajaran-responses__empty{
  padding:24px;border-radius:12px;
  background:color-mix(in srgb,var(--guru-cream, #fbf8f1) 50%,#fff);
  border:1px dashed var(--guru-line, #e9e5dc);
  color:var(--guru-muted, #6f7888);font-size:14px;text-align:center;
  margin:0 0 20px;
}
.pembelajaran-responses__list{
  display:flex;flex-direction:column;gap:12px;margin-bottom:28px;
}

/* ================= TOC (On this page) ================= */
.pembelajaran-toc{position:relative}
.pembelajaran-toc__sticky{position:sticky;top:24px;align-self:start;max-height:calc(100vh - 48px);overflow-y:auto}
.pembelajaran-toc__title{
  font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;
  color:var(--guru-muted, #6f7888);margin-bottom:12px;
}
.pembelajaran-toc ul{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:4px;border-left:1px solid var(--guru-line, #e9e5dc)}
.pembelajaran-toc__item{position:relative;margin-left:-1px}
.pembelajaran-toc__item a{
  display:block;padding:4px 12px;
  border-left:2px solid transparent;
  font-size:13px;color:var(--guru-muted, #6f7888);text-decoration:none;
  transition:color .15s ease,border-color .15s ease;
}
.pembelajaran-toc__item--3 a{padding-left:24px;font-size:12.5px}
.pembelajaran-toc__item a:hover{color:var(--guru-navy, #14233b)}
.pembelajaran-toc__item.is-active a{
  color:var(--guru-navy, #14233b);font-weight:650;
  border-left-color:var(--guru-red, #b6423d);
}

/* ================= REDUCED MOTION ================= */
@media(prefers-reduced-motion:reduce){
  .pembelajaran-sidebar__home a,.pembelajaran-sidebar__parent,.pembelajaran-sidebar__link,
  .pembelajaran-toc__item a,.pembelajaran-nav__card,.pembelajaran-nav__arrow,
  .pembelajaran-meta__chip,.pembelajaran-tags span,.pembelajaran-sidebar-mobile summary svg,
  .pembelajaran-breadcrumb a{
    transition:none;
  }
}
`,
      }}
    />
  );
}
