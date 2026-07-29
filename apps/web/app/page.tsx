import Link from "next/link";
import {
  ArrowRight,
  Blocks,
  Briefcase,
  CheckCircle2,
  Download,
  FileText,
  GraduationCap,
  LayoutTemplate,
  MousePointer2,
  Palette,
  Rocket,
  Shield,
  ShoppingBag,
  Sparkles,
  User,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: MousePointer2,
    title: "Editor Visual Drag-and-Drop",
    desc: "Susun halaman dengan block siap pakai. Tanpa perlu satu baris kode.",
    color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  {
    icon: Shield,
    title: "Custom Domain & SSL Otomatis",
    desc: "Pakai domain sendiri (tokoanda.id). SSL diurus otomatis, siap 24/7.",
    color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    icon: Download,
    title: "Export ke HTML/CSS/JS",
    desc: "Unduh sebagai file statis. Hosting bebas — Netlify, Vercel, atau server sendiri.",
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  {
    icon: Palette,
    title: "Template + Tema Modern",
    desc: "5 kategori × 3 tema. Ganti warna, font, dan layout dalam hitungan detik.",
    color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
];

const templates = [
  {
    slug: "school",
    label: "Sekolah",
    desc: "Info sekolah, PPDB, prestasi siswa",
    icon: GraduationCap,
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  {
    slug: "umkm",
    label: "UMKM / Toko",
    desc: "Katalog produk, keranjang, pembayaran",
    icon: ShoppingBag,
    color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    slug: "portfolio",
    label: "Portofolio",
    desc: "Showcase karya, CV, kontak",
    icon: Briefcase,
    color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  {
    slug: "teacher",
    label: "Guru",
    desc: "Materi ajar, jadwal, kontak wali murid",
    icon: User,
    color: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  },
  {
    slug: "blog",
    label: "Blog",
    desc: "Artikel, kategori, komentar",
    icon: FileText,
    color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
];

const steps = [
  {
    n: "01",
    icon: LayoutTemplate,
    title: "Pilih template",
    desc: "Mulai dari salah satu dari 5 kategori. Semua sudah responsif dan SEO-friendly.",
  },
  {
    n: "02",
    icon: Blocks,
    title: "Kustom via editor",
    desc: "Drag block, ganti teks & gambar, atur tema. Preview real-time di semua ukuran layar.",
  },
  {
    n: "03",
    icon: Rocket,
    title: "Publikasikan",
    desc: "Tempel di custom domain Anda — SSL otomatis. Atau export sebagai file statis.",
  },
];

const audiences = [
  "Sekolah & instansi pendidikan",
  "UMKM & pemilik toko online",
  "Guru & tenaga pengajar",
  "Freelancer & profesional",
  "Blogger & konten kreator",
  "Reseller & agency",
];

export default function Home() {
  return (
    <main className="relative min-h-screen bg-background">
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[600px] overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute left-[10%] top-[15%] h-[300px] w-[500px] rounded-full bg-violet-500/5 blur-3xl" />
        <div className="absolute right-[10%] top-[10%] h-[350px] w-[500px] rounded-full bg-blue-500/5 blur-3xl" />
      </div>

      {/* Nav */}
      <nav className="sticky top-0 z-40 border-b border-border/40 bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary shadow-sm shadow-primary/20">
              <Sparkles className="size-4 text-primary-foreground" />
            </div>
            Web<span className="text-primary">Builder</span>
          </Link>
          <div className="flex items-center gap-1">
            <Button variant="ghost" asChild className="hidden sm:inline-flex">
              <Link href="#fitur">Fitur</Link>
            </Button>
            <Button variant="ghost" asChild className="hidden sm:inline-flex">
              <Link href="#template">Template</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/login">Masuk</Link>
            </Button>
            <Button asChild className="gap-1.5 shadow-sm">
              <Link href="/register">
                Daftar Gratis
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-20 pb-24 text-center sm:pt-28">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border bg-background/80 px-4 py-1.5 text-xs font-medium shadow-sm backdrop-blur-sm">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          <span className="text-muted-foreground">
            Beli domain + buat situs dalam 1 alur
          </span>
        </div>

        <h1 className="mx-auto max-w-4xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
          Buat Website Profesional{" "}
          <span className="bg-gradient-to-r from-primary via-violet-500 to-blue-500 bg-clip-text text-transparent">
            Tanpa Coding
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Untuk sekolah, UMKM, portofolio, guru, dan blogger. Editor visual,
          custom domain, SSL otomatis, dan export ke file statis. Semua dalam
          satu platform.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" asChild className="h-12 gap-2 px-6 shadow-md shadow-primary/20">
            <Link href="/register">
              Mulai Gratis
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild className="h-12 px-6">
            <Link href="#template">Lihat Template</Link>
          </Button>
        </div>

        <div className="mx-auto mt-10 flex max-w-2xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-emerald-500" />
            Tanpa kartu kredit
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-emerald-500" />
            SSL otomatis
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-emerald-500" />
            Export file statis
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-emerald-500" />
            Custom domain
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="fitur" className="mx-auto max-w-6xl px-6 pb-24">
        <div className="mb-12 text-center">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-primary">
            <Zap className="size-3" />
            Fitur Lengkap
          </div>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Semua yang Anda butuhkan
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
            Dari editor visual sampai deployment ke domain sendiri — tanpa
            perlu integrasi tambahan.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="group rounded-2xl border bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
              >
                <div className={`inline-flex size-11 items-center justify-center rounded-xl ${f.color}`}>
                  <Icon className="size-5" />
                </div>
                <h3 className="mt-4 font-semibold leading-tight">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {f.desc}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-12 text-center">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-primary">
              <Rocket className="size-3" />
              Cara Kerja
            </div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              3 langkah ke online
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
              Dari tanpa ide sampai website live di custom domain.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {steps.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={s.n} className="relative">
                  {/* Connector line di desktop antara step */}
                  {i < steps.length - 1 && (
                    <div className="absolute left-full top-8 hidden h-px w-full bg-gradient-to-r from-border to-transparent md:block" />
                  )}
                  <div className="relative rounded-2xl border bg-card p-6 shadow-sm">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="size-5" />
                      </div>
                      <span className="text-xs font-mono font-bold text-muted-foreground">
                        {s.n}
                      </span>
                    </div>
                    <h3 className="font-semibold">{s.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {s.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Templates */}
      <section id="template" className="mx-auto max-w-6xl px-6 py-24">
        <div className="mb-12 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-primary">
              <LayoutTemplate className="size-3" />
              Template
            </div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Pilih dari 5 kategori
            </h2>
            <p className="mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
              Tiap kategori punya 3 tema (Modern, Clean, Professional). Semua
              sudah responsif + SEO-friendly.
            </p>
          </div>
          <Button variant="outline" asChild className="gap-1.5">
            <Link href="/register">
              Coba semua template
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {templates.map((t) => {
            const Icon = t.icon;
            return (
              <Link
                key={t.slug}
                href="/register"
                className="group flex flex-col rounded-2xl border bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-md"
              >
                <div className={`mb-4 inline-flex size-12 items-center justify-center rounded-xl ${t.color}`}>
                  <Icon className="size-6" />
                </div>
                <h3 className="font-semibold">{t.label}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {t.desc}
                </p>
                <div className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  Lihat template
                  <ArrowRight className="size-3" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Audience */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-10 md:grid-cols-2 md:items-center">
            <div>
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-primary">
                <User className="size-3" />
                Cocok Untuk
              </div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Dibuat untuk semua
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
                Website yang Anda butuhkan tanpa ribetnya coding, hosting, dan
                setup SSL. Cukup pilih template, atur konten, dan publikasikan.
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {audiences.map((a) => (
                <li
                  key={a}
                  className="flex items-center gap-2 rounded-lg border bg-background px-4 py-3 text-sm shadow-sm"
                >
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                  {a}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/10 via-primary/5 to-background p-10 text-center sm:p-14">
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute left-1/2 top-0 h-64 w-96 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
          </div>
          <div className="mb-4 inline-flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
            <Sparkles className="size-6" />
          </div>
          <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
            Siap online hari ini?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground sm:text-base">
            Daftar gratis, coba editornya, lalu upgrade domain kapan saja Anda
            siap. Tidak ada komitmen.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild className="h-12 gap-2 px-6 shadow-md shadow-primary/20">
              <Link href="/register">
                Buat Website Sekarang
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="h-12 px-6">
              <Link href="/daftar-reseller">Saya reseller / agency</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-muted/20">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="mb-3 flex items-center gap-2 text-sm font-bold">
                <div className="flex size-7 items-center justify-center rounded-md bg-primary">
                  <Sparkles className="size-3.5 text-primary-foreground" />
                </div>
                Web<span className="text-primary">Builder</span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Platform website builder untuk UMKM, sekolah, dan profesional
                Indonesia.
              </p>
            </div>
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Produk
              </h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="#fitur" className="text-muted-foreground hover:text-foreground">
                    Fitur
                  </Link>
                </li>
                <li>
                  <Link href="#template" className="text-muted-foreground hover:text-foreground">
                    Template
                  </Link>
                </li>
                <li>
                  <Link href="/register" className="text-muted-foreground hover:text-foreground">
                    Daftar Gratis
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Untuk Bisnis
              </h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/daftar-reseller" className="text-muted-foreground hover:text-foreground">
                    Daftar Reseller
                  </Link>
                </li>
                <li>
                  <Link href="/login" className="text-muted-foreground hover:text-foreground">
                    Masuk Portal
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Akun
              </h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/login" className="text-muted-foreground hover:text-foreground">
                    Masuk
                  </Link>
                </li>
                <li>
                  <Link href="/register" className="text-muted-foreground hover:text-foreground">
                    Daftar
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t pt-6 text-xs text-muted-foreground sm:flex-row">
            <p>© {new Date().getFullYear()} WebBuilder. All rights reserved.</p>
            <p>Dibuat dengan Next.js + Go Fiber.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
