"use client";

// Forum list — mirror mockup dashboard-guru/forum.html. Filter Article
// dengan rubric=forum-diskusi. Tanggapan selalu aktif untuk rubrik ini.

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, MessagesSquare, Plus } from "lucide-react";
import { toast } from "sonner";
import { api, type Article } from "@/lib/api";
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
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "baru saja";
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.round(hr / 24);
  return `${day} hari lalu`;
}

export default function ForumListPage() {
  const params = useParams<{ id: string }>();
  const sid = params.id;
  const [items, setItems] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const r = await api<PaginatedResult<Article>>(
        `/api/v1/sites/${sid}/articles?rubric=forum-diskusi&sort=newest&page_size=50`,
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

  async function remove(a: Article) {
    if (!confirm(`Hapus topik "${a.title}"?`)) return;
    setBusyId(a.id);
    try {
      await api(`/api/v1/articles/${a.id}`, { method: "DELETE" });
      toast.success("Topik dihapus");
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
            Forum Diskusi
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Kelola topik diskusi. Tanggapan selalu aktif dan tetap melalui moderasi guru.
          </p>
        </div>
        <Link
          href={`/sites/${sid}/tulisan/new?rubric=forum-diskusi`}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
        >
          <Plus className="size-4" />
          Buat Topik Baru
        </Link>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className={`overflow-x-auto ${loading ? "opacity-60" : ""}`}>
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr>
                {["Topik", "Status", "Views", "Terakhir Aktif", "Aksi"].map((h) => (
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
              {items.map((t) => (
                <tr key={t.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="grid h-9 w-11 place-items-center rounded-lg bg-gradient-to-br from-slate-200 to-slate-300 text-slate-500">
                        <MessagesSquare className="size-4" />
                      </div>
                      <span className="text-[13px] font-semibold text-slate-900">{t.title}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <Chip tone={t.status === "published" ? "green" : "gray"}>
                      {t.status === "published" ? "Published" : "Draft"}
                    </Chip>
                  </td>
                  <td className="px-4 py-3.5 text-[13px] text-slate-700">
                    {t.view_count.toLocaleString("id-ID")}
                  </td>
                  <td className="px-4 py-3.5 text-[13px] text-slate-600">{fmtDate(t.updated_at)}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/sites/${sid}/tulisan/${t.id}/edit`}
                        className="rounded-lg bg-blue-50 px-3 py-1.5 text-[12px] font-bold text-blue-700 hover:bg-blue-100"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => remove(t)}
                        disabled={busyId === t.id}
                        className="rounded-lg bg-rose-50 px-3 py-1.5 text-[12px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                      >
                        {busyId === t.id ? "…" : "Hapus"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-500">
                    Belum ada topik forum. Klik &quot;Buat Topik Baru&quot; untuk mulai.
                  </td>
                </tr>
              )}
              {loading && items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
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
