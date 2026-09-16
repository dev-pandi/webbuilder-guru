"use client";

// Pembelajaran list — mirror mockup dashboard-guru/pembelajaran.html.

import Link from "next/link";
import { useParams } from "next/navigation";
import { BookOpen, Plus } from "lucide-react";

type ChipTone = "green" | "gray";

const MATERIALS: Array<{ title: string; status: string; tone: ChipTone; date: string }> = [
  { title: "Mengenal Teks Cerpen", status: "Published", tone: "green", date: "12 Sep 2026" },
  { title: "Menyusun Teks Eksposisi", status: "Published", tone: "green", date: "8 Sep 2026" },
  { title: "Memahami Teks Deskripsi", status: "Draft", tone: "gray", date: "4 Sep 2026" },
];

function Chip({ tone, children }: { tone: ChipTone; children: React.ReactNode }) {
  const tones: Record<ChipTone, string> = {
    green: "bg-emerald-100 text-emerald-800",
    gray: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export default function PembelajaranListPage() {
  const params = useParams<{ id: string }>();
  const sid = params.id;

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            Materi Pembelajaran
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Kelola bahan pembelajaran yang Anda bagikan.
          </p>
        </div>
        <Link
          href={`/sites/${sid}/pembelajaran/new`}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
        >
          <Plus className="size-4" />
          Tambah Materi
        </Link>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr>
                {["Materi", "Status", "Tanggal", "Aksi"].map((h) => (
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
              {MATERIALS.map((m) => (
                <tr key={m.title} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="grid h-9 w-11 place-items-center rounded-lg bg-gradient-to-br from-slate-200 to-slate-300 text-slate-500">
                        <BookOpen className="size-4" />
                      </div>
                      <span className="text-[13px] font-semibold text-slate-900">{m.title}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <Chip tone={m.tone}>{m.status}</Chip>
                  </td>
                  <td className="px-4 py-3.5 text-[13px] text-slate-600">{m.date}</td>
                  <td className="px-4 py-3.5">
                    <Link
                      href={`/sites/${sid}/pembelajaran/new`}
                      className="rounded-lg bg-blue-50 px-3 py-1.5 text-[12px] font-bold text-blue-700 hover:bg-blue-100"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
