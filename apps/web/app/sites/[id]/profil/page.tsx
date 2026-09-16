"use client";

// Profil Guru — mirror mockup dashboard-guru/profil.html.

import { useState } from "react";
import { toast } from "sonner";
import { Image as ImageIcon } from "lucide-react";

export default function ProfilPage() {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "Ratna Prameswari",
    profession: "Guru Bahasa Indonesia",
    bio: "Saya percaya bahwa setiap kata punya kekuatan untuk mengubah cara kita memahami diri, sesama, dan dunia.",
    experience: "Guru Bahasa Indonesia · Pembina literasi sekolah · Penulis praktik baik pembelajaran.",
    education: "S1 Pendidikan Bahasa dan Sastra Indonesia.",
    instagram: "@ratna.mengajar",
    youtube: "Ratna Mengajar",
    email: "ratna@example.id",
  });

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 400));
    setSaving(false);
    toast.success("Profil disimpan");
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
              <div className="grid place-items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center text-slate-500">
                <ImageIcon className="size-6" />
                <div className="text-sm font-bold text-slate-700">Ganti foto profil</div>
                <div className="text-[12px]">Gunakan foto profesional yang jelas</div>
              </div>
            </div>

            <TextField label="Nama Lengkap" value={form.name} onChange={(v) => update("name", v)} />
            <TextField label="Profesi" value={form.profession} onChange={(v) => update("profession", v)} />

            <TextArea label="Bio" value={form.bio} onChange={(v) => update("bio", v)} className="col-span-full" />
            <TextArea label="Pengalaman" value={form.experience} onChange={(v) => update("experience", v)} className="col-span-full" />
            <TextArea label="Pendidikan" value={form.education} onChange={(v) => update("education", v)} className="col-span-full" />
          </div>
        </section>

        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-[15px] font-bold text-slate-900">Media Sosial</h3>
            </div>
            <div className="grid gap-4 p-5">
              <TextField label="Instagram" value={form.instagram} onChange={(v) => update("instagram", v)} />
              <TextField label="YouTube" value={form.youtube} onChange={(v) => update("youtube", v)} />
              <TextField label="Email Publik" value={form.email} onChange={(v) => update("email", v)} />
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
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <label className="text-[12px] font-bold text-slate-600">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
      />
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <label className="text-[12px] font-bold text-slate-600">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
      />
    </div>
  );
}
