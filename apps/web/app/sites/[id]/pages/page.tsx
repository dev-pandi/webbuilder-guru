"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Page = {
  id: string;
  slug: string;
  title: string;
  is_home: boolean;
  updated_at: string;
};

export default function PagesPage() {
  const params = useParams<{ id: string }>();
  const [pages, setPages] = useState<Page[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");

  async function refresh() {
    try {
      setPages(await api<Page[]>(`/api/v1/sites/${params.id}/pages`));
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => {
    refresh();
  }, [params.id]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await api(`/api/v1/sites/${params.id}/pages`, {
        method: "POST",
        body: JSON.stringify({ slug, title, tree: { blocks: [] }, seo: {}, is_home: false }),
      });
      setSlug("");
      setTitle("");
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function setHome(id: string) {
    await api(`/api/v1/pages/${id}`, { method: "PATCH", body: JSON.stringify({ is_home: true }) });
    refresh();
  }

  async function remove(id: string) {
    if (!confirm("Hapus halaman?")) return;
    await api(`/api/v1/pages/${id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Judul</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Home</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {pages.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">{p.title || "—"}</td>
                <td className="px-4 py-3 font-mono text-slate-600">/{p.slug}</td>
                <td className="px-4 py-3">
                  {p.is_home ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">home</span>
                  ) : (
                    <button onClick={() => setHome(p.id)} className="text-xs text-brand-600 hover:underline">
                      Jadikan home
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => remove(p.id)} className="text-xs text-red-600 hover:underline">
                    Hapus
                  </button>
                </td>
              </tr>
            ))}
            {pages.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  Belum ada halaman.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form onSubmit={create} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-semibold">Tambah Halaman</h3>
        <div>
          <label className="block text-sm font-medium">Judul</label>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Slug</label>
          <input
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-/]/g, ""))}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            placeholder="tentang"
          />
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
        <button className="w-full rounded-lg bg-brand-600 px-3 py-2 font-medium text-white hover:bg-brand-700">
          Tambah
        </button>
      </form>
    </div>
  );
}
