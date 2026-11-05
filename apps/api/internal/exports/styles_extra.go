package exports

// extraCSS — gaya untuk blok di render_extra.go. Mencerminkan tampilan
// Tailwind di apps/renderer/components/Blocks.tsx tanpa dependensi Tailwind;
// aturan utilitas (tabs radio, marquee, spotlight, grid pattern) disalin dari
// apps/renderer/app/globals.css supaya perilakunya identik dengan live.
const extraCSS = `
/* --- utilitas (salinan globals.css renderer) --- */
@keyframes wb-fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@keyframes wb-spotlight {
  0%, 100% { transform: translate(-50%, 0) scale(1); opacity: 0.35; }
  50%      { transform: translate(-50%, -20px) scale(1.08); opacity: 0.5; }
}
.wb-spotlight-anim { animation: wb-spotlight 8s ease-in-out infinite; }
.wb-grid-pattern { position: absolute; inset: 0; background-image: radial-gradient(currentColor 1px, transparent 1px); background-size: 24px 24px; opacity: 0.2; }
@keyframes wb-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.wb-marquee { display: flex; gap: 1rem; width: max-content; animation: wb-marquee 32s linear infinite; }
.wb-marquee:hover { animation-play-state: paused; }
.wb-marquee-mask { overflow: hidden; margin-top: 2.5rem;
  -webkit-mask-image: linear-gradient(to right, transparent, black 8%, black 92%, transparent);
          mask-image: linear-gradient(to right, transparent, black 8%, black 92%, transparent); }
.wb-media-placeholder { aspect-ratio: 16 / 9; width: 100%; border: 1px solid rgba(15,23,42,.1); border-radius: 1rem;
  background: linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 15%, transparent), color-mix(in srgb, var(--color-secondary) 8%, transparent)); }
.wb-eyebrow { display: inline-flex; align-items: center; gap: .375rem; border: 1px solid rgba(15,23,42,.15); border-radius: 999px; padding: .25rem .75rem; font-size: .75rem; font-weight: 500; text-transform: uppercase; letter-spacing: .05em; opacity: .8; margin-bottom: 1.25rem; }
.wb-eyebrow-dot { width: 6px; height: 6px; border-radius: 999px; background: #10b981; }
.wb-hero-ctas { margin-top: 2.5rem; display: flex; flex-wrap: wrap; gap: .75rem; justify-content: inherit; }

/* --- Spacer/Divider/Banner --- */
.wb-divider { max-width: 64rem; margin: 0 auto; padding: 2rem 1.5rem; }
.wb-divider span { display: block; height: 1px; background: rgba(15,23,42,.1); }
.wb-divider--labeled { display: flex; align-items: center; gap: 1rem; }
.wb-divider--labeled span { flex: 1; background: rgba(15,23,42,.15); }
.wb-divider--labeled em { font-style: normal; font-size: .75rem; font-weight: 500; text-transform: uppercase; letter-spacing: .1em; opacity: .6; }
.wb-banner { display: flex; align-items: center; justify-content: center; gap: .75rem; padding: .625rem 1.5rem; text-align: center; font-size: .875rem; color: #fff; background: var(--color-primary); }
.wb-banner a { color: #fff; font-weight: 600; text-decoration: underline; text-underline-offset: 2px; }

/* --- Quote --- */
.wb-quote { max-width: 48rem; margin: 0 auto; padding: 4rem 1.5rem; }
.wb-quote-mark { font-size: 3rem; line-height: 1; opacity: .3; color: var(--color-primary); }
.wb-quote blockquote { margin: 1rem 0 0; font-size: 1.5rem; font-weight: 500; line-height: 1.375; }
.wb-quote footer { margin-top: 1.5rem; display: flex; align-items: center; gap: .75rem; font-size: .875rem; }
.wb-quote-rule { height: 2px; width: 2.5rem; background: var(--color-primary); }
.wb-quote-author { font-weight: 600; }
.wb-quote-role { opacity: .6; }

/* --- Alert --- */
.wb-alert { max-width: 48rem; margin: 0 auto; padding: 1.5rem; }
.wb-alert { display: flex; gap: .75rem; border-radius: .75rem; border: 1px solid; }
.wb-alert--info    { background: rgba(59,130,246,.1);  border-color: rgba(59,130,246,.3); }
.wb-alert--success { background: rgba(16,185,129,.1);  border-color: rgba(16,185,129,.3); }
.wb-alert--warning { background: rgba(245,158,11,.1);  border-color: rgba(245,158,11,.3); }
.wb-alert--danger  { background: rgba(239,68,68,.1);   border-color: rgba(239,68,68,.3); }
.wb-alert-icon { font-size: 1.25rem; line-height: 1; }
.wb-alert-title { font-weight: 600; margin: 0; }
.wb-alert-body { margin: .25rem 0 0; font-size: .875rem; opacity: .8; }

/* --- Stats --- */
.wb-statsbar { max-width: 64rem; margin: 0 auto; padding: 3rem 1.5rem; }
.wb-statsbar-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2rem 1rem; border: 1px solid rgba(15,23,42,.1); border-radius: 1rem; padding: 2rem; background: linear-gradient(135deg, rgba(15,23,42,.02), transparent); }
@media (min-width: 640px) { .wb-statsbar-grid { grid-template-columns: repeat(4, 1fr); } }
.wb-statsbar-item { text-align: center; }
.wb-statsbar-value { font-size: 2.5rem; font-weight: 700; letter-spacing: -.025em; color: var(--color-primary); }
.wb-statsbar-label { margin-top: .25rem; font-size: .875rem; text-transform: uppercase; letter-spacing: .05em; opacity: .7; }
.wb-statscard { max-width: 48rem; margin: 0 auto; padding: 4rem 1.5rem; }
.wb-statscard-box { border: 1px solid rgba(15,23,42,.1); border-radius: 1.5rem; padding: 3rem; text-align: center; background: linear-gradient(135deg, rgba(15,23,42,.02), transparent); }
.wb-statscard-value { font-size: 4.5rem; font-weight: 700; letter-spacing: -.025em; color: var(--color-primary); }
.wb-statscard-label { margin-top: 1rem; font-size: 1.125rem; font-weight: 600; text-transform: uppercase; letter-spacing: .1em; opacity: .8; }
.wb-statscard-desc { max-width: 36rem; margin: 1rem auto 0; font-size: .875rem; opacity: .7; }

/* --- VideoEmbed / LogoCloud --- */
.wb-videoembed { max-width: 56rem; margin: 0 auto; padding: 3rem 1.5rem; }
.wb-videoembed h3 { margin: 0 0 1.5rem; text-align: center; font-size: 1.875rem; font-weight: 700; letter-spacing: -.025em; }
.wb-logocloud { max-width: 64rem; margin: 0 auto; padding: 3rem 1.5rem; }
.wb-logocloud-title { margin: 0 0 2rem; text-align: center; font-size: .875rem; font-weight: 500; text-transform: uppercase; letter-spacing: .1em; opacity: .7; }
.wb-logocloud-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 1.5rem 3rem; }
.wb-logocloud-row img { height: 2rem; opacity: .6; filter: grayscale(1); }
.wb-logocloud-row span { font-size: 1.125rem; font-weight: 600; letter-spacing: -.025em; opacity: .5; }

/* --- Tabs (radio hack, salinan perilaku renderer) --- */
.wb-tabs { max-width: 48rem; margin: 0 auto; padding: 3rem 1.5rem; }
.wb-tab-input { position: absolute; opacity: 0; pointer-events: none; }
.wb-tab-list { display: flex; gap: .25rem; border-bottom: 1px solid rgba(15,23,42,.1); }
.wb-tab-label { cursor: pointer; border-bottom: 2px solid transparent; padding: .625rem 1rem; font-size: .875rem; font-weight: 500; opacity: .6; }
.wb-tab-label:hover { opacity: 1; }
.wb-tab-panels { margin-top: 1.5rem; }
.wb-tab-panel { display: none; font-size: 1rem; line-height: 1.625; opacity: .9; }
.wb-tab-input:nth-of-type(1):checked ~ .wb-tab-panels .wb-tab-panel:nth-of-type(1),
.wb-tab-input:nth-of-type(2):checked ~ .wb-tab-panels .wb-tab-panel:nth-of-type(2),
.wb-tab-input:nth-of-type(3):checked ~ .wb-tab-panels .wb-tab-panel:nth-of-type(3),
.wb-tab-input:nth-of-type(4):checked ~ .wb-tab-panels .wb-tab-panel:nth-of-type(4) { display: block; animation: wb-fade-in .2s ease-out; }
.wb-tab-input:nth-of-type(1):checked ~ .wb-tab-list .wb-tab-label:nth-of-type(1),
.wb-tab-input:nth-of-type(2):checked ~ .wb-tab-list .wb-tab-label:nth-of-type(2),
.wb-tab-input:nth-of-type(3):checked ~ .wb-tab-list .wb-tab-label:nth-of-type(3),
.wb-tab-input:nth-of-type(4):checked ~ .wb-tab-list .wb-tab-label:nth-of-type(4) { border-color: var(--color-primary); opacity: 1; }

/* --- Testimonial --- */
.wb-tcard { max-width: 48rem; margin: 0 auto; padding: 4rem 1.5rem; }
.wb-tcard-box { border: 1px solid rgba(15,23,42,.1); border-radius: 1.5rem; padding: 2.5rem; background: linear-gradient(135deg, rgba(15,23,42,.03), transparent); }
.wb-tcard-stars { margin-bottom: 1rem; display: flex; gap: .125rem; }
.wb-star { font-size: 1.25rem; color: #fbbf24; }
.wb-star--off { color: currentColor; opacity: .2; }
.wb-tcard-box blockquote { margin: 0; font-size: 1.5rem; font-weight: 500; line-height: 1.375; }
.wb-tcard-person { margin-top: 1.5rem; display: flex; align-items: center; gap: 1rem; }
.wb-tcard-person img { width: 3.5rem; height: 3.5rem; border-radius: 999px; object-fit: cover; }
.wb-tcard-initial { display: grid; place-items: center; width: 2.25rem; height: 2.25rem; border-radius: 999px; font-weight: 700; color: #fff; background: var(--color-primary); }
.wb-tcard-person .wb-tcard-initial { width: 3.5rem; height: 3.5rem; font-size: 1.125rem; }
.wb-tcard-name { font-weight: 600; }
.wb-tcard-role { font-size: .875rem; opacity: .7; }
.wb-tmarquee { max-width: 72rem; margin: 0 auto; padding: 4rem 0; }
.wb-tmarquee h3 { margin: 0; padding: 0 1.5rem; text-align: center; font-size: 1.875rem; font-weight: 700; letter-spacing: -.025em; }
.wb-tmarquee-card { width: 320px; flex-shrink: 0; border: 1px solid rgba(15,23,42,.1); border-radius: 1rem; padding: 1.5rem; background: rgba(15,23,42,.02); }
.wb-tmarquee-card p { margin: 0; font-size: .875rem; line-height: 1.625; opacity: .9; }
.wb-tmarquee-person { margin-top: 1rem; display: flex; align-items: center; gap: .75rem; font-size: .875rem; }

/* --- Pricing --- */
.wb-pricing { max-width: 64rem; margin: 0 auto; padding: 4rem 1.5rem; }
.wb-pricing h3 { margin: 0; text-align: center; font-size: 1.875rem; font-weight: 700; letter-spacing: -.025em; }
.wb-pricing-sub { max-width: 36rem; margin: .75rem auto 0; text-align: center; opacity: .7; }
.wb-pricing-grid { margin-top: 3rem; display: grid; gap: 1.5rem; }
@media (min-width: 768px) { .wb-pricing-grid { grid-template-columns: repeat(3, 1fr); } }
.wb-plan { position: relative; display: flex; flex-direction: column; border: 1px solid rgba(15,23,42,.1); border-radius: 1rem; padding: 1.75rem; }
.wb-plan--featured { border: 2px solid var(--color-primary); box-shadow: 0 10px 30px rgba(15,23,42,.08); }
.wb-plan-badge { position: absolute; top: -.75rem; left: 50%; transform: translateX(-50%); border-radius: 999px; padding: .125rem .75rem; font-size: .75rem; font-weight: 600; text-transform: uppercase; letter-spacing: .025em; color: #fff; background: var(--color-primary); }
.wb-plan h4 { margin: 0; font-size: 1.125rem; font-weight: 600; }
.wb-plan-desc { margin: .25rem 0 0; font-size: .875rem; opacity: .7; }
.wb-plan-price { margin-top: 1.25rem; display: flex; align-items: baseline; gap: .25rem; }
.wb-plan-price span { font-size: 2.25rem; font-weight: 700; letter-spacing: -.025em; }
.wb-plan-price em { font-style: normal; font-size: .875rem; opacity: .6; }
.wb-plan-features { list-style: none; margin: 1.5rem 0 0; padding: 0; flex: 1; font-size: .875rem; }
.wb-plan-features li { display: flex; align-items: flex-start; gap: .5rem; margin-top: .625rem; }
.wb-plan-check { display: flex; align-items: center; justify-content: center; width: 1.25rem; height: 1.25rem; flex-shrink: 0; border-radius: 999px; font-size: .75rem; color: #fff; background: var(--color-primary); }
.wb-plan .wb-btn { margin-top: 1.75rem; text-align: center; }

/* --- Hero --- */
.wb-spotlight { position: relative; isolation: isolate; overflow: hidden; }
.wb-spotlight-bg { position: absolute; inset: 0; z-index: -1; }
.wb-spotlight-glow { position: absolute; left: 50%; top: 0; height: 600px; width: 1000px; transform: translateX(-50%); opacity: .4; filter: blur(64px);
  background: radial-gradient(closest-side, var(--color-primary), transparent 70%); }
.wb-spotlight-inner { max-width: 56rem; margin: 0 auto; padding: 6rem 1.5rem; text-align: center; }
.wb-spotlight-inner h1 { margin: 0; font-size: 3rem; font-weight: 700; line-height: 1.1; letter-spacing: -.025em; }
.wb-spotlight-inner .wb-hero-ctas { justify-content: center; }
.wb-hero-sub { margin: 1.5rem auto 0; max-width: 42rem; font-size: 1.125rem; opacity: .8; }
.wb-herosplit { max-width: 72rem; margin: 0 auto; padding: 5rem 1.5rem; display: grid; align-items: center; gap: 3rem; }
@media (min-width: 1024px) {
  .wb-herosplit { grid-template-columns: 1fr 1fr; }
  .wb-herosplit--reversed .wb-herosplit-copy { order: 2; }
}
.wb-herosplit-copy h1 { margin: 0; font-size: 2.5rem; font-weight: 700; line-height: 1.15; letter-spacing: -.025em; }
.wb-herosplit-media img { width: 100%; border: 1px solid rgba(15,23,42,.1); border-radius: 1rem; box-shadow: 0 20px 50px rgba(15,23,42,.12); }

/* --- FeatureSide --- */
.wb-featureside { max-width: 64rem; margin: 0 auto; padding: 5rem 1.5rem; display: grid; gap: 5rem; }
.wb-featureside-row { display: grid; align-items: center; gap: 2.5rem; }
@media (min-width: 1024px) {
  .wb-featureside-row { grid-template-columns: 1fr 1fr; }
  .wb-featureside-row--reversed .wb-featureside-copy { order: 2; }
}
.wb-featureside-copy h3 { margin: 0; font-size: 1.875rem; font-weight: 700; letter-spacing: -.025em; }
.wb-featureside-copy p { margin: .75rem 0 0; font-size: 1.125rem; opacity: .8; }
.wb-featureside-media img { width: 100%; border: 1px solid rgba(15,23,42,.1); border-radius: 1rem; box-shadow: 0 10px 30px rgba(15,23,42,.1); }
`
