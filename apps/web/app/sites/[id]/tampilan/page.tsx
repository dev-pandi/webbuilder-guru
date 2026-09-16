"use client";

// Tampilan Website — mirror mockup dashboard-guru/tampilan.html.
// Template picker (4 tema) + accent color + hero + quote.

import { useState } from "react";
import { toast } from "sonner";
import { Image as ImageIcon } from "lucide-react";

type Theme = {
  name: string;
  description: string;
  gradient: string;
};

const THEMES: Theme[] = [
  { name: "Hangat & Personal", description: "Nuansa krem, serif, dan card lembut untuk website personal.", gradient: "linear-gradient(135deg,#f0d9cc,#fff)" },
  { name: "Modern & Profesional", description: "Clean, akademik, navy, dan terasa lebih institusional.", gradient: "linear-gradient(135deg,#dce9f7,#f9fbfd)" },
  { name: "Ceria & Edukatif", description: "Pastel yang lebih aktif dan ramah tanpa terasa kekanak-kanakan.", gradient: "linear-gradient(135deg,#ffe7a8,#dff4e6)" },
  { name: "Minimal Editorial", description: "Fokus pada tulisan, whitespace luas, dan nuansa publikasi.", gradient: "linear-gradient(135deg,#e5e2dc,#ffffff)" },
];

const ACCENTS = [
  { name: "Terracotta", color: "#c9795a" },
  { name: "Sage", color: "#6d8a73" },
  { name: "Dusty Blue", color: "#718eaa" },
];

export default function TampilanPage() {
  const [selected, setSelected] = useState<string>("Hangat & Personal");
  const [applied, setApplied] = useState<string>("Hangat & Personal");
  const [accent, setAccent] = useState<string>("Terracotta");
  const [hero, setHero] = useState({
    title: "Menulis adalah cara saya merawat harapan.",
    description: "Cerita, bacaan, dan pemikiran sederhana untuk perjalanan belajar yang lebih bermakna.",
  });
  const [quote, setQuote] = useState(
    "Pendidikan bukan hanya tentang mengisi pikiran, tetapi juga tentang menyalakan hati.",
  );

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
          <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1.5 text-[11px] font-bold text-amber-800">
            Draft: {selected}
          </span>
          <button
            onClick={() => {
              setApplied(selected);
              toast.success("Template diterapkan ke website");
            }}
            disabled={selected === applied}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            Terapkan ke Website
          </button>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-[15px] font-bold text-slate-900">Template Website</h2>
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1.5 text-[11px] font-bold text-emerald-800">
            Template aktif: {applied}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
          {THEMES.map((t) => {
            const isSelected = t.name === selected;
            const isApplied = t.name === applied;
            return (
              <div
                key={t.name}
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
                  style={{ background: t.gradient }}
                />
                <h3 className="mt-3 text-sm font-bold text-slate-900">{t.name}</h3>
                <p className="mt-1 min-h-[36px] text-[11px] leading-relaxed text-slate-500">
                  {t.description}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => toast.success(`Preview ${t.name} dibuka (mockup)`)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => {
                      setSelected(t.name);
                      toast.success("Template dipilih sebagai draft");
                    }}
                    className="rounded-lg bg-orange-500 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-orange-600"
                  >
                    Gunakan Template
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
            </div>
            <div className="flex flex-wrap gap-2.5 p-5">
              {ACCENTS.map((a) => (
                <label
                  key={a.name}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-[12px] font-bold transition ${
                    accent === a.name
                      ? "border-slate-900 bg-slate-50 text-slate-900"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="accent"
                    checked={accent === a.name}
                    onChange={() => setAccent(a.name)}
                    className="sr-only"
                  />
                  <span
                    className="h-4 w-4 rounded-full border-2 border-white ring-1 ring-slate-300"
                    style={{ background: a.color }}
                  />
                  {a.name}
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-[15px] font-bold text-slate-900">Identitas Hero</h2>
            </div>
            <div className="grid gap-4 p-5">
              <div className="grid gap-1.5">
                <label className="text-[12px] font-bold text-slate-600">Foto Hero</label>
                <div className="grid place-items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center text-slate-500">
                  <ImageIcon className="size-6" />
                  <div className="text-sm font-bold text-slate-700">Unggah foto hero</div>
                </div>
              </div>
              <div className="grid gap-1.5">
                <label className="text-[12px] font-bold text-slate-600">Judul Hero</label>
                <input
                  value={hero.title}
                  onChange={(e) => setHero({ ...hero, title: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-[12px] font-bold text-slate-600">Deskripsi Hero</label>
                <textarea
                  value={hero.description}
                  onChange={(e) => setHero({ ...hero, description: e.target.value })}
                  rows={3}
                  className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                />
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-[15px] font-bold text-slate-900">Quote Beranda</h2>
            </div>
            <div className="p-5">
              <div className="grid gap-1.5">
                <label className="text-[12px] font-bold text-slate-600">Quote Beranda</label>
                <textarea
                  value={quote}
                  onChange={(e) => setQuote(e.target.value)}
                  rows={4}
                  className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-[15px] font-bold text-slate-900">Alur Publikasi Tampilan</h3>
            </div>
            <div className="p-5">
              <div className="rounded-xl bg-blue-50 px-4 py-3 text-[12px] leading-relaxed text-blue-800">
                1. Preview template → 2. Gunakan Template (draft) → 3. Terapkan ke Website. Perubahan template tidak langsung mengubah website publik sebelum diterapkan.
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
