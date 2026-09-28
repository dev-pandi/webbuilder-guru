"use client";

// PanduanLightbox — 2 fungsi:
//   1. Onload marker — tambah `data-loaded` di img saat image selesai load,
//      supaya CSS shimmer placeholder berhenti dan background hilang
//   2. Click-to-zoom — klik image di panduan → modal fullscreen dengan
//      image full res + esc/click backdrop to close. Membantu guru lihat
//      detail screenshot yang kecil di layout terbatas.
//
// Attach via querySelectorAll `[data-panduan-img]` — hook yang di-emit
// marked image renderer di page.tsx.

import { useEffect, useState } from "react";
import { X } from "lucide-react";

export function PanduanLightbox() {
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  const [zoomAlt, setZoomAlt] = useState<string>("");

  useEffect(() => {
    // Setup: mark loaded + click handler untuk semua image panduan.
    const imgs = document.querySelectorAll<HTMLImageElement>("img[data-panduan-img]");
    const handlers: Array<() => void> = [];

    imgs.forEach((img) => {
      // Mark data-loaded kalau image sudah cached (misal navigate back).
      if (img.complete && img.naturalWidth > 0) {
        img.setAttribute("data-loaded", "1");
      } else {
        const onLoad = () => img.setAttribute("data-loaded", "1");
        img.addEventListener("load", onLoad, { once: true });
        handlers.push(() => img.removeEventListener("load", onLoad));
      }
      const onClick = (e: MouseEvent) => {
        e.preventDefault();
        setZoomSrc(img.src);
        setZoomAlt(img.alt);
      };
      img.addEventListener("click", onClick);
      handlers.push(() => img.removeEventListener("click", onClick));
    });

    // Escape untuk close modal.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomSrc(null);
    };
    document.addEventListener("keydown", onKey);
    handlers.push(() => document.removeEventListener("keydown", onKey));

    return () => handlers.forEach((h) => h());
  }, []);

  if (!zoomSrc) return null;

  return (
    <div
      role="dialog"
      aria-label={`Preview: ${zoomAlt}`}
      onClick={() => setZoomSrc(null)}
      className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      style={{ animation: "panduan-fade-in .15s ease-out" }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setZoomSrc(null);
        }}
        aria-label="Tutup"
        className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        <X className="size-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={zoomSrc}
        alt={zoomAlt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] max-w-[95vw] rounded-lg object-contain shadow-2xl"
        style={{ cursor: "default" }}
      />
      {zoomAlt && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 max-w-[80vw] -translate-x-1/2 rounded-lg bg-black/60 px-4 py-2 text-center text-sm text-white">
          {zoomAlt}
        </div>
      )}
      <style
        dangerouslySetInnerHTML={{
          __html: `
@keyframes panduan-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
        `,
        }}
      />
    </div>
  );
}
