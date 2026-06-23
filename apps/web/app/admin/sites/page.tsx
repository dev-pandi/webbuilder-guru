"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtBytes, pct } from "@/lib/format";
import { Pagination, SearchBar, useDebounced, type PaginatedResult } from "@/components/Pagination";

type AdminSite = {
  id: string;
  slug: string;
  name: string;
  status: string;
  owner_id: string;
  owner_email: string;
  pages_count: number;
  assets_count: number;
  storage_bytes: number;
  quota_max_pages: number;
  quota_max_storage_bytes: number;
  created_at: string;
};

const SORT_OPTIONS = [
  { value: "newest", label: "Terbaru" },
  { value: "oldest", label: "Terlama" },
  { value: "name_asc", label: "Nama A→Z" },
  { value: "storage_desc", label: "Storage Terbesar" },
  { value: "pages_desc", label: "Halaman Terbanyak" },
];

export default function AdminSitesPage() {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("newest");
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [data, setData] = useState<PaginatedResult<AdminSite> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<AdminSite | null>(null);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, sort]);

  async function refresh() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: "20",
        sort,
      });
      if (debouncedQ) params.set("q", debouncedQ);
      const r = await api<PaginatedResult<AdminSite>>(`/api/v1/admin/sites?${params}`);
      setData(r);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, [page, debouncedQ, sort]);

  async function remove(id: string, name: string) {
    if (!confirm(`Hapus situs ${name}? Tindakan ini tidak bisa dibatalkan.`)) return;
    try {
      await api(`/api/v1/admin/sites/${id}`, { method: "DELETE" });
      refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const sites = data?.items ?? [];

  return (
    <div>
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Situs</h1>
          <p className="text-sm text-slate-600">
            {data ? `${data.total} situs di platform` : "Memuat…"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SearchBar value={q} onChange={setQ} placeholder="Cari nama/slug/email..." />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </header>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Nama / Slug</th>
              <th className="px-4 py-3">Pemilik</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Halaman</th>
              <th className="px-4 py-3">Storage</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className={loading ? "opacity-60" : ""}>
            {sites.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <div className="font-medium">{s.name}</div>
                  <div className="font-mono text-xs text-slate-500">/{s.slug}</div>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{s.owner_email}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      s.status === "published"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {s.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs">
                  <QuotaCell used={s.pages_count} max={s.quota_max_pages} fmt={(n) => `${n}`} />
                </td>
                <td className="px-4 py-3 text-xs">
                  <QuotaCell
                    used={s.storage_bytes}
                    max={s.quota_max_storage_bytes}
                    fmt={fmtBytes}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setEditing(s)}
                    className="mr-3 text-xs text-brand-600 hover:underline"
                  >
                    Edit Quota
                  </button>
                  <button
                    onClick={() => remove(s.id, s.name)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Hapus
                  </button>
                </td>
              </tr>
            ))}
            {sites.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  {debouncedQ ? `Tidak ada hasil untuk "${debouncedQ}".` : "Belum ada situs."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {data && (
          <div className="border-t border-slate-100">
            <Pagination
              page={data.page}
              totalPages={data.total_pages}
              total={data.total}
              pageSize={data.page_size}
              onPage={setPage}
            />
          </div>
        )}
      </div>

      {editing && (
        <QuotaModal
          site={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function QuotaCell({
  used,
  max,
  fmt,
}: {
  used: number;
  max: number;
  fmt: (n: number) => string;
}) {
  const p = pct(used, max);
  const color = p >= 90 ? "bg-red-500" : p >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div>
      <div className="tabular-nums">
        {fmt(used)} / {fmt(max)}
      </div>
      <div className="mt-0.5 h-1 w-24 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${color}`} style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

function QuotaModal({
  site,
  onClose,
  onSaved,
}: {
  site: AdminSite;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [maxPages, setMaxPages] = useState(site.quota_max_pages);
  const [maxStorageMB, setMaxStorageMB] = useState(
    Math.round(site.quota_max_storage_bytes / (1024 * 1024)),
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await api(`/api/v1/admin/sites/${site.id}/quota`, {
        method: "PATCH",
        body: JSON.stringify({
          quota_max_pages: maxPages,
          quota_max_storage_bytes: maxStorageMB * 1024 * 1024,
        }),
      });
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold">Edit Quota</h2>
        <p className="mt-1 text-xs text-slate-500">{site.name}</p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium">Maks Halaman</label>
            <input
              type="number"
              min={1}
              value={maxPages}
              onChange={(e) => setMaxPages(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-slate-500">Saat ini terpakai: {site.pages_count}</p>
          </div>
          <div>
            <label className="block text-sm font-medium">Maks Storage (MB)</label>
            <input
              type="number"
              min={1}
              value={maxStorageMB}
              onChange={(e) => setMaxStorageMB(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-slate-500">
              Saat ini terpakai: {fmtBytes(site.storage_bytes)}
            </p>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </form>
    </div>
  );
}
