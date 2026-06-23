import Link from "next/link";

const features = [
  {
    title: "Editor Visual Drag-and-Drop",
    desc: "Susun halaman dengan block siap pakai. Tidak perlu menulis HTML.",
  },
  {
    title: "Custom Domain & SSL Otomatis",
    desc: "Pakai domain sendiri (contoh: tokoanda.id). SSL diurus otomatis.",
  },
  {
    title: "Export ke HTML/CSS/JS",
    desc: "Unduh hasil website sebagai file statis untuk hosting di mana saja.",
  },
  {
    title: "Template Siap Pakai",
    desc: "Sekolah, UMKM, portofolio, guru, blog — pilih dan langsung edit.",
  },
];

const templates = [
  { slug: "school-classic", label: "Sekolah", emoji: "🎓" },
  { slug: "umkm-toko", label: "UMKM / Toko", emoji: "🛍️" },
  { slug: "portfolio-personal", label: "Portofolio", emoji: "💼" },
  { slug: "teacher-profile", label: "Guru", emoji: "👨‍🏫" },
  { slug: "blog-magazine", label: "Blog", emoji: "📝" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="text-lg font-bold tracking-tight">Web<span className="text-brand-600">Builder</span></div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/login" className="text-slate-600 hover:text-slate-900">Masuk</Link>
          <Link
            href="/register"
            className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white shadow-sm hover:bg-brand-700"
          >
            Daftar Gratis
          </Link>
        </div>
      </nav>

      <section className="mx-auto max-w-6xl px-6 pt-16 pb-24 text-center">
        <h1 className="mx-auto max-w-3xl text-5xl font-bold tracking-tight text-slate-900 sm:text-6xl">
          Buat Website Profesional <span className="text-brand-600">Tanpa Coding</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
          Untuk sekolah, UMKM, portofolio, guru, dan blogger. Editor visual, custom domain, SSL otomatis,
          dan export ke file statis. Semua dalam satu platform.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            href="/register"
            className="rounded-lg bg-brand-600 px-6 py-3 font-medium text-white shadow-sm hover:bg-brand-700"
          >
            Mulai Gratis
          </Link>
          <Link
            href="#template"
            className="rounded-lg border border-slate-300 px-6 py-3 font-medium text-slate-700 hover:bg-white"
          >
            Lihat Template
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="template" className="mx-auto max-w-6xl px-6 pb-24">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Pilih Template</h2>
        <p className="mt-2 text-slate-600">Mulai dari template yang sudah dirancang khusus.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {templates.map((t) => (
            <div
              key={t.slug}
              className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm transition hover:border-brand-500 hover:shadow-md"
            >
              <div className="text-4xl">{t.emoji}</div>
              <div className="mt-3 font-medium text-slate-900">{t.label}</div>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} WebBuilder. Dibuat dengan Next.js + Go Fiber.
      </footer>
    </main>
  );
}
