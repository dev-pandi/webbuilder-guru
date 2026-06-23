"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Site = {
  id: string;
  slug: string;
  name: string;
  status: "draft" | "published" | "archived";
  updated_at: string;
};

type Template = {
  slug: string;
  category: string;
  name: string;
  description: string;
};

export default function DashboardPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try {
      const list = await api<Site[]>("/api/v1/sites");
      setSites(list);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  useEffect(() => {
    refresh();
    api<Template[]>("/api/v1/templates", { auth: false }).then(setTemplates).catch(() => {});
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Situs Saya</h1>
          <p className="text-sm text-slate-600">{sites.length} dari 5 situs aktif.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700"
        >
          + Buat Situs Baru
        </button>
      </div>

      {err && <p className="mt-4 text-sm text-red-600">{err}</p>}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sites.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
            Belum ada situs. Klik “Buat Situs Baru” untuk mulai.
          </div>
        )}
        {sites.map((s) => (
          <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{s.name}</h3>
                <p className="mt-0.5 text-xs text-slate-500">/{s.slug}</p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  s.status === "published" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                }`}
              >
                {s.status}
              </span>
            </div>
            <div className="mt-4 flex gap-2 text-sm">
              <Link
                href={`/sites/${s.id}/editor`}
                className="flex-1 rounded-lg bg-slate-900 px-3 py-1.5 text-center text-white hover:bg-slate-800"
              >
                Edit
              </Link>
              <Link
                href={`/sites/${s.id}/pages`}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-center hover:bg-slate-100"
              >
                Halaman
              </Link>
              <Link
                href={`/sites/${s.id}/domains`}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-center hover:bg-slate-100"
              >
                Domain
              </Link>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <NewSiteModal
          templates={templates}
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function NewSiteModal({
  templates,
  onClose,
  onCreated,
}: {
  templates: Template[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [tpl, setTpl] = useState(templates[0]?.slug ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!tpl && templates.length > 0) setTpl(templates[0].slug);
  }, [templates, tpl]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await api(`/api/v1/sites/from-template/${tpl}`, {
        method: "POST",
        body: JSON.stringify({ slug, name }),
      });
      onCreated();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold">Buat Situs Baru</h2>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium">Template</label>
            <select
              value={tpl}
              onChange={(e) => setTpl(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              {templates.map((t) => (
                <option key={t.slug} value={t.slug}>
                  [{t.category}] {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Nama Situs</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">
              Slug <span className="text-xs text-slate-500">(huruf kecil, angka, tanda hubung)</span>
            </label>
            <input
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="tokoanda"
            />
            <p className="mt-1 text-xs text-slate-500">
              Bisa diakses di: <code>{slug || "<slug>"}.localhost</code>
            </p>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2">
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {loading ? "Membuat..." : "Buat"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
