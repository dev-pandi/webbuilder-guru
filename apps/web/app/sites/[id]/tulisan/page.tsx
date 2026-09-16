"use client";

// Tulisan list — mirror mockup dashboard-guru/tulisan.html.
// Filter by rubrik + search live pakai state lokal (data mockup).

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { FileText, Plus, Search } from "lucide-react";

type ChipTone = "green" | "gray" | "amber";

const RUBRICS = ["Semua", "Ceritaku", "Bacaanku", "Inspirasiku", "Bangsaku", "Peradaban"] as const;

const ROWS: Array<{
  title: string;
  slug: string;
  rubrik: string;
  status: string;
  tone: ChipTone;
  views: string;
  tanggapan: string;
  updated: string;
}> = [
  { title: "Hati-hati dengan Spasi", slug: "hati-hati-dengan-spasi", rubrik: "Ceritaku", status: "Published", tone: "green", views: "1.248", tanggapan: "18", updated: "15 Sep 2026" },
  { title: "Ketika Buku Mengubah Cara Pandang", slug: "ketika-buku-mengubah-cara-pandang", rubrik: "Bacaanku", status: "Published", tone: "green", views: "972", tanggapan: "12", updated: "14 Sep 2026" },
  { title: "Kelas yang Hidup dengan Pertanyaan", slug: "kelas-yang-hidup", rubrik: "Inspirasiku", status: "Draft", tone: "gray", views: "0", tanggapan: "0", updated: "13 Sep 2026" },
  { title: "Bahasa, Jembatan yang Menyatukan", slug: "bahasa-jembatan-yang-menyatukan", rubrik: "Bangsaku", status: "Published", tone: "green", views: "1.084", tanggapan: "16", updated: "12 Sep 2026" },
  { title: "Jejak Kearifan Lokal di Sekitar Kita", slug: "jejak-kearifan-lokal", rubrik: "Peradaban", status: "Review", tone: "amber", views: "320", tanggapan: "3", updated: "10 Sep 2026" },
];

function Chip({ tone, children }: { tone: ChipTone; children: React.ReactNode }) {
  const tones: Record<ChipTone, string> = {
    green: "bg-emerald-100 text-emerald-800",
    gray: "bg-slate-100 text-slate-600",
    amber: "bg-amber-100 text-amber-800",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export default function TulisanListPage() {
  const params = useParams<{ id: string }>();
  const sid = params.id;
  const [query, setQuery] = useState("");
  const [rubrik, setRubrik] = useState<(typeof RUBRICS)[number]>("Semua");

  const filtered = useMemo(() => {
    return ROWS.filter((r) => {
      if (rubrik !== "Semua" && r.rubrik !== rubrik) return false;
      if (query && !r.title.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [query, rubrik]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            Kelola Tulisan
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Kelola artikel dari lima rubrik utama Website Pribadi Guru.
          </p>
        </div>
        <Link
          href={`/sites/${sid}/tulisan/new`}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
        >
          <Plus className="size-4" />
          Tulis Artikel Baru
        </Link>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1 lg:min-w-[280px]">
              <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari judul tulisan..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3.5 text-sm outline-none focus:border-blue-400 focus:bg-white"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {RUBRICS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRubrik(r)}
                  className={`rounded-full border px-3.5 py-2 text-[12px] font-bold transition ${
                    rubrik === r
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr>
                {["Judul", "Rubrik", "Status", "Views", "Tanggapan", "Diperbarui", "Aksi"].map((h) => (
                  <th
                    key={h}
                    className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.slug} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="grid h-9 w-11 place-items-center rounded-lg bg-gradient-to-br from-slate-200 to-slate-300 text-slate-500">
                        <FileText className="size-4" />
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold text-slate-900">{row.title}</div>
                        <div className="text-[11px] text-slate-500">{row.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-[13px] text-slate-600">{row.rubrik}</td>
                  <td className="px-4 py-3.5">
                    <Chip tone={row.tone}>{row.status}</Chip>
                  </td>
                  <td className="px-4 py-3.5 text-[13px] text-slate-700">{row.views}</td>
                  <td className="px-4 py-3.5 text-[13px] text-slate-700">{row.tanggapan}</td>
                  <td className="px-4 py-3.5 text-[13px] text-slate-600">{row.updated}</td>
                  <td className="px-4 py-3.5">
                    <Link
                      href={`/sites/${sid}/tulisan/new`}
                      className="rounded-lg bg-blue-50 px-3 py-1.5 text-[12px] font-bold text-blue-700 hover:bg-blue-100"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">
                    Tidak ada tulisan yang cocok
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
