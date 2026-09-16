"use client";

// Pembelajaran list — mirror mockup dashboard-guru/pembelajaran.html.
// Wired ke /api/v1/sites/:id/learning-materials.

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { api, type LearningMaterial } from "@/lib/api";
import type { PaginatedResult } from "@/components/Pagination";

type ChipTone = "green" | "gray";

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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function PembelajaranListPage() {
  const params = useParams<{ id: string }>();
  const sid = params.id;
  const [items, setItems] = useState<LearningMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const r = await api<PaginatedResult<LearningMaterial>>(
        `/api/v1/sites/${sid}/learning-materials?sort=newest&page_size=50`,
      );
      setItems(r.items);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid]);

  async function remove(m: LearningMaterial) {
    if (!confirm(`Hapus materi "${m.title}"?`)) return;
    setBusyId(m.id);
    try {
      await api(`/api/v1/learning-materials/${m.id}`, { method: "DELETE" });
      toast.success("Materi dihapus");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

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
        <div className={`overflow-x-auto ${loading ? "opacity-60" : ""}`}>
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
              {items.map((m) => (
                <tr key={m.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="grid h-9 w-11 place-items-center rounded-lg bg-gradient-to-br from-slate-200 to-slate-300 text-slate-500">
                        <BookOpen className="size-4" />
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold text-slate-900">{m.title}</div>
                        <div className="text-[11px] text-slate-500">{m.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <Chip tone={m.status === "published" ? "green" : "gray"}>
                      {m.status === "published" ? "Published" : "Draft"}
                    </Chip>
                  </td>
                  <td className="px-4 py-3.5 text-[13px] text-slate-600">{fmtDate(m.updated_at)}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/sites/${sid}/pembelajaran/${m.id}/edit`}
                        className="rounded-lg bg-blue-50 px-3 py-1.5 text-[12px] font-bold text-blue-700 hover:bg-blue-100"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => remove(m)}
                        disabled={busyId === m.id}
                        className="rounded-lg bg-rose-50 px-3 py-1.5 text-[12px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                      >
                        {busyId === m.id ? "…" : "Hapus"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-sm text-slate-500">
                    Belum ada materi. Klik &quot;Tambah Materi&quot; untuk mulai.
                  </td>
                </tr>
              )}
              {loading && items.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-500">
                    <Loader2 className="mx-auto size-4 animate-spin" />
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
