"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  variant: string;
  name: string;
  description: string;
  theme: {
    colors?: { primary?: string; secondary?: string; bg?: string; fg?: string };
    font?: { heading?: string; body?: string };
    radius?: string;
  };
};

type Category = { key: string; label: string; description: string; emoji: string };
type Variant = { key: string; name: string; description: string };
type Meta = { categories: Category[]; variants: Variant[] };

export default function DashboardPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
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
    api<Meta>("/api/v1/template-meta", { auth: false }).then(setMeta).catch(() => {});
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
          meta={meta}
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

// ---- Multi-step modal: category → variant → name/slug ----

function NewSiteModal({
  templates,
  meta,
  onClose,
  onCreated,
}: {
  templates: Template[];
  meta: Meta | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [category, setCategory] = useState<string | null>(null);
  const [tplSlug, setTplSlug] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const variantsForCategory = useMemo(
    () => templates.filter((t) => t.category === category),
    [templates, category],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!tplSlug) return;
    setErr(null);
    setLoading(true);
    try {
      await api(`/api/v1/sites/from-template/${tplSlug}`, {
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
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">Buat Situs Baru</h2>
            <p className="text-xs text-slate-500">
              Langkah {step} dari 3:{" "}
              {step === 1 ? "Pilih kategori" : step === 2 ? "Pilih tema" : "Detail situs"}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
          {step === 1 && (
            <CategoryStep
              categories={meta?.categories ?? []}
              onPick={(key) => {
                setCategory(key);
                setStep(2);
              }}
            />
          )}
          {step === 2 && category && (
            <VariantStep
              variants={variantsForCategory}
              onBack={() => setStep(1)}
              onPick={(slug) => {
                setTplSlug(slug);
                setStep(3);
              }}
            />
          )}
          {step === 3 && tplSlug && (
            <DetailsStep
              templates={templates}
              tplSlug={tplSlug}
              name={name}
              slug={slug}
              setName={setName}
              setSlug={setSlug}
              loading={loading}
              err={err}
              onBack={() => setStep(2)}
              onSubmit={submit}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryStep({
  categories,
  onPick,
}: {
  categories: Category[];
  onPick: (key: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((c) => (
        <button
          key={c.key}
          onClick={() => onPick(c.key)}
          className="group rounded-xl border border-slate-200 bg-white p-5 text-left transition hover:border-brand-500 hover:shadow-md"
        >
          <div className="text-3xl">{c.emoji}</div>
          <div className="mt-3 font-semibold text-slate-900">{c.label}</div>
          <div className="mt-1 text-xs text-slate-500">{c.description}</div>
        </button>
      ))}
    </div>
  );
}

function VariantStep({
  variants,
  onBack,
  onPick,
}: {
  variants: Template[];
  onBack: () => void;
  onPick: (slug: string) => void;
}) {
  return (
    <div>
      <button onClick={onBack} className="mb-4 text-sm text-slate-500 hover:underline">
        ← Ganti kategori
      </button>
      <div className="grid gap-3 sm:grid-cols-3">
        {variants.map((t) => (
          <button
            key={t.slug}
            onClick={() => onPick(t.slug)}
            className="group rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-brand-500 hover:shadow-md"
          >
            <ThemeSwatchPreview theme={t.theme} />
            <div className="mt-3 font-semibold text-slate-900">{t.name.split("—")[1]?.trim() ?? t.name}</div>
            <div className="mt-1 text-xs text-slate-500">{t.description}</div>
          </button>
        ))}
        {variants.length === 0 && (
          <p className="col-span-full text-sm text-slate-500">Tidak ada tema untuk kategori ini.</p>
        )}
      </div>
    </div>
  );
}

function ThemeSwatchPreview({ theme }: { theme: Template["theme"] }) {
  const c = theme.colors ?? {};
  const primary = c.primary ?? "#2563eb";
  const secondary = c.secondary ?? "#0ea5e9";
  const bg = c.bg ?? "#ffffff";
  const fg = c.fg ?? "#0f172a";
  const heading = theme.font?.heading ?? "Inter";
  const radius = theme.radius ?? "0.5rem";
  return (
    <div
      className="overflow-hidden border border-slate-200"
      style={{ background: bg, color: fg, borderRadius: radius }}
    >
      <div className="px-3 pt-3" style={{ fontFamily: heading }}>
        <div className="text-xs font-bold leading-tight">Aa — Heading</div>
        <div className="mt-1 text-[10px] opacity-70">Body text sample.</div>
      </div>
      <div className="mt-2 flex gap-1 px-3 pb-3">
        <span className="h-6 flex-1" style={{ background: primary, borderRadius: radius }} />
        <span className="h-6 flex-1" style={{ background: secondary, borderRadius: radius }} />
      </div>
    </div>
  );
}

function DetailsStep({
  templates,
  tplSlug,
  name,
  slug,
  setName,
  setSlug,
  loading,
  err,
  onBack,
  onSubmit,
}: {
  templates: Template[];
  tplSlug: string;
  name: string;
  slug: string;
  setName: (s: string) => void;
  setSlug: (s: string) => void;
  loading: boolean;
  err: string | null;
  onBack: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const tpl = templates.find((t) => t.slug === tplSlug);
  return (
    <form onSubmit={onSubmit}>
      <button type="button" onClick={onBack} className="mb-4 text-sm text-slate-500 hover:underline">
        ← Ganti tema
      </button>
      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        <span className="text-slate-500">Tema terpilih:</span>{" "}
        <span className="font-medium text-slate-900">{tpl?.name ?? tplSlug}</span>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Nama Situs</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Sekolah Saya"
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
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            placeholder="sekolah-saya"
          />
          <p className="mt-1 text-xs text-slate-500">
            Bisa diakses di: <code>{slug || "<slug>"}.localhost</code>
          </p>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-brand-600 px-5 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {loading ? "Membuat..." : "Buat Situs"}
        </button>
      </div>
    </form>
  );
}
