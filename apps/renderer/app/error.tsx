"use client";

// error.tsx — Next.js App Router error boundary untuk semua route di
// bawah `app/`. Dipicu saat Server Component throw — terutama dari
// `fetchJsonOrThrow` yang distinguish 5xx/network/timeout dari 404.
//
// Kenapa file ini perlu: tanpa error.tsx, throw di server component akan
// bubble ke global-error default Next.js yang tampilkan "An unexpected
// error has occurred" tanpa konteks apapun. Dengan file ini, user yang
// buka situs saat backend lagi slow/down tetap lihat pesan jelas +
// tombol coba lagi.

import { useEffect } from "react";

export default function RendererError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server component errors kadang sampai sini juga dengan digest ID
    // yang bisa di-cross-reference di log Next.js. Catat ke console untuk
    // debug (prod log aggregator biasa pick up juga).
    console.error("renderer error boundary", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-8 text-center">
      <div className="max-w-md space-y-4">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-3xl">
          ⚠️
        </div>
        <h1 className="text-2xl font-bold text-slate-900">
          Sedang ada gangguan sementara
        </h1>
        <p className="text-sm text-slate-600">
          Server situs tidak merespons tepat waktu. Ini bukan masalah dari
          Anda — biasanya pulih dalam beberapa detik. Silakan coba lagi.
        </p>
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={reset}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Coba lagi
          </button>
          <a
            href="/"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Ke beranda
          </a>
        </div>
        {error.digest && (
          <p className="pt-2 text-xs text-slate-400">
            Kode referensi: <code className="rounded bg-slate-100 px-1.5 py-0.5">{error.digest}</code>
          </p>
        )}
      </div>
    </main>
  );
}
