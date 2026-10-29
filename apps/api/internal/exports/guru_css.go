package exports

import "strings"

// guruCSS adalah salinan verbatim dari <style> yang di-emit
// apps/renderer/components/GuruBlocks.tsx::GuruStyles. Blok Guru memakai
// class-name yang sama persis, jadi CSS ini harus disinkronkan setiap kali
// komponen renderer berubah — kalau tidak, hasil export terlihat berbeda dari
// situs live.
//
// Variabel warna --guru-* sengaja TIDAK dideklarasikan di sini: buildCSS
// sudah menurunkannya dari theme user di :root. Mendeklarasikan ulang akan
// menang di cascade dan menimpa tema pilihan user.
const guruCSS = `
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
.guru-article-detail__back{display:inline-flex;align-items:center;gap:6px;color:var(--guru-muted);font-size:14px;font-weight:600;text-decoration:none;margin-bottom:18px;transition:color .15s}
.guru-article-detail__back:hover{color:var(--guru-red);text-decoration:underline}
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

/* --- Export-only: carousel tanpa JS ---
   Live pakai client component (auto-play + tombol). Static export tidak punya
   JS, jadi track diubah jadi scroll-snap supaya banner tetap bisa digeser. */
.guru-promo__track--static{overflow-x:auto;scroll-snap-type:x mandatory;transition:none;scrollbar-width:none;-ms-overflow-style:none}
.guru-promo__track--static::-webkit-scrollbar{display:none}
.guru-promo__track--static .guru-promo__slide{scroll-snap-align:center}
`

// guruVarsCSS menurunkan palet --guru-* dari theme user, mirror
// apps/renderer/lib/theme.ts::themeToCss. Pakai color-mix() supaya setiap
// turunan tetap mengikuti warna pilihan user alih-alih dikunci ke hex template.
func guruVarsCSS(primary, secondary, bg, fg string) string {
	return strings.NewReplacer("$P", primary, "$S", secondary, "$B", bg, "$F", fg).Replace(`
:root {
  --guru-navy: $P;
  --guru-ink: $F;
  --guru-cream: $B;
  --guru-red: $S;
  --guru-navy-2: color-mix(in srgb, $P 70%, #ffffff);
  --guru-muted: color-mix(in srgb, $F 55%, $B);
  --guru-paper: color-mix(in srgb, $B 30%, #ffffff);
  --guru-line: color-mix(in srgb, $F 10%, $B);
  --guru-red-soft: color-mix(in srgb, $S 15%, $B);
  --guru-blue-soft: color-mix(in srgb, $P 10%, $B);
  --guru-sage: color-mix(in srgb, $P 6%, $B);
  --guru-gold: color-mix(in srgb, $S 60%, #d6a84d);
  --guru-shadow: 0 20px 60px color-mix(in srgb, $P 20%, transparent);
  --guru-shadow-sm: 0 10px 30px color-mix(in srgb, $P 15%, transparent);
}
`)
}
