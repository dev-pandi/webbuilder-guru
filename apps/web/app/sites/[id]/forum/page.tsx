"use client";

// Forum list — mirror mockup dashboard-guru/forum.html.

import Link from "next/link";
import { useParams } from "next/navigation";
import { MessagesSquare, Plus } from "lucide-react";

type ChipTone = "green" | "gray";

const TOPICS: Array<{ title: string; status: string; tone: ChipTone; views: string; tanggapan: string; last: string }> = [
  { title: "Apakah AI membantu siswa belajar menulis?", status: "Published", tone: "green", views: "862", tanggapan: "27", last: "2 jam lalu" },
  { title: "Membaca novel di kelas: efektif atau tidak?", status: "Published", tone: "green", views: "521", tanggapan: "14", last: "1 hari lalu" },
  { title: "Bahasa gaul dalam tugas sekolah", status: "Draft", tone: "gray", views: "0", tanggapan: "0", last: "3 hari lalu" },
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

export default function ForumListPage() {
  const params = useParams<{ id: string }>();
  const sid = params.id;

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            Forum Diskusi
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Kelola topik diskusi. Tanggapan selalu aktif dan tetap melalui moderasi guru.
          </p>
        </div>
        <Link
          href={`/sites/${sid}/forum/new`}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
        >
          <Plus className="size-4" />
          Buat Topik Baru
        </Link>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr>
                {["Topik", "Status", "Views", "Tanggapan", "Terakhir Aktif", "Aksi"].map((h) => (
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
              {TOPICS.map((t) => (
                <tr key={t.title} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="grid h-9 w-11 place-items-center rounded-lg bg-gradient-to-br from-slate-200 to-slate-300 text-slate-500">
                        <MessagesSquare className="size-4" />
                      </div>
                      <span className="text-[13px] font-semibold text-slate-900">{t.title}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <Chip tone={t.tone}>{t.status}</Chip>
                  </td>
                  <td className="px-4 py-3.5 text-[13px] text-slate-700">{t.views}</td>
                  <td className="px-4 py-3.5 text-[13px] text-slate-700">{t.tanggapan}</td>
                  <td className="px-4 py-3.5 text-[13px] text-slate-600">{t.last}</td>
                  <td className="px-4 py-3.5">
                    <Link
                      href={`/sites/${sid}/forum/new`}
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
