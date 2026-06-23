"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Pagination, SearchBar, useDebounced, type PaginatedResult } from "@/components/Pagination";

type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  site_count: number;
  created_at: string;
};

const SORT_OPTIONS = [
  { value: "newest", label: "Terbaru" },
  { value: "oldest", label: "Terlama" },
  { value: "email_asc", label: "Email A→Z" },
  { value: "email_desc", label: "Email Z→A" },
  { value: "sites_desc", label: "Jumlah Situs (banyak dulu)" },
];

export default function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("newest");
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [data, setData] = useState<PaginatedResult<AdminUser> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Reset to page 1 when search/sort changes
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
      const r = await api<PaginatedResult<AdminUser>>(`/api/v1/admin/users?${params}`);
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

  async function setRole(id: string, role: "user" | "admin") {
    try {
      await api(`/api/v1/admin/users/${id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function remove(id: string, email: string) {
    if (!confirm(`Hapus user ${email}? Semua situs miliknya juga akan dihapus.`)) return;
    try {
      await api(`/api/v1/admin/users/${id}`, { method: "DELETE" });
      refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const users = data?.items ?? [];

  return (
    <div>
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">User</h1>
          <p className="text-sm text-slate-600">
            {data ? `${data.total} user terdaftar` : "Memuat…"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SearchBar value={q} onChange={setQ} placeholder="Cari email/nama..." />
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
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Situs</th>
              <th className="px-4 py-3">Daftar</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className={loading ? "opacity-60" : ""}>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-mono text-xs">{u.email}</td>
                <td className="px-4 py-3">{u.name || "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      u.role === "admin"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 tabular-nums">{u.site_count}</td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {new Date(u.created_at).toLocaleDateString("id-ID")}
                </td>
                <td className="px-4 py-3 text-right">
                  {u.role === "admin" ? (
                    <button
                      onClick={() => setRole(u.id, "user")}
                      className="mr-3 text-xs text-slate-600 hover:underline"
                    >
                      Demote
                    </button>
                  ) : (
                    <button
                      onClick={() => setRole(u.id, "admin")}
                      className="mr-3 text-xs text-amber-600 hover:underline"
                    >
                      Jadikan Admin
                    </button>
                  )}
                  <button
                    onClick={() => remove(u.id, u.email)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Hapus
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  {debouncedQ ? `Tidak ada hasil untuk "${debouncedQ}".` : "Belum ada user."}
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
    </div>
  );
}
