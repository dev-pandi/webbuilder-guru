package exports

// proCSS is the stylesheet for the PRO block family. Mirrors the rules in
// apps/renderer/app/globals.css and apps/web/app/globals.css so exported
// static HTML renders identically to the live renderer.
//
// All animations are GPU-friendly (transform/opacity) and respect
// prefers-reduced-motion.
const proCSS = `
/* ---------- AuroraHero ---------- */
@keyframes wb-aurora {
  0%, 100% { transform: translate3d(0,0,0) rotate(0deg); }
  50%      { transform: translate3d(8%, -6%, 0) rotate(30deg); }
}
.wb-pro-aurora { position: relative; overflow: hidden; padding: 6rem 1.5rem; text-align: center; isolation: isolate; }
.wb-pro-aurora::before,
.wb-pro-aurora::after {
  content: ""; position: absolute; inset: -20%; z-index: -1;
  background:
    radial-gradient(circle at 20% 30%, color-mix(in srgb, var(--color-primary) 35%, transparent), transparent 50%),
    radial-gradient(circle at 80% 70%, color-mix(in srgb, var(--color-secondary) 35%, transparent), transparent 50%),
    radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--color-primary) 25%, transparent), transparent 50%);
  filter: blur(40px); animation: wb-aurora 18s ease-in-out infinite;
}
.wb-pro-aurora::after { animation-duration: 24s; animation-direction: reverse; opacity: 0.7; }
.wb-pro-aurora .wb-pro-eyebrow { display: inline-flex; gap: 0.5rem; align-items: center; padding: 0.25rem 0.75rem; border: 1px solid rgba(0,0,0,0.08); background: rgba(255,255,255,0.5); border-radius: 999px; font-size: 0.7rem; letter-spacing: 0.1em; text-transform: uppercase; backdrop-filter: blur(4px); }
.wb-pro-aurora h1 { font-size: clamp(2.5rem, 5vw, 4rem); font-weight: 800; letter-spacing: -0.02em; margin-top: 1rem; }
.wb-pro-aurora .wb-pro-sub { max-width: 38rem; margin: 1rem auto 0; opacity: 0.75; }
.wb-pro-aurora .wb-pro-cta { display: inline-block; margin-top: 2rem; padding: 0.75rem 1.5rem; border-radius: var(--radius); background: var(--color-primary); color: #fff; font-weight: 600; text-decoration: none; }

/* ---------- SpotlightHero ---------- */
@keyframes wb-spotlight-pulse {
  0%, 100% { opacity: 0.55; transform: translate(-50%, -50%) scale(1); }
  50%      { opacity: 0.85; transform: translate(-50%, -50%) scale(1.1); }
}
.wb-pro-spotlight { position: relative; overflow: hidden; padding: 7rem 1.5rem; text-align: center; background: #050505; color: #fff; }
.wb-pro-spotlight::before {
  content: ""; position: absolute; left: 50%; top: 30%; width: 800px; height: 800px;
  background: radial-gradient(circle, color-mix(in srgb, var(--color-primary) 40%, transparent), transparent 60%);
  filter: blur(50px); transform: translate(-50%, -50%);
  animation: wb-spotlight-pulse 6s ease-in-out infinite;
}
.wb-pro-spotlight h1 { position: relative; font-size: clamp(2.5rem, 5vw, 4rem); font-weight: 800; letter-spacing: -0.02em; max-width: 36rem; margin: 0 auto; background: linear-gradient(180deg, #fff 0%, rgba(255,255,255,0.55) 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
.wb-pro-spotlight .wb-pro-sub { position: relative; margin: 1rem auto 0; max-width: 32rem; opacity: 0.65; }
.wb-pro-spotlight .wb-pro-cta { position: relative; display: inline-block; margin-top: 2rem; padding: 0.75rem 1.5rem; border-radius: var(--radius); background: #fff; color: #050505; font-weight: 600; text-decoration: none; }

/* ---------- HighlightHero ---------- */
@keyframes wb-highlight-marker {
  from { background-size: 0% 100%; }
  to   { background-size: 100% 100%; }
}
.wb-pro-highlight { padding: 5rem 1.5rem; text-align: center; }
.wb-pro-highlight h1 { font-size: clamp(2.25rem, 4.5vw, 3.5rem); font-weight: 800; letter-spacing: -0.02em; line-height: 1.2; max-width: 42rem; margin: 0 auto; }
.wb-pro-highlight .wb-pro-mark {
  background-image: linear-gradient(120deg, color-mix(in srgb, var(--color-primary) 35%, transparent), color-mix(in srgb, var(--color-secondary) 35%, transparent));
  background-repeat: no-repeat; background-position: 0 88%; background-size: 100% 38%;
  animation: wb-highlight-marker 1.4s cubic-bezier(.34,.8,.36,1) both 0.4s;
  padding: 0 0.25em;
}
.wb-pro-highlight .wb-pro-sub { margin: 1rem auto 0; max-width: 32rem; opacity: 0.75; }
.wb-pro-highlight .wb-pro-cta { display: inline-block; margin-top: 1.5rem; padding: 0.6rem 1.25rem; border-radius: var(--radius); background: var(--color-primary); color: #fff; font-weight: 600; text-decoration: none; }

/* ---------- LampHero ---------- */
@keyframes wb-lamp-glow {
  0%, 100% { opacity: 0.7; }
  50%      { opacity: 1; }
}
.wb-pro-lamp { position: relative; overflow: hidden; padding: 8rem 1.5rem 5rem; text-align: center; background: #050518; color: #fff; isolation: isolate; }
.wb-pro-lamp::before {
  content: ""; position: absolute; left: 50%; top: 0; transform: translateX(-50%);
  width: 0; height: 0;
  border-left: 320px solid transparent;
  border-right: 320px solid transparent;
  border-top: 240px solid color-mix(in srgb, var(--color-primary) 70%, transparent);
  filter: blur(30px); opacity: 0.85; z-index: -1;
  animation: wb-lamp-glow 4s ease-in-out infinite;
}
.wb-pro-lamp::after {
  content: ""; position: absolute; left: 0; right: 0; top: 240px; height: 1px;
  background: linear-gradient(90deg, transparent, var(--color-primary) 50%, transparent);
  box-shadow: 0 0 24px 4px var(--color-primary);
}
.wb-pro-lamp h1 { font-size: clamp(2.5rem, 5vw, 4rem); font-weight: 800; letter-spacing: -0.02em; background: linear-gradient(180deg, #fff, rgba(255,255,255,0.45)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.wb-pro-lamp .wb-pro-sub { margin-top: 1rem; max-width: 32rem; margin-inline: auto; opacity: 0.7; }
.wb-pro-lamp .wb-pro-cta { display: inline-block; margin-top: 2rem; padding: 0.75rem 1.5rem; border-radius: var(--radius); background: var(--color-primary); color: #fff; font-weight: 600; text-decoration: none; }

/* ---------- TypewriterHero ---------- */
@keyframes wb-typewriter { from { width: 0; } to { width: 100%; } }
@keyframes wb-caret { 50% { border-color: transparent; } }
.wb-pro-typewriter { padding: 5rem 1.5rem; text-align: center; }
.wb-pro-typewriter h1 { font-size: clamp(2rem, 4vw, 3rem); font-weight: 800; letter-spacing: -0.02em; }
.wb-pro-typewriter .wb-pro-typed {
  display: inline-block; vertical-align: bottom; overflow: hidden; white-space: nowrap;
  border-right: 3px solid currentColor; color: var(--color-primary);
  animation: wb-typewriter 3s steps(40, end) 0.2s both, wb-caret 0.8s step-end infinite;
}
.wb-pro-typewriter .wb-pro-sub { margin: 1rem auto 0; max-width: 32rem; opacity: 0.75; }
.wb-pro-typewriter .wb-pro-cta { display: inline-block; margin-top: 1.5rem; padding: 0.6rem 1.25rem; border-radius: var(--radius); background: var(--color-primary); color: #fff; font-weight: 600; text-decoration: none; }

/* ---------- GradientTextHero ---------- */
@keyframes wb-gradient-shift {
  0%, 100% { background-position: 0% 50%; }
  50%      { background-position: 100% 50%; }
}
.wb-pro-gtext { padding: 6rem 1.5rem; text-align: center; }
.wb-pro-gtext .wb-pro-eyebrow { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 999px; background: color-mix(in srgb, var(--color-primary) 10%, transparent); color: var(--color-primary); font-size: 0.7rem; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 600; }
.wb-pro-gtext h1 { font-size: clamp(2.75rem, 6vw, 5rem); font-weight: 900; letter-spacing: -0.03em; line-height: 1.05; margin-top: 1.25rem;
  background: linear-gradient(90deg, var(--color-primary), var(--color-secondary), var(--color-primary));
  background-size: 200% auto; -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: wb-gradient-shift 6s linear infinite;
}
.wb-pro-gtext .wb-pro-sub { margin: 1rem auto 0; max-width: 32rem; opacity: 0.75; }
.wb-pro-gtext .wb-pro-cta { display: inline-block; margin-top: 1.5rem; padding: 0.75rem 1.5rem; border-radius: var(--radius); background: var(--color-fg); color: var(--color-bg); font-weight: 600; text-decoration: none; }

/* ---------- BeamsSection ---------- */
@keyframes wb-beam-sweep {
  from { transform: translateX(-100%); }
  to   { transform: translateX(200%); }
}
.wb-pro-beams { position: relative; overflow: hidden; padding: 5rem 1.5rem; text-align: center; background: #050514; color: #fff; }
.wb-pro-beams::before, .wb-pro-beams::after {
  content: ""; position: absolute; top: 0; bottom: 0; width: 200px;
  background: linear-gradient(115deg, transparent 0%, color-mix(in srgb, var(--color-primary) 60%, transparent) 50%, transparent 100%);
  filter: blur(20px); opacity: 0.6; animation: wb-beam-sweep 6s linear infinite;
}
.wb-pro-beams::after { animation-delay: 3s; background: linear-gradient(115deg, transparent 0%, color-mix(in srgb, var(--color-secondary) 60%, transparent) 50%, transparent 100%); }
.wb-pro-beams h2 { position: relative; font-size: clamp(2rem, 4vw, 3rem); font-weight: 800; }
.wb-pro-beams .wb-pro-sub { position: relative; margin: 0.75rem auto 0; max-width: 32rem; opacity: 0.7; }

/* ---------- MeteorsSection ---------- */
@keyframes wb-meteor {
  0%   { transform: translate(-50px, -50px) rotate(215deg); opacity: 0; }
  10%  { opacity: 1; }
  100% { transform: translate(700px, 700px) rotate(215deg); opacity: 0; }
}
.wb-pro-meteors { position: relative; overflow: hidden; padding: 5rem 1.5rem; text-align: center; background: #0a0a14; color: #fff; }
.wb-pro-meteors .wb-pro-meteor {
  position: absolute; top: 0; left: 0; width: 2px; height: 2px; border-radius: 50%; background: #fff;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.15);
}
.wb-pro-meteors .wb-pro-meteor::before {
  content: ""; position: absolute; top: 0; left: 0; width: 50px; height: 1px;
  background: linear-gradient(90deg, #fff, transparent);
  transform-origin: 0 0;
}
.wb-pro-meteors .wb-pro-meteor:nth-child(1) { left: 10%;  animation: wb-meteor 5s linear infinite; }
.wb-pro-meteors .wb-pro-meteor:nth-child(2) { left: 30%;  animation: wb-meteor 6s linear infinite 1s; }
.wb-pro-meteors .wb-pro-meteor:nth-child(3) { left: 50%;  animation: wb-meteor 4.5s linear infinite 2s; }
.wb-pro-meteors .wb-pro-meteor:nth-child(4) { left: 70%;  animation: wb-meteor 5.5s linear infinite 0.5s; }
.wb-pro-meteors .wb-pro-meteor:nth-child(5) { left: 90%;  animation: wb-meteor 6.5s linear infinite 1.5s; }
.wb-pro-meteors h2 { position: relative; font-size: clamp(2rem, 4vw, 3rem); font-weight: 800; }
.wb-pro-meteors .wb-pro-sub { position: relative; margin: 0.75rem auto 0; max-width: 32rem; opacity: 0.7; }

/* ---------- GradientMeshSection ---------- */
@keyframes wb-mesh-drift {
  0%, 100% { transform: translate(0, 0); }
  33%      { transform: translate(5%, -3%); }
  66%      { transform: translate(-4%, 4%); }
}
.wb-pro-mesh { position: relative; overflow: hidden; padding: 5rem 1.5rem; text-align: center; isolation: isolate; }
.wb-pro-mesh .wb-pro-mesh-blob { position: absolute; width: 400px; height: 400px; border-radius: 50%; filter: blur(80px); opacity: 0.5; z-index: -1; }
.wb-pro-mesh .wb-pro-mesh-blob:nth-child(1) { top: -100px; left: -100px; background: var(--color-primary); animation: wb-mesh-drift 16s ease-in-out infinite; }
.wb-pro-mesh .wb-pro-mesh-blob:nth-child(2) { top: 50%; right: -100px; background: var(--color-secondary); animation: wb-mesh-drift 20s ease-in-out infinite reverse; }
.wb-pro-mesh .wb-pro-mesh-blob:nth-child(3) { bottom: -100px; left: 30%; background: #f59e0b; animation: wb-mesh-drift 18s ease-in-out infinite 2s; }
.wb-pro-mesh h2 { font-size: clamp(2rem, 4vw, 3rem); font-weight: 800; }
.wb-pro-mesh .wb-pro-sub { margin: 0.75rem auto 0; max-width: 32rem; opacity: 0.75; }

/* ---------- WavyDivider ---------- */
@keyframes wb-wave-flow {
  0%   { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
.wb-pro-wave { position: relative; padding: 2rem 0; }
.wb-pro-wave .wb-pro-wave-track { width: 200%; animation: wb-wave-flow 14s linear infinite; }
.wb-pro-wave svg { display: block; width: 100%; height: 60px; }
.wb-pro-wave .wb-pro-wave-label { position: absolute; inset: 0; display: grid; place-items: center; font-size: 0.7rem; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; color: var(--color-primary); }

/* ---------- DotPatternSection ---------- */
.wb-pro-dots { position: relative; padding: 5rem 1.5rem; text-align: center; overflow: hidden; }
.wb-pro-dots::before {
  content: ""; position: absolute; inset: 0;
  background-image: radial-gradient(currentColor 1px, transparent 1px);
  background-size: 22px 22px; opacity: 0.15;
  mask-image: radial-gradient(ellipse at center, #000 30%, transparent 70%);
  -webkit-mask-image: radial-gradient(ellipse at center, #000 30%, transparent 70%);
}
.wb-pro-dots h2 { position: relative; font-size: clamp(2rem, 4vw, 3rem); font-weight: 800; }
.wb-pro-dots .wb-pro-sub { position: relative; margin: 0.75rem auto 0; max-width: 32rem; opacity: 0.75; }

/* ---------- GlowCardGrid ---------- */
@keyframes wb-glow-spin { to { transform: rotate(360deg); } }
.wb-pro-glow-grid { padding: 4rem 1.5rem; }
.wb-pro-glow-grid h2 { font-size: clamp(1.75rem, 3.5vw, 2.5rem); font-weight: 800; text-align: center; margin-bottom: 2.5rem; }
.wb-pro-glow-grid .wb-pro-grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); max-width: 1100px; margin: 0 auto; }
.wb-pro-glow-card { position: relative; padding: 2px; border-radius: 1rem; overflow: hidden; isolation: isolate; }
.wb-pro-glow-card::before {
  content: ""; position: absolute; inset: -50%; z-index: -1;
  background: conic-gradient(from 0deg, transparent 0%, var(--color-primary) 30%, var(--color-secondary) 60%, transparent 80%);
  animation: wb-glow-spin 4s linear infinite;
}
.wb-pro-glow-card .wb-pro-glow-inner { position: relative; padding: 1.5rem; border-radius: calc(1rem - 2px); background: var(--color-bg); color: var(--color-fg); height: 100%; }
.wb-pro-glow-card h3 { font-size: 1rem; font-weight: 700; }
.wb-pro-glow-card p { margin-top: 0.5rem; font-size: 0.875rem; opacity: 0.7; }

/* ---------- TiltCardGrid ---------- */
.wb-pro-tilt-grid { padding: 4rem 1.5rem; }
.wb-pro-tilt-grid h2 { font-size: clamp(1.75rem, 3.5vw, 2.5rem); font-weight: 800; text-align: center; margin-bottom: 2.5rem; }
.wb-pro-tilt-grid .wb-pro-grid { display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); max-width: 1100px; margin: 0 auto; perspective: 1200px; }
.wb-pro-tilt-card {
  padding: 2rem 1.5rem; border-radius: 1rem; border: 1px solid color-mix(in srgb, currentColor 10%, transparent);
  background: color-mix(in srgb, var(--color-fg) 3%, transparent);
  transition: transform 0.4s cubic-bezier(.2,.8,.2,1), box-shadow 0.4s;
}
.wb-pro-tilt-card:hover { transform: rotateX(6deg) rotateY(-8deg) translateZ(20px); box-shadow: 0 30px 60px -20px rgba(0,0,0,0.3); }
.wb-pro-tilt-card h3 { font-size: 1.1rem; font-weight: 700; }
.wb-pro-tilt-card p { margin-top: 0.5rem; font-size: 0.875rem; opacity: 0.7; }

/* ---------- BorderBeamCard ---------- */
@keyframes wb-beam-rotate { to { transform: rotate(360deg); } }
.wb-pro-beam-card { padding: 4rem 1.5rem; display: grid; place-items: center; }
.wb-pro-beam-card .wb-pro-beam-wrap { position: relative; padding: 2px; border-radius: 1.25rem; overflow: hidden; max-width: 380px; width: 100%; isolation: isolate; }
.wb-pro-beam-card .wb-pro-beam-wrap::before {
  content: ""; position: absolute; inset: -100%; z-index: -1;
  background: conic-gradient(transparent 0deg, var(--color-primary) 40deg, transparent 80deg);
  animation: wb-beam-rotate 4s linear infinite;
}
.wb-pro-beam-card .wb-pro-beam-inner { background: var(--color-bg); color: var(--color-fg); padding: 2rem; border-radius: calc(1.25rem - 2px); }
.wb-pro-beam-card .wb-pro-beam-price { font-size: 2.5rem; font-weight: 800; margin-top: 1rem; }
.wb-pro-beam-card .wb-pro-beam-period { font-size: 0.875rem; opacity: 0.6; }
.wb-pro-beam-card ul { margin-top: 1.5rem; padding: 0; list-style: none; }
.wb-pro-beam-card li { padding: 0.4rem 0; font-size: 0.875rem; display: flex; gap: 0.5rem; align-items: center; }
.wb-pro-beam-card li::before { content: "\2713"; color: var(--color-primary); font-weight: 700; }
.wb-pro-beam-card .wb-pro-cta { display: block; margin-top: 1.5rem; padding: 0.75rem 1.25rem; text-align: center; border-radius: var(--radius); background: var(--color-primary); color: #fff; font-weight: 600; text-decoration: none; }

/* ---------- CardStackShowcase ---------- */
.wb-pro-stack { padding: 4rem 1.5rem; text-align: center; }
.wb-pro-stack h2 { font-size: clamp(1.75rem, 3.5vw, 2.5rem); font-weight: 800; margin-bottom: 2.5rem; }
.wb-pro-stack .wb-pro-stack-wrap { position: relative; max-width: 480px; margin: 0 auto; height: 220px; }
.wb-pro-stack .wb-pro-stack-card {
  position: absolute; inset: 0; padding: 1.5rem; border-radius: 1rem; border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  background: var(--color-bg); color: var(--color-fg);
  box-shadow: 0 12px 40px -10px rgba(0,0,0,0.15);
  transition: transform 0.4s ease;
  text-align: left;
}
.wb-pro-stack .wb-pro-stack-card:nth-child(1) { transform: translate(-12px, -12px) rotate(-3deg); opacity: 0.6; }
.wb-pro-stack .wb-pro-stack-card:nth-child(2) { transform: translate(0, 0) rotate(0deg); z-index: 2; }
.wb-pro-stack .wb-pro-stack-card:nth-child(3) { transform: translate(12px, 12px) rotate(3deg); opacity: 0.6; }
.wb-pro-stack .wb-pro-stack-wrap:hover .wb-pro-stack-card:nth-child(1) { transform: translate(-24px, -16px) rotate(-5deg); }
.wb-pro-stack .wb-pro-stack-wrap:hover .wb-pro-stack-card:nth-child(3) { transform: translate(24px, 16px) rotate(5deg); }
.wb-pro-stack .wb-pro-stack-card blockquote { margin: 0; font-size: 0.95rem; line-height: 1.5; font-style: italic; }
.wb-pro-stack .wb-pro-stack-card .wb-pro-stack-meta { margin-top: 0.75rem; font-size: 0.8rem; }
.wb-pro-stack .wb-pro-stack-card .wb-pro-stack-name { font-weight: 600; }
.wb-pro-stack .wb-pro-stack-card .wb-pro-stack-role { opacity: 0.6; }

/* ---------- HoverGlowGrid ---------- */
.wb-pro-hover-grid { padding: 4rem 1.5rem; }
.wb-pro-hover-grid h2 { font-size: clamp(1.75rem, 3.5vw, 2.5rem); font-weight: 800; text-align: center; margin-bottom: 2.5rem; }
.wb-pro-hover-grid .wb-pro-grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); max-width: 1100px; margin: 0 auto; }
.wb-pro-hover-card {
  position: relative; padding: 1.5rem; border-radius: 1rem; overflow: hidden;
  border: 1px solid color-mix(in srgb, currentColor 10%, transparent);
  background: color-mix(in srgb, var(--color-fg) 2%, transparent);
  transition: border-color 0.3s;
}
.wb-pro-hover-card::before {
  content: ""; position: absolute; inset: -1px; border-radius: inherit;
  background: radial-gradient(400px circle at 50% 0%, color-mix(in srgb, var(--color-primary) 25%, transparent), transparent 50%);
  opacity: 0; transition: opacity 0.3s; pointer-events: none;
}
.wb-pro-hover-card:hover { border-color: color-mix(in srgb, var(--color-primary) 40%, transparent); }
.wb-pro-hover-card:hover::before { opacity: 1; }
.wb-pro-hover-card h3 { position: relative; font-size: 1rem; font-weight: 700; }
.wb-pro-hover-card p { position: relative; margin-top: 0.4rem; font-size: 0.875rem; opacity: 0.7; }

/* ---------- AnimatedCounterStats ---------- */
@keyframes wb-counter-up { from { transform: translateY(60%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
.wb-pro-counters { padding: 4rem 1.5rem; text-align: center; }
.wb-pro-counters h2 { font-size: clamp(1.75rem, 3.5vw, 2.5rem); font-weight: 800; margin-bottom: 2.5rem; }
.wb-pro-counters .wb-pro-grid { display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); max-width: 1000px; margin: 0 auto; }
.wb-pro-counter-cell {
  padding: 1.5rem 0.5rem; border-radius: 1rem; background: color-mix(in srgb, var(--color-primary) 8%, transparent);
}
.wb-pro-counter-value {
  font-size: clamp(2rem, 4vw, 3rem); font-weight: 900; line-height: 1; color: var(--color-primary);
  display: inline-block; animation: wb-counter-up 1.2s cubic-bezier(.2,.8,.2,1) both;
}
.wb-pro-counter-label { margin-top: 0.5rem; font-size: 0.7rem; letter-spacing: 0.15em; text-transform: uppercase; opacity: 0.65; }

/* ---------- MovingBorderCTA ---------- */
@keyframes wb-mb-rotate { to { transform: rotate(360deg); } }
.wb-pro-mb-cta { padding: 5rem 1.5rem; text-align: center; }
.wb-pro-mb-cta h2 { font-size: clamp(2rem, 4vw, 3rem); font-weight: 800; }
.wb-pro-mb-cta .wb-pro-sub { margin: 0.75rem auto 2rem; max-width: 32rem; opacity: 0.75; }
.wb-pro-mb-cta .wb-pro-mb-btn { position: relative; display: inline-block; padding: 2px; border-radius: 999px; overflow: hidden; isolation: isolate; text-decoration: none; }
.wb-pro-mb-cta .wb-pro-mb-btn::before {
  content: ""; position: absolute; inset: -100%; z-index: -1;
  background: conic-gradient(from 0deg, var(--color-primary), var(--color-secondary), var(--color-primary));
  animation: wb-mb-rotate 4s linear infinite;
}
.wb-pro-mb-cta .wb-pro-mb-inner { display: inline-block; padding: 0.75rem 1.75rem; border-radius: 999px; background: var(--color-bg); color: var(--color-fg); font-weight: 600; }

/* ---------- InfiniteMarqueeLogos ---------- */
@keyframes wb-marquee-l { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@keyframes wb-marquee-r { from { transform: translateX(-50%); } to { transform: translateX(0); } }
.wb-pro-marquee { padding: 4rem 1.5rem; overflow: hidden; }
.wb-pro-marquee h2 { font-size: 0.8rem; letter-spacing: 0.2em; text-transform: uppercase; text-align: center; opacity: 0.6; margin-bottom: 2rem; font-weight: 600; }
.wb-pro-marquee .wb-pro-marquee-row { display: flex; gap: 3rem; padding: 0.5rem 0; }
.wb-pro-marquee .wb-pro-marquee-row:nth-of-type(1) { animation: wb-marquee-l 30s linear infinite; }
.wb-pro-marquee .wb-pro-marquee-row:nth-of-type(2) { animation: wb-marquee-r 36s linear infinite; }
.wb-pro-marquee .wb-pro-marquee-row span { flex: none; font-size: 1.25rem; font-weight: 700; opacity: 0.5; padding: 0.5rem 1rem; }
.wb-pro-marquee:hover .wb-pro-marquee-row { animation-play-state: paused; }

/* ---------- OrbitFeatures ---------- */
@keyframes wb-orbit-spin { to { transform: rotate(360deg); } }
.wb-pro-orbit { padding: 5rem 1.5rem; text-align: center; }
.wb-pro-orbit h2 { font-size: clamp(1.75rem, 3.5vw, 2.5rem); font-weight: 800; }
.wb-pro-orbit .wb-pro-sub { margin: 0.75rem auto 3rem; max-width: 32rem; opacity: 0.75; }
.wb-pro-orbit .wb-pro-orbit-stage { position: relative; width: 320px; height: 320px; margin: 0 auto; }
.wb-pro-orbit .wb-pro-orbit-center {
  position: absolute; inset: 50% 50% auto auto; transform: translate(50%, -50%);
  width: 96px; height: 96px; display: grid; place-items: center; border-radius: 50%;
  background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
  color: #fff; font-weight: 900; font-size: 1.5rem; box-shadow: 0 20px 40px -12px rgba(0,0,0,0.25);
}
.wb-pro-orbit .wb-pro-orbit-ring {
  position: absolute; inset: 0; border-radius: 50%; border: 1px dashed color-mix(in srgb, currentColor 20%, transparent);
  animation: wb-orbit-spin 24s linear infinite;
}
.wb-pro-orbit .wb-pro-orbit-item {
  position: absolute; left: 50%; top: 0;
  transform: translate(-50%, -50%);
  width: 56px; height: 56px; display: grid; place-items: center; border-radius: 50%;
  background: var(--color-bg); color: var(--color-fg); font-size: 1.25rem;
  border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  box-shadow: 0 8px 20px -6px rgba(0,0,0,0.15);
  animation: wb-orbit-spin 24s linear infinite reverse;
}

/* ---------- Respect reduced motion ---------- */
@media (prefers-reduced-motion: reduce) {
  .wb-pro-aurora::before, .wb-pro-aurora::after,
  .wb-pro-spotlight::before,
  .wb-pro-highlight .wb-pro-mark,
  .wb-pro-lamp::before,
  .wb-pro-typewriter .wb-pro-typed,
  .wb-pro-gtext h1,
  .wb-pro-beams::before, .wb-pro-beams::after,
  .wb-pro-meteors .wb-pro-meteor,
  .wb-pro-mesh .wb-pro-mesh-blob,
  .wb-pro-wave .wb-pro-wave-track,
  .wb-pro-glow-card::before,
  .wb-pro-beam-card .wb-pro-beam-wrap::before,
  .wb-pro-counter-value,
  .wb-pro-mb-cta .wb-pro-mb-btn::before,
  .wb-pro-marquee .wb-pro-marquee-row,
  .wb-pro-orbit .wb-pro-orbit-ring,
  .wb-pro-orbit .wb-pro-orbit-item { animation: none !important; }
}
`
