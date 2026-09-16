"use client";

// Tulisan list — mirror mockup dashboard-guru/tulisan.html, wired ke
// /api/v1/sites/:id/articles. Filter rubrik pakai 5 rubrik utama (bukan
// forum-diskusi — itu ada di menu Forum terpisah).

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FileText, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { api, GURU_RUBRIC_LABEL, type Article, type GuruRubric } from "@/lib/api";
import { useDebounced, type PaginatedResult } from "@/components/Pagination";

const RUBRIC_TABS: Array<{ value: GuruRubric | "_all"; label: string }> = [
  { value: "_all", label: "Semua" },
  { value: "ceritaku", label: "Ceritaku" },
  { value: "bacaanku", label: "Bacaanku" },
  { value: "inspirasiku", label: "Inspirasiku" },
  { value: "bangsaku", label: "Bangsaku" },
  { value: "peradaban", label: "Peradaban" },
];

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

export default function TulisanListPage() {
  const params = useParams<{ id: string }>();
  const sid = params.id;
  const [query, setQuery] = useState("");
  const debouncedQ = useDebounced(query, 300);
  const [rubric, setRubric] = useState<GuruRubric | "_all">("_all");
  const [items, setItems] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: "1", page_size: "50", sort: "newest" });
      if (debouncedQ) p.set("q", debouncedQ);
      if (rubric !== "_all") p.set("rubric", rubric);
      const r = await api<PaginatedResult<Article>>(`/api/v1/sites/${sid}/articles?${p}`);
      // Exclude forum-diskusi dari daftar Tulisan — itu domain menu Forum.
      const filtered = r.items.filter((a) => a.rubric !== "forum-diskusi");
      setItems(filtered);
      setTotal(filtered.length);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid, debouncedQ, rubric]);

  async function remove(a: Article) {
    if (!confirm(`Hapus tulisan "${a.title}"?`)) return;
    setBusyId(a.id);
    try {
      await api(`/api/v1/articles/${a.id}`, { method: "DELETE" });
      toast.success("Tulisan dihapus");
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
            Kelola Tulisan
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {loading ? "Memuat…" : `${total} tulisan dalam 5 rubrik utama.`}
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
              {RUBRIC_TABS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRubric(r.value)}
                  className={`rounded-full border px-3.5 py-2 text-[12px] font-bold transition ${
                    rubric === r.value
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={`overflow-x-auto ${loading ? "opacity-60" : ""}`}>
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr>
                {["Judul", "Rubrik", "Status", "Views", "Diperbarui", "Aksi"].map((h) => (
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
              {items.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="grid h-9 w-11 place-items-center rounded-lg bg-gradient-to-br from-slate-200 to-slate-300 text-slate-500">
                        <FileText className="size-4" />
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold text-slate-900">{a.title}</div>
                        <div className="text-[11px] text-slate-500">{a.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-[13px] text-slate-600">
                    {GURU_RUBRIC_LABEL[a.rubric]}
                  </td>
                  <td className="px-4 py-3.5">
                    <Chip tone={a.status === "published" ? "green" : "gray"}>
                      {a.status === "published" ? "Published" : "Draft"}
                    </Chip>
                  </td>
                  <td className="px-4 py-3.5 text-[13px] text-slate-700">{a.view_count.toLocaleString("id-ID")}</td>
                  <td className="px-4 py-3.5 text-[13px] text-slate-600">{fmtDate(a.updated_at)}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/sites/${sid}/tulisan/${a.id}/edit`}
                        className="rounded-lg bg-blue-50 px-3 py-1.5 text-[12px] font-bold text-blue-700 hover:bg-blue-100"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => remove(a)}
                        disabled={busyId === a.id}
                        className="rounded-lg bg-rose-50 px-3 py-1.5 text-[12px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                      >
                        {busyId === a.id ? "…" : "Hapus"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">
                    {query || rubric !== "_all"
                      ? "Tidak ada tulisan yang cocok"
                      : "Belum ada tulisan. Klik “Tulis Artikel Baru” untuk mulai."}
                  </td>
                </tr>
              )}
              {loading && items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
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
