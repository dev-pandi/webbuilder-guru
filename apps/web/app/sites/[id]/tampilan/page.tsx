"use client";

// Tampilan Website — mirror mockup dashboard-guru/tampilan.html, wired ke:
//   GET /api/v1/sites/:id           → template_id + theme (colors/font/radius)
//   GET /api/v1/templates            → list template (filter kategori guru)
//   GET /api/v1/auth/me              → hero_statement + bio_short + quote
//   PATCH /api/v1/sites/:id          → save theme.colors.primary (accent)
//   POST /api/v1/sites/:id/apply-template → ganti template (mode="theme"
//     = hanya swap theme JSON, tidak sentuh halaman)
//   PATCH /api/v1/auth/me            → save hero + deskripsi + quote

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, ImageIcon, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

type ThemeJson = {
  colors?: { primary?: string; secondary?: string; bg?: string; fg?: string };
  font?: { heading?: string; body?: string };
  radius?: string;
};

type Site = {
  id: string;
  name: string;
  template_id: string | null;
  theme: ThemeJson | null;
};

type Template = {
  id: string;
  slug: string;
  category: string;
  variant: string;
  name: string;
  description: string;
  theme: ThemeJson;
};

type Me = {
  hero_statement: string;
  bio_short: string;
  quote: string;
  profile_image: string;
};

// Preset accent — user boleh pilih preset atau custom picker.
const ACCENT_PRESETS = [
  { name: "Terracotta", color: "#c9795a" },
  { name: "Sage", color: "#6d8a73" },
  { name: "Dusty Blue", color: "#718eaa" },
  { name: "Violet", color: "#7c6bd6" },
];

// Filter template yang relevan untuk guru — category `teacher` (matrix) atau
// `guru-pandi` (co-branded). Kategori lain (business, restaurant, dll) tidak
// muncul di menu ini karena persona mockup fokus guru.
const GURU_CATEGORIES = new Set(["teacher", "guru-pandi"]);

function gradientFrom(t: ThemeJson): string {
  const p = t.colors?.primary ?? "#c9795a";
  const b = t.colors?.bg ?? "#ffffff";
  return `linear-gradient(135deg, ${p}33, ${b})`;
}

export default function TampilanPage() {
  const params = useParams<{ id: string }>();
  const sid = params.id;

  const [site, setSite] = useState<Site | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  // Draft state — belum di-commit ke server sampai user klik Terapkan.
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [accent, setAccent] = useState<string>(ACCENT_PRESETS[0].color);
  const [heroTitle, setHeroTitle] = useState("");
  const [heroDesc, setHeroDesc] = useState("");
  const [heroImage, setHeroImage] = useState("");
  const [quote, setQuote] = useState("");
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [siteRes, tplRes, meRes] = await Promise.all([
        api<Site>(`/api/v1/sites/${sid}`).catch(() => null),
        api<Template[]>("/api/v1/templates", { auth: false }).catch(() => [] as Template[]),
        api<Me>("/api/v1/auth/me").catch(() => null),
      ]);
      if (cancelled) return;
      setSite(siteRes);
      const guru = (tplRes ?? []).filter((t) => GURU_CATEGORIES.has(t.category));
      setTemplates(guru);
      const currentTpl = guru.find((t) => t.id === siteRes?.template_id);
      setSelectedSlug(currentTpl?.slug ?? guru[0]?.slug ?? null);
      const currentAccent = siteRes?.theme?.colors?.primary;
      if (currentAccent) setAccent(currentAccent);
      if (meRes) {
        setMe(meRes);
        setHeroTitle(meRes.hero_statement ?? "");
        setHeroDesc(meRes.bio_short ?? "");
        setHeroImage(meRes.profile_image ?? "");
        setQuote(meRes.quote ?? "");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [sid]);

  const appliedTemplate = useMemo(
    () => templates.find((t) => t.id === site?.template_id) ?? null,
    [templates, site?.template_id],
  );
  const selectedTemplate = useMemo(
    () => templates.find((t) => t.slug === selectedSlug) ?? null,
    [templates, selectedSlug],
  );

  // Dirty flags — driving disable state tombol Terapkan.
  const dirtyTemplate = selectedTemplate && selectedTemplate.id !== site?.template_id;
  const dirtyAccent = accent !== (site?.theme?.colors?.primary ?? ACCENT_PRESETS[0].color);
  const dirtyHero =
    (me?.hero_statement ?? "") !== heroTitle ||
    (me?.bio_short ?? "") !== heroDesc ||
    (me?.profile_image ?? "") !== heroImage ||
    (me?.quote ?? "") !== quote;
  const hasDirty = Boolean(dirtyTemplate || dirtyAccent || dirtyHero);

  async function apply() {
    if (!hasDirty || !site) return;
    setApplying(true);
    try {
      // 1. Ganti template (mode="theme" → hanya swap theme JSON, tidak sentuh page).
      if (dirtyTemplate && selectedTemplate) {
        await api(`/api/v1/sites/${sid}/apply-template`, {
          method: "POST",
          body: JSON.stringify({ slug: selectedTemplate.slug, mode: "theme" }),
        });
      }

      // 2. Save accent color — merge dengan theme existing supaya field lain
      //    (secondary/bg/fg/font/radius) tidak hilang.
      if (dirtyAccent) {
        const existing = site.theme ?? {};
        const nextTheme: ThemeJson = {
          ...existing,
          colors: { ...(existing.colors ?? {}), primary: accent },
        };
        await api(`/api/v1/sites/${sid}`, {
          method: "PATCH",
          body: JSON.stringify({ theme: nextTheme }),
        });
      }

      // 3. Save hero/quote via /auth/me (guru profile, bukan site theme).
      if (dirtyHero) {
        await api("/api/v1/auth/me", {
          method: "PATCH",
          body: JSON.stringify({
            hero_statement: heroTitle,
            bio_short: heroDesc,
            profile_image: heroImage,
            quote,
          }),
        });
      }

      toast.success("Tampilan diterapkan ke website");
      // Refresh site + me untuk sync dirty flags.
      const [siteRes, meRes] = await Promise.all([
        api<Site>(`/api/v1/sites/${sid}`),
        api<Me>("/api/v1/auth/me"),
      ]);
      setSite(siteRes);
      setMe(meRes);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setApplying(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="size-4 animate-spin" /> Memuat template + tema…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            Tampilan Website
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Pilih template dan personalisasi elemen visual website Anda.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasDirty && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1.5 text-[11px] font-bold text-amber-800">
              Draft: {selectedTemplate?.name ?? "—"}
            </span>
          )}
          <button
            onClick={apply}
            disabled={!hasDirty || applying}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {applying ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Menerapkan…
              </>
            ) : (
              "Terapkan ke Website"
            )}
          </button>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-[15px] font-bold text-slate-900">Template Website</h2>
          {appliedTemplate ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1.5 text-[11px] font-bold text-emerald-800">
              <CheckCircle2 className="size-3" />
              Aktif: {appliedTemplate.name}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-600">
              Belum ada template
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
          {templates.length === 0 && (
            <div className="col-span-full py-8 text-center text-sm text-slate-500">
              Tidak ada template guru tersedia.
            </div>
          )}
          {templates.map((t) => {
            const isSelected = t.slug === selectedSlug;
            const isApplied = t.id === site?.template_id;
            return (
              <div
                key={t.id}
                className={`relative rounded-2xl border-2 bg-white p-3 shadow-sm transition ${
                  isSelected ? "border-orange-500 shadow-md shadow-orange-500/10" : "border-slate-200"
                }`}
              >
                {isApplied && (
                  <span className="absolute left-4 top-4 rounded-full bg-orange-500 px-2 py-1 text-[10px] font-bold uppercase text-white">
                    Sedang digunakan
                  </span>
                )}
                <div
                  className="aspect-[16/10] rounded-xl border border-slate-200"
                  style={{ background: gradientFrom(t.theme) }}
                />
                <h3 className="mt-3 text-sm font-bold text-slate-900">{t.name}</h3>
                <p className="mt-1 line-clamp-2 min-h-[36px] text-[11px] leading-relaxed text-slate-500">
                  {t.description}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                    {t.variant}
                  </span>
                  <button
                    onClick={() => setSelectedSlug(t.slug)}
                    disabled={isSelected}
                    className="rounded-lg bg-orange-500 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-orange-600 disabled:cursor-default disabled:bg-orange-200"
                  >
                    {isSelected ? "Dipilih" : "Pilih"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-[15px] font-bold text-slate-900">Warna Aksen</h2>
              <p className="mt-1 text-[12px] text-slate-500">
                Warna primary yang dipakai tombol, tautan, dan highlight di website.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 p-5">
              {ACCENT_PRESETS.map((a) => {
                const active = accent.toLowerCase() === a.color.toLowerCase();
                return (
                  <button
                    key={a.name}
                    onClick={() => setAccent(a.color)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[12px] font-bold transition ${
                      active
                        ? "border-slate-900 bg-slate-50 text-slate-900"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className="h-4 w-4 rounded-full border-2 border-white ring-1 ring-slate-300"
                      style={{ background: a.color }}
                    />
                    {a.name}
                  </button>
                );
              })}
              <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-600 hover:bg-slate-50">
                <span
                  className="h-4 w-4 rounded-full border-2 border-white ring-1 ring-slate-300"
                  style={{ background: accent }}
                />
                Custom
                <input
                  type="color"
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                  className="h-5 w-8 cursor-pointer border-0 bg-transparent p-0"
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-[15px] font-bold text-slate-900">Identitas Hero</h2>
              <p className="mt-1 text-[12px] text-slate-500">
                Tampil di bagian atas beranda website. Data disimpan di profil guru.
              </p>
            </div>
            <div className="grid gap-4 p-5">
              <Field label="Foto Hero">
                {heroImage ? (
                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={heroImage}
                      alt="Preview foto hero"
                      className="h-20 w-32 rounded-lg object-cover"
                    />
                    <div className="flex flex-1 flex-col gap-2">
                      <input
                        value={heroImage}
                        onChange={(e) => setHeroImage(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/sites/${sid}/assets`}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-[12px] font-bold text-blue-700 hover:bg-blue-100"
                        >
                          <Upload className="size-3.5" />
                          Ganti via Aset
                        </Link>
                        <button
                          onClick={() => setHeroImage("")}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-700 hover:bg-slate-50"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-slate-500">
                    <ImageIcon className="mx-auto size-6" />
                    <div className="text-sm font-bold text-slate-700">Belum ada foto hero</div>
                    <p className="text-[12px] text-slate-500">
                      Upload gambar di menu Aset lalu paste URL-nya di sini.
                    </p>
                    <Link
                      href={`/sites/${sid}/assets`}
                      className="mx-auto inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-blue-700"
                    >
                      <Upload className="size-3.5" />
                      Buka Aset
                    </Link>
                    <input
                      value={heroImage}
                      onChange={(e) => setHeroImage(e.target.value)}
                      placeholder="…atau paste URL gambar"
                      className="mx-auto w-full max-w-sm rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400"
                    />
                  </div>
                )}
              </Field>
              <Field label="Judul Hero (max 500)">
                <input
                  value={heroTitle}
                  onChange={(e) => setHeroTitle(e.target.value)}
                  maxLength={500}
                  placeholder="Menulis adalah cara saya merawat harapan."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                />
              </Field>
              <Field label="Deskripsi Hero (max 280)">
                <textarea
                  value={heroDesc}
                  onChange={(e) => setHeroDesc(e.target.value)}
                  maxLength={280}
                  rows={3}
                  placeholder="Cerita, bacaan, dan pemikiran sederhana untuk perjalanan belajar yang lebih bermakna."
                  className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                />
                <p className="text-[11px] text-slate-500">
                  {heroDesc.length}/280 karakter
                </p>
              </Field>
            </div>
          </section>
        </div>

        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-[15px] font-bold text-slate-900">Quote Beranda</h2>
              <p className="mt-1 text-[12px] text-slate-500">
                Kutipan singkat yang mewakili filosofi Anda dalam mengajar.
              </p>
            </div>
            <div className="p-5">
              <Field label="Quote (max 500)">
                <textarea
                  value={quote}
                  onChange={(e) => setQuote(e.target.value)}
                  maxLength={500}
                  rows={4}
                  placeholder="Pendidikan bukan hanya tentang mengisi pikiran, tetapi juga tentang menyalakan hati."
                  className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                />
                <p className="text-[11px] text-slate-500">{quote.length}/500 karakter</p>
              </Field>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-[15px] font-bold text-slate-900">Alur Publikasi Tampilan</h3>
            </div>
            <div className="p-5">
              <ol className="grid gap-2 text-[13px] leading-relaxed text-slate-700">
                <li>
                  <strong>1.</strong> Pilih template dari daftar di atas (draft).
                </li>
                <li>
                  <strong>2.</strong> Ubah warna aksen, hero, dan quote sesuai selera.
                </li>
                <li>
                  <strong>3.</strong> Klik <strong>Terapkan ke Website</strong> untuk simpan
                  perubahan. Klik tombol <strong>Publikasikan</strong> di atas kalau situs
                  belum live.
                </li>
              </ol>
              <div className="mt-3 rounded-xl bg-blue-50 px-4 py-3 text-[12px] text-blue-800">
                Ganti template mode <code>theme</code> hanya menukar warna & font — halaman
                tetap. Untuk mengganti seluruh halaman, pakai menu Editor.
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label className="text-[12px] font-bold text-slate-600">{label}</label>
      {children}
    </div>
  );
}
