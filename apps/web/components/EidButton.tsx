"use client";

// EidButton — "Masuk dengan e.id". Sama seperti GoogleButton: redirect ke
// endpoint authorize di API, seluruh pertukaran OAuth terjadi di server.
// Tombol menyembunyikan diri kalau server belum dikonfigurasi (client ID/
// secret e.id kosong), jadi aman di-deploy sebelum kredensial didapat.

import { useEffect, useState } from "react";
import { api, API_BASE } from "@/lib/api";

export function EidButton({
  next,
  label = "Masuk dengan e.id",
  className = "",
}: {
  next?: string;
  label?: string;
  className?: string;
}) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<{ eid: boolean }>("/api/v1/auth/providers", { auth: false })
      .then((p) => !cancelled && setEnabled(p.eid))
      .catch(() => {
        // Gagal cek = sembunyikan; tombol yang pasti error lebih buruk.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!enabled) return null;

  function onClick() {
    const url = new URL("/api/v1/auth/eid/authorize", API_BASE);
    if (next) url.searchParams.set("next", next);
    window.location.href = url.toString();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex h-10 w-full items-center justify-center gap-3 rounded-lg border bg-background px-4 text-sm font-medium shadow-sm transition-colors hover:bg-muted " +
        className
      }
    >
      <EidMark />
      {label}
    </button>
  );
}

// Penanda teks netral — ganti dengan logo resmi e.id begitu pedoman
// branding-nya tersedia.
function EidMark() {
  return (
    <span
      aria-hidden
      className="inline-flex h-[18px] items-center rounded bg-slate-900 px-1 text-[10px] font-bold leading-none tracking-tight text-white"
    >
      e.id
    </span>
  );
}
