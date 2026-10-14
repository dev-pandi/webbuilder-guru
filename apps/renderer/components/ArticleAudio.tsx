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

  return (
    <div className="my-6 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      {state === "idle" && (
        <button
          type="button"
          onClick={play}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <PlayIcon />
          Dengarkan artikel
        </button>
      )}
      {state === "loading" && (
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white opacity-70"
        >
          <SpinnerIcon />
          Memuat…
        </button>
      )}
      {state === "playing" && (
        <>
          <button
            type="button"
            onClick={pause}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <PauseIcon />
            Jeda
          </button>
          <button
            type="button"
            onClick={stop}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            <StopIcon />
            Hentikan
          </button>
          <span className="text-xs text-slate-500">Memutar…</span>
        </>
      )}
      {state === "paused" && (
        <>
          <button
            type="button"
            onClick={resume}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <PlayIcon />
            Lanjut
          </button>
          <button
            type="button"
            onClick={stop}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            <StopIcon />
            Hentikan
          </button>
          <span className="text-xs text-slate-500">Dijeda</span>
        </>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-slate-600">
        <label className="flex items-center gap-1.5">
          <span>Kecepatan</span>
          <select
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            disabled={state !== "idle"}
            className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs"
          >
            <option value={0.75}>0.75×</option>
            <option value={1.0}>1×</option>
            <option value={1.25}>1.25×</option>
            <option value={1.5}>1.5×</option>
          </select>
        </label>
        {voices.length > 1 && (
          <label className="flex items-center gap-1.5">
            <span>Suara</span>
            <select
              value={voiceURI}
              onChange={(e) => setVoiceURI(e.target.value)}
              disabled={state !== "idle"}
              className="max-w-[180px] rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs"
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
