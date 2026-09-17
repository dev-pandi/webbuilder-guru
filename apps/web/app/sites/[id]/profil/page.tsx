"use client";

// Profil Guru — mirror mockup dashboard-guru/profil.html, wired ke
// /api/v1/auth/me (GET) + PATCH. Field mapping:
//   name           → users.name
//   profession     → subject_or_field
//   bio (long)     → bio_long
//   ringkasan      → bio_short
//   hero_statement → hero_statement
//   quote          → quote
//   image URL      → profile_image
//   Media sosial   → social_links[{platform,url}]

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { ImagePicker } from "@/components/ImagePicker";

type SocialLink = { platform: string; url: string };

type Me = {
  name: string;
  email: string;
  subject_or_field: string;
  profile_image: string;
  bio_short: string;
  bio_long: string;
  hero_statement: string;
  quote: string;
  social_links: SocialLink[];
};

const PLATFORMS = ["instagram", "youtube", "twitter", "facebook", "linkedin", "tiktok", "website"];

export default function ProfilPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [image, setImage] = useState("");
  const [bioShort, setBioShort] = useState("");
  const [bioLong, setBioLong] = useState("");
  const [hero, setHero] = useState("");
  const [quote, setQuote] = useState("");
  const [links, setLinks] = useState<SocialLink[]>([]);

  useEffect(() => {
    let cancelled = false;
    api<Me>("/api/v1/auth/me")
      .then((u) => {
        if (cancelled) return;
        setName(u.name ?? "");
        setSubject(u.subject_or_field ?? "");
        setImage(u.profile_image ?? "");
        setBioShort(u.bio_short ?? "");
        setBioLong(u.bio_long ?? "");
        setHero(u.hero_statement ?? "");
        setQuote(u.quote ?? "");
        setLinks(Array.isArray(u.social_links) ? u.social_links : []);
      })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setSaving(true);
    try {
      const body = {
        name,
        subject_or_field: subject,
        profile_image: image,
        bio_short: bioShort,
        bio_long: bioLong,
        hero_statement: hero,
        quote,
        social_links: links
          .map((l) => ({
            platform: l.platform.trim().toLowerCase(),
            url: l.url.trim(),
          }))
          .filter((l) => l.platform && l.url),
      };
      await api<Me>("/api/v1/auth/me", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      toast.success("Profil disimpan");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function addLink() {
    setLinks((prev) => [...prev, { platform: "", url: "" }]);
  }
  function removeLink(i: number) {
    setLinks((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateLink(i: number, key: keyof SocialLink, value: string) {
    setLinks((prev) => prev.map((l, idx) => (idx === i ? { ...l, [key]: value } : l)));
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="size-4 animate-spin" /> Memuat profil…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Profil Guru</h1>
          <p className="mt-1 text-sm text-slate-500">
            Informasi ini ditampilkan pada halaman profil dan identitas website.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {saving ? "Menyimpan…" : "Simpan Profil"}
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
            <div className="col-span-full grid gap-1.5">
              <label className="text-[12px] font-bold text-slate-600">Foto Profil</label>
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                {image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image}
                    alt="Preview foto profil"
                    className="h-20 w-20 shrink-0 rounded-full object-cover ring-2 ring-slate-100"
                  />
                )}
                <div className="w-full max-w-sm">
                  <ImagePicker value={image} onChange={setImage} />
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    Pilih dari library aset, upload baru, atau paste URL eksternal.
                  </p>
                </div>
              </div>
            </div>

            <TextField label="Nama Lengkap" value={name} onChange={setName} />
            <TextField
              label="Profesi / Bidang"
              value={subject}
              onChange={setSubject}
              placeholder="Contoh: Guru Bahasa Indonesia"
            />

            <TextArea
              label="Ringkasan Diri (max 280)"
              value={bioShort}
              onChange={setBioShort}
              rows={2}
              className="col-span-full"
              hint={`${bioShort.length}/280 karakter · tampil di kartu preview`}
            />
            <TextArea
              label="Biografi Lengkap"
              value={bioLong}
              onChange={setBioLong}
              rows={5}
              className="col-span-full"
              hint={`${bioLong.length}/4000 karakter · tampil di halaman profil website`}
            />
            <TextArea
              label="Hero Statement"
              value={hero}
              onChange={setHero}
              rows={2}
              className="col-span-full"
              hint="Kalimat singkat yang tampil di beranda website."
            />
            <TextArea
              label="Quote Pribadi"
              value={quote}
              onChange={setQuote}
              rows={3}
              className="col-span-full"
              hint="Filosofi mengajar atau kutipan favorit."
            />
          </div>
        </section>

        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h3 className="text-[15px] font-bold text-slate-900">Media Sosial</h3>
              <button
                onClick={addLink}
                disabled={links.length >= 10}
                className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-[12px] font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                <Plus className="size-3.5" />
                Tambah
              </button>
            </div>
            <div className="grid gap-3 p-5">
              {links.length === 0 && (
                <p className="text-[12px] text-slate-500">
                  Belum ada tautan sosial. Tambahkan minimal 1 supaya pembaca bisa terhubung.
                </p>
              )}
              {links.map((l, i) => (
                <div key={i} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center gap-2">
                    <input
                      list="social-platforms"
                      value={l.platform}
                      onChange={(e) => updateLink(i, "platform", e.target.value)}
                      placeholder="platform"
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-blue-400"
                    />
                    <button
                      onClick={() => removeLink(i)}
                      className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                      title="Hapus"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <input
                    type="url"
                    value={l.url}
                    onChange={(e) => updateLink(i, "url", e.target.value)}
                    placeholder="https://…"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-blue-400"
                  />
                </div>
              ))}
              <datalist id="social-platforms">
                {PLATFORMS.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="rounded-xl bg-blue-50 px-4 py-3 text-[12px] text-blue-800">
              Profil guru digunakan oleh semua template. Mengganti template tidak menghapus data profil.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <label className="text-[12px] font-bold text-slate-600">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
      />
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  rows = 4,
  className,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  className?: string;
  hint?: string;
}) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <label className="text-[12px] font-bold text-slate-600">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
      />
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}
