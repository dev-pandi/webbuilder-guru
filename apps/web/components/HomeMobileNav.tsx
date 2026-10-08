"use client";

// HomeMobileNav — dropdown nav sederhana untuk header marketing landing.
// Visible di mobile (<lg), tampil sebagai kartu solid di kanan atas
// (bukan drawer full-height). Tap link → auto-close.
//
// PENTING — pakai Portal ke document.body:
// Header pakai `backdrop-blur-xl` (backdrop-filter). Spec CSS: backdrop-filter
// bikin containing block baru → `position: fixed` di child-nya di-scope ke
// header, bukan viewport. Portal ke body escape ancestor containing block.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Menu, X } from "lucide-react";

type NavLink = { href: string; label: string };

const LINKS: NavLink[] = [
  { href: "#tentang", label: "Tentang" },
  { href: "#manfaat", label: "Manfaat" },
  { href: "#isi-website", label: "Isi Website" },
  { href: "#mulai", label: "Cara Memulai" },
  { href: "/artikel", label: "Indonesia Hebat!" },
  { href: "/panduan-guru", label: "Dokumentasi" },
];

export function HomeMobileNav() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Tutup menu" : "Buka menu"}
        aria-expanded={open}
        className="grid h-10 w-10 place-items-center rounded-lg bg-white/10 text-white transition hover:bg-white/15 lg:hidden"
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>

      {mounted && open &&
        createPortal(
          <div className="lg:hidden">
            {/* Backdrop transparan untuk click-outside close */}
            <button
              type="button"
              aria-label="Tutup menu"
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[60] cursor-default"
            />
            {/* Dropdown card — solid dark navy, mengambang di kanan atas */}
            <div
              role="menu"
              aria-orientation="vertical"
              className="fixed right-4 top-[72px] z-[70] w-56 overflow-hidden rounded-2xl border border-white/10 shadow-[0_20px_60px_rgba(2,8,23,0.55)]"
              style={{ backgroundColor: "#081124" }}
            >
              <nav className="grid gap-0.5 p-2">
                {LINKS.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-3.5 py-2.5 text-[14px] font-bold text-white/85 transition hover:bg-white/10 hover:text-white"
                  >
                    {l.label}
                  </Link>
                ))}
              </nav>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
