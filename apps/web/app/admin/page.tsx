"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtBytes } from "@/lib/format";

type Stats = {
  user_count: number;
  admin_count: number;
  site_count: number;
  published_sites: number;
  page_count: number;
  domain_count: number;
  verified_domains: number;
  asset_count: number;
  total_storage_bytes: number;
};

export default function AdminOverviewPage() {
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Stats>("/api/v1/admin/stats").then(setS).catch((e) => setErr((e as Error).message));
  }, []);

  if (err) return <p className="text-sm text-red-600">{err}</p>;
  if (!s) return <p className="text-sm text-slate-500">Memuat statistik…</p>;

  const cards = [
    { label: "User Terdaftar", value: s.user_count, hint: `${s.admin_count} admin` },
    { label: "Situs", value: s.site_count, hint: `${s.published_sites} published` },
    { label: "Halaman", value: s.page_count, hint: "total seluruh situs" },
    { label: "Domain", value: s.domain_count, hint: `${s.verified_domains} verified` },
    { label: "Aset", value: s.asset_count, hint: "file diupload" },
    { label: "Storage", value: fmtBytes(s.total_storage_bytes), hint: "total dipakai" },
  ];

  return (
    <div>
      <header>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-sm text-slate-600">Statistik platform secara keseluruhan.</p>
      </header>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-slate-500">{c.label}</div>
            <div className="mt-2 text-3xl font-bold tabular-nums">{c.value}</div>
            <div className="mt-1 text-xs text-slate-500">{c.hint}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
