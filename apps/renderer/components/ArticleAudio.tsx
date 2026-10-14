"use client";

// ArticleAudio — Web Speech API wrapper untuk artikel + materi pembelajaran.
// Zero cost, zero backend — pakai `window.speechSynthesis` yang built-in di
// browser modern. Target: Chrome/Edge Android (voice id-ID Standard A/B
// bawaan), Safari iOS/Mac (voice Damayanti), Firefox desktop (fallback
// generik; kualitas kurang tapi tetap dengar).
//
// Kenapa baca text dari DOM, bukan dari prop:
//   - Markdown sudah di-parse jadi HTML di server component (via marked.parse)
//     dan dirender via dangerouslySetInnerHTML. Kalau prop body_md dikirim
//     ulang ke client component, bundle size naik + redundant parsing.
//   - Dengan `document.querySelector(selector).textContent`, kita dapat
//     plain text yang sudah di-render — otomatis handle semua block
//     (heading, blockquote, list, dsb.) tanpa parser markdown di client.

import { useEffect, useMemo, useRef, useState } from "react";

// Inline SVG icons — renderer tidak depend ke lucide-react (bundle lebih kecil
// untuk SSR tenant). Ukuran default 16px (size-4 Tailwind equivalent).
function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4">
      <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
    </svg>
  );
}
function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4">
      <path d="M6 6h12v12H6z" />
    </svg>
  );
}
function SpinnerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 animate-spin">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}
function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-3.5 w-3.5">
      <path d="M3 10v4a1 1 0 0 0 1 1h3l4 4V5L7 9H4a1 1 0 0 0-1 1zm13.5 2a4.5 4.5 0 0 0-2-3.74v7.48a4.5 4.5 0 0 0 2-3.74zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06A9.01 9.01 0 0 0 21 12a9.01 9.01 0 0 0-7-8.77z" />
    </svg>
  );
}

type State = "idle" | "loading" | "playing" | "paused";

// Chunk text ke potongan ~200 char per kalimat — Chrome punya bug kalau
// utterance panjang (> ~15s audio) kadang stop di tengah. Queue banyak
// utterance pendek lebih reliable.
function chunkText(text: string, maxLen = 200): string[] {
  const sentences = text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const s of sentences) {
    const sTrim = s.trim();
    if (!sTrim) continue;
    if ((current + " " + sTrim).length > maxLen) {
      if (current) chunks.push(current);
      current = sTrim;
    } else {
      current = current ? current + " " + sTrim : sTrim;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function ArticleAudio({
  selector = ".guru-article-detail__body",
  title,
}: {
  // CSS selector untuk element yang berisi body artikel (plain text diambil
  // via `.textContent`). Default cocok dengan guru article detail page.
  selector?: string;
  // Judul artikel — di-prepend ke audio supaya listener dapat context.
  title?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<State>("idle");
  const [rate, setRate] = useState(1.0);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState<string>("");
  // chunksRef — reference ke chunk list sekarang supaya onend handler bisa
  // nge-check "ini chunk terakhir?" tanpa re-render dependency closure.
  const chunksRef = useRef<SpeechSynthesisUtterance[]>([]);

  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;
    if (!("speechSynthesis" in window)) {
      setSupported(false);
      return;
    }
    setSupported(true);

    function loadVoices() {
      const all = window.speechSynthesis.getVoices();
      // Prefer id-ID voices. Beberapa browser juga punya ms-MY yang mirip
      // (bahasa Melayu Malaysia) — fallback kalau tidak ada id-ID.
      const idVoices = all.filter(
        (v) => v.lang.startsWith("id") || v.lang.startsWith("ms"),
      );
      setVoices(idVoices.length > 0 ? idVoices : all);
      if (!voiceURI && idVoices.length > 0) {
        setVoiceURI(idVoices[0].voiceURI);
      }
    }
    loadVoices();
    // Chrome fires `voiceschanged` setelah daftar voice siap (biasanya
    // beberapa ratus ms setelah pageload).
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      // Cleanup saat unmount — stop audio.
      window.speechSynthesis.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedVoice = useMemo(
    () => voices.find((v) => v.voiceURI === voiceURI) ?? null,
    [voices, voiceURI],
  );

  function extractText(): string {
    const el = document.querySelector(selector);
    if (!el) return "";
    // normalize whitespace, drop extra line breaks.
    const raw = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    return title ? `${title}. ${raw}` : raw;
  }

  function play() {
    const synth = window.speechSynthesis;
    const text = extractText();
    if (!text) return;

    setState("loading");
    synth.cancel();

    const chunks = chunkText(text).map((c) => {
      const u = new SpeechSynthesisUtterance(c);
      u.rate = rate;
      u.lang = "id-ID";
      if (selectedVoice) u.voice = selectedVoice;
      return u;
    });
    chunksRef.current = chunks;

    chunks.forEach((u, i) => {
      u.onstart = () => {
        if (i === 0) setState("playing");
      };
      u.onend = () => {
        // Chunk terakhir → kembali idle.
        if (i === chunks.length - 1) {
          setState("idle");
        }
      };
      u.onerror = (e) => {
        // "canceled" bukan error sebenarnya — triggered pas user klik Stop.
        if (e.error !== "canceled" && e.error !== "interrupted") {
          console.error("TTS error", e.error);
        }
        if (i === chunks.length - 1) {
          setState("idle");
        }
      };
      synth.speak(u);
    });
  }

  function pause() {
    window.speechSynthesis.pause();
    setState("paused");
  }

  function resume() {
    window.speechSynthesis.resume();
    setState("playing");
  }

  function stop() {
    window.speechSynthesis.cancel();
    chunksRef.current = [];
    setState("idle");
  }

  // Server-render: hidden sampai mounted (cegah hydration mismatch).
  // Setelah mount: kalau browser tidak support, hidden total.
  if (!mounted || !supported) return null;

  const isActive = state === "playing" || state === "paused";
  // Main button handler — toggle play/pause/resume.
  const mainAction =
    state === "idle" || state === "loading"
      ? play
      : state === "playing"
        ? pause
        : resume;

  return (
    <div className="guru-audio-player my-7">
      <AudioPlayerStyles />
      {/* Decorative gradient background strip supaya ter-highlight visually
          dibanding body text. Pakai var guru-* biar ikut theme user. */}
      <div className="guru-audio-player__card">
        {/* LEFT: Big circular play/pause button */}
        <button
          type="button"
          onClick={mainAction}
          disabled={state === "loading"}
          aria-label={
            state === "playing"
              ? "Jeda"
              : state === "paused"
                ? "Lanjut"
                : "Dengarkan artikel"
          }
          className="guru-audio-player__play"
        >
          {state === "loading" ? (
            <SpinnerIcon />
          ) : state === "playing" ? (
            <PauseIcon />
          ) : (
            <PlayIcon />
          )}
        </button>

        {/* MIDDLE: Title + animated audio bars when playing */}
        <div className="guru-audio-player__center">
          <div className="guru-audio-player__title">
            {state === "idle" || state === "loading"
              ? "Dengarkan artikel"
              : state === "playing"
                ? "Sedang memutar"
                : "Dijeda"}
          </div>
          <div className="guru-audio-player__sub">
            {isActive ? (
              <span className={`guru-audio-bars guru-audio-bars--${state}`}>
                <span />
                <span />
                <span />
                <span />
                <span />
              </span>
            ) : (
              <span>Teks dibacakan oleh suara {selectedVoice?.name || "default"}</span>
            )}
          </div>
        </div>

        {/* RIGHT: Stop button (saat active) */}
        {isActive && (
          <button
            type="button"
            onClick={stop}
            aria-label="Hentikan"
            className="guru-audio-player__stop"
          >
            <StopIcon />
          </button>
        )}
      </div>

      {/* Controls row — speed segmented pills + voice chip */}
      <div className="guru-audio-player__controls">
        <div className="guru-audio-player__rate" role="group" aria-label="Kecepatan">
          <span className="guru-audio-player__label">Kecepatan</span>
          {[0.75, 1.0, 1.25, 1.5].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRate(r)}
              disabled={state !== "idle"}
              className={`guru-audio-player__rate-pill${rate === r ? " is-active" : ""}`}
            >
              {r}×
            </button>
          ))}
        </div>

        {voices.length > 1 && (
          <label className="guru-audio-player__voice">
            <SpeakerIcon />
            <select
              value={voiceURI}
              onChange={(e) => setVoiceURI(e.target.value)}
              disabled={state !== "idle"}
              aria-label="Pilih suara"
            >
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}

// AudioPlayerStyles — scoped CSS inject sekali per instance. Pakai var
// guru-* (dari GuruStyles yang sudah mount di parent page) biar warna ikut
// theme user. Fallback hex kalau GuruStyles tidak ada (misal site non-guru).
function AudioPlayerStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
.guru-audio-player{font-family:var(--font-body,Inter),system-ui,sans-serif}
.guru-audio-player__card{
  display:flex;align-items:center;gap:16px;
  padding:14px 18px;
  background:linear-gradient(135deg,
    color-mix(in srgb, var(--guru-navy, #14233b) 6%, var(--guru-cream, #fbf8f1)),
    color-mix(in srgb, var(--guru-red, #b6423d) 4%, var(--guru-cream, #fbf8f1))
  );
  border:1px solid var(--guru-line, #e9e5dc);
  border-radius:999px;
  box-shadow:0 2px 10px color-mix(in srgb, var(--guru-navy, #14233b) 8%, transparent);
}
.guru-audio-player__play{
  flex-shrink:0;width:52px;height:52px;border-radius:50%;
  border:0;cursor:pointer;
  background:var(--guru-navy, #14233b);color:#fff;
  display:grid;place-items:center;
  box-shadow:0 6px 18px color-mix(in srgb, var(--guru-navy, #14233b) 30%, transparent);
  transition:transform .15s ease,box-shadow .15s ease;
}
.guru-audio-player__play:hover:not(:disabled){
  transform:scale(1.05);
  box-shadow:0 8px 22px color-mix(in srgb, var(--guru-navy, #14233b) 40%, transparent);
}
.guru-audio-player__play:disabled{opacity:.6;cursor:wait}
.guru-audio-player__play svg{width:20px;height:20px}
.guru-audio-player__center{flex:1;min-width:0}
.guru-audio-player__title{
  font-family:var(--font-heading,Georgia),serif;
  font-size:15px;font-weight:700;color:var(--guru-navy, #14233b);
  line-height:1.2;letter-spacing:-.01em;
}
.guru-audio-player__sub{
  margin-top:3px;font-size:12px;color:var(--guru-muted, #6f7888);
  min-height:18px;display:flex;align-items:center;
}
.guru-audio-player__stop{
  flex-shrink:0;width:40px;height:40px;border-radius:50%;
  border:1px solid var(--guru-line, #e9e5dc);cursor:pointer;
  background:#fff;color:var(--guru-navy, #14233b);
  display:grid;place-items:center;
  transition:background .15s ease,color .15s ease;
}
.guru-audio-player__stop:hover{
  background:var(--guru-red, #b6423d);color:#fff;border-color:var(--guru-red, #b6423d);
}
.guru-audio-player__stop svg{width:14px;height:14px}

/* Audio bars — 5 batang vertikal yang animate up/down saat playing. */
.guru-audio-bars{display:inline-flex;align-items:flex-end;gap:3px;height:16px}
.guru-audio-bars span{
  width:3px;height:30%;border-radius:2px;
  background:var(--guru-navy, #14233b);
  display:inline-block;
}
.guru-audio-bars--playing span{animation:guru-audio-bar 1s ease-in-out infinite}
.guru-audio-bars--playing span:nth-child(1){animation-delay:-.9s}
.guru-audio-bars--playing span:nth-child(2){animation-delay:-.7s}
.guru-audio-bars--playing span:nth-child(3){animation-delay:-.5s}
.guru-audio-bars--playing span:nth-child(4){animation-delay:-.3s}
.guru-audio-bars--playing span:nth-child(5){animation-delay:-.1s}
.guru-audio-bars--paused span{opacity:.4}
@keyframes guru-audio-bar{
  0%,100%{height:30%}
  50%{height:100%}
}

/* Controls row — speed pills + voice select. */
.guru-audio-player__controls{
  display:flex;align-items:center;gap:14px;flex-wrap:wrap;
  margin-top:10px;padding:0 6px;
  font-size:12px;color:var(--guru-muted, #6f7888);
}
.guru-audio-player__label{font-weight:600;margin-right:4px}
.guru-audio-player__rate{display:inline-flex;align-items:center;gap:4px}
.guru-audio-player__rate-pill{
  min-width:38px;padding:4px 8px;border-radius:999px;
  border:1px solid transparent;background:transparent;
  font-size:12px;font-weight:600;cursor:pointer;
  color:var(--guru-muted, #6f7888);
  transition:background .15s ease,color .15s ease;
}
.guru-audio-player__rate-pill:hover:not(:disabled){
  background:color-mix(in srgb, var(--guru-navy, #14233b) 6%, transparent);
}
.guru-audio-player__rate-pill.is-active{
  background:var(--guru-navy, #14233b);color:#fff;
}
.guru-audio-player__rate-pill:disabled{opacity:.5;cursor:not-allowed}
.guru-audio-player__voice{
  display:inline-flex;align-items:center;gap:6px;
  padding:4px 10px;border-radius:999px;
  background:#fff;border:1px solid var(--guru-line, #e9e5dc);
  color:var(--guru-navy, #14233b);
}
.guru-audio-player__voice select{
  border:0;background:transparent;outline:0;
  font-size:12px;font-weight:600;color:inherit;
  max-width:160px;cursor:pointer;
}
.guru-audio-player__voice select:disabled{cursor:not-allowed}

/* Mobile — stack vertikal + round pill → rounded rect. */
@media (max-width:640px){
  .guru-audio-player__card{border-radius:18px;padding:12px 14px;gap:12px}
  .guru-audio-player__play{width:46px;height:46px}
  .guru-audio-player__play svg{width:18px;height:18px}
  .guru-audio-player__title{font-size:14px}
  .guru-audio-player__controls{padding:0}
}
`,
      }}
    />
  );
}
