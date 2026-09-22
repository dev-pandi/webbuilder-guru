"use client";

// HomeGuruDirectory — 6-card preview direktori guru untuk landing page.
// Fetch real data dari `/api/v1/public/guru?sort=X&page_size=6`.
// Tab "Terpopuler" / "Terbaru" trigger re-fetch client-side.
//
// Kenapa client component: sort tabs interaktif tanpa hard-navigate. Kalau
// user mau lihat semua guru, tetap ada link ke /guru (SSR page penuh).

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { PaginatedResult } from "@/components/Pagination";
import type { TeacherDirectoryItem } from "@/lib/api";

type Sort = "popular" | "newest";

const CARD_COUNT = 6;

function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".0", "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(".0", "")}k`;
  return n.toLocaleString("id-ID");
}

export function HomeGuruDirectory() {
  const [sort, setSort] = useState<Sort>("popular");
  const [items, setItems] = useState<TeacherDirectoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    // Public endpoint — no auth. Path pakai `/public/guru` (bukan
    // `/api/v1/public/guru`) karena backend register pubBase = "/public"
    // langsung di root Fiber app, tidak di bawah /api/v1 group.
    api<PaginatedResult<TeacherDirectoryItem>>(
      `/public/guru?sort=${sort}&page_size=${CARD_COUNT}`,
      { auth: false },
    )
      .then((r) => {
        if (!cancelled) setItems(r.items ?? []);
      })
      .catch((e) => {
        if (!cancelled) setErr((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sort]);

  return (
    <>
      {/* Directory head — heading kiri + tools kanan (count + sort control) */}
      <div className="mb-9 flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div className="max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-2.5 text-xs font-extrabold uppercase tracking-[.13em] text-[#285f9e]">
            <span className="h-0.5 w-6 rounded-full bg-current" />
            Komunitas Guru
          </div>
          <h2 className="text-[clamp(2rem,4vw,3.35rem)] font-extrabold leading-tight tracking-tight text-[#172033]">
            Guru yang Sudah Bergabung
          </h2>
          <p className="mt-4 text-base text-[#637083]">
            Temukan website pribadi guru dan lihat bagaimana pengalaman, karya,
            serta pengetahuan mereka dibagikan melalui rumah digital
            masing-masing.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Link
            href="/guru"
            className="whitespace-nowrap text-[.82rem] font-extrabold text-[#285f9e] underline underline-offset-4 hover:text-[#172033]"
          >
            Lihat semua guru →
          </Link>
          <div className="inline-flex gap-1 rounded-[13px] border border-[#e6e9ef] bg-white p-1 shadow-[0_10px_30px_rgba(24,34,53,.06)]">
            <SortTab
              active={sort === "popular"}
              onClick={() => setSort("popular")}
              label="Terpopuler"
            />
            <SortTab
              active={sort === "newest"}
              onClick={() => setSort("newest")}
              label="Terbaru"
            />
          </div>
        </div>
      </div>

      {/* Teacher grid — 3-col responsive */}
      {loading && items.length === 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: CARD_COUNT }).map((_, i) => (
            <div
              key={i}
              className="h-[135px] animate-pulse rounded-[22px] border border-[#e6e9ef] bg-white"
            />
          ))}
        </div>
      ) : err ? (
        <div className="rounded-[22px] border border-[#e6e9ef] bg-white p-8 text-center text-sm text-[#637083]">
          Gagal memuat direktori guru: {err}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[22px] border border-[#e6e9ef] bg-white p-8 text-center text-sm text-[#637083]">
          Belum ada guru yang bergabung. Jadilah yang pertama!
        </div>
      ) : (
        <div className={`grid gap-5 sm:grid-cols-2 lg:grid-cols-3 ${loading ? "opacity-70" : ""}`}>
          {items.map((t) => (
            <TeacherCard key={t.site_id} t={t} />
          ))}
        </div>
      )}
    </>
  );
}

function SortTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "min-h-[38px] rounded-[10px] bg-[#285f9e] px-3.5 text-[.8rem] font-extrabold text-white shadow-[0_8px_18px_rgba(40,95,158,.18)] flex items-center"
          : "min-h-[38px] rounded-[10px] bg-transparent px-3.5 text-[.8rem] font-extrabold text-[#647286] hover:bg-[#f4f7fb] flex items-center"
      }
    >
      {label}
    </button>
  );
}

function TeacherCard({ t }: { t: TeacherDirectoryItem }) {
  const initials = (t.name || t.domain || "?")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
  const domainURL = t.domain ? `https://${t.domain}` : "#";
  return (
    <article className="group grid grid-cols-[94px_1fr] items-center gap-[18px] rounded-[22px] border border-[#e6e9ef] bg-white p-5 shadow-[0_10px_30px_rgba(24,34,53,.06)] transition-all duration-[.22s] hover:-translate-y-1 hover:border-[#d4dce8] hover:shadow-[0_24px_60px_rgba(24,34,53,.10)]">
      <div className="grid aspect-square size-[94px] place-items-center overflow-hidden rounded-[18px] border border-[#1f3656]/8 bg-gradient-to-br from-[#edf4fb] to-[#f9ecee] text-2xl font-black text-[#285f9e]">
        {t.profile_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={t.profile_image}
            alt={`Foto profil ${t.name}`}
            loading="lazy"
            decoding="async"
            className="block size-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <span>{initials || "G"}</span>
        )}
      </div>
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-2">
          <h3 className="m-0 text-[1.03rem] font-extrabold leading-tight tracking-[-.025em] text-[#172033]">
            {t.name || "Guru"}
          </h3>
          {t.is_new && (
            <span className="inline-flex rounded-full bg-[#fff1f2] px-[7px] py-[3px] text-[.58rem] font-black uppercase tracking-[.07em] text-[#d73f45]">
              Baru
            </span>
          )}
        </div>
        <div className="mb-2.5 text-[.75rem] font-bold text-[#748094]">
          {t.subject_or_field || "Guru Indonesia"}
        </div>
        <div className="mb-3 flex min-w-0 items-center gap-[7px] text-[.8rem] font-extrabold text-[#285f9e]">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="size-[15px] shrink-0"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
          </svg>
          <span className="truncate">{t.domain || "—"}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[.72rem] font-bold text-[#748094]">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="size-[13px]"
            >
              <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
              <circle cx="12" cy="12" r="2.5" />
            </svg>
            {fmtViews(t.total_views)} views
          </span>
          <a
            href={domainURL}
            target={t.domain ? "_blank" : undefined}
            rel={t.domain ? "noopener noreferrer" : undefined}
            aria-label={`Kunjungi website ${t.name}`}
            className="inline-flex items-center gap-1 text-[.75rem] font-extrabold text-[#d73f45] transition-transform hover:translate-x-0.5"
          >
            Kunjungi
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="size-[13px]"
            >
              <path d="M7 17 17 7M8 7h9v9" />
            </svg>
          </a>
        </div>
      </div>
    </article>
  );
}
