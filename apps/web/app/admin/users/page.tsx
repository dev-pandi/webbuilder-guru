"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  site_count: number;
  created_at: string;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try {
      setUsers(await api<AdminUser[]>("/api/v1/admin/users"));
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => {
    refresh();
  }, []);

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

  return (
    <div>
      <header>
        <h1 className="text-2xl font-bold">User</h1>
        <p className="text-sm text-slate-600">{users.length} user terdaftar.</p>
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
          <tbody>
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
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Belum ada user.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
