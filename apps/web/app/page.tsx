import Link from "next/link";
import { ArrowRight, Globe2, Download, MousePointer2, LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const features = [
  {
    icon: MousePointer2,
    title: "Editor Visual Drag-and-Drop",
    desc: "Susun halaman dengan block siap pakai. Tidak perlu menulis HTML.",
  },
  {
    icon: Globe2,
    title: "Custom Domain & SSL Otomatis",
    desc: "Pakai domain sendiri (contoh: tokoanda.id). SSL diurus otomatis via Caddy.",
  },
  {
    icon: Download,
    title: "Export ke HTML/CSS/JS",
    desc: "Unduh hasil website sebagai file statis untuk hosting di mana saja.",
  },
  {
    icon: LayoutTemplate,
    title: "Template Siap Pakai",
    desc: "5 kategori × 3 tema — Sekolah, UMKM, Portofolio, Guru, Blog.",
  },
];

const templates = [
  { slug: "school", label: "Sekolah", emoji: "🎓" },
  { slug: "umkm", label: "UMKM / Toko", emoji: "🛍️" },
  { slug: "portfolio", label: "Portofolio", emoji: "💼" },
  { slug: "teacher", label: "Guru", emoji: "👨‍🏫" },
  { slug: "blog", label: "Blog", emoji: "📝" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="text-lg font-bold tracking-tight">
          Web<span className="text-primary">Builder</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link href="/login">Masuk</Link>
          </Button>
          <Button asChild>
            <Link href="/register">Daftar Gratis</Link>
          </Button>
        </div>
      </nav>

      <section className="mx-auto max-w-6xl px-6 pt-16 pb-24 text-center">
        <h1 className="mx-auto max-w-3xl text-5xl font-bold tracking-tight sm:text-6xl">
          Buat Website Profesional <span className="text-primary">Tanpa Coding</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Untuk sekolah, UMKM, portofolio, guru, dan blogger. Editor visual, custom domain, SSL
          otomatis, dan export ke file statis. Semua dalam satu platform.
        </p>
        <div className="mt-10 flex items-center justify-center gap-3">
          <Button size="lg" asChild>
            <Link href="/register">
              Mulai Gratis <ArrowRight />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="#template">Lihat Template</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <Card key={f.title} className="p-6">
              <f.icon className="size-6 text-primary" />
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      <section id="template" className="mx-auto max-w-6xl px-6 pb-24">
        <h2 className="text-3xl font-bold tracking-tight">Pilih Template</h2>
        <p className="mt-2 text-muted-foreground">
          Tiap kategori punya 3 tema: Modern, Clean, Professional.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {templates.map((t) => (
            <Card
              key={t.slug}
              className="p-6 text-center transition hover:border-primary hover:shadow-md"
            >
              <div className="text-4xl">{t.emoji}</div>
              <div className="mt-3 font-medium">{t.label}</div>
            </Card>
          ))}
        </div>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} WebBuilder. Dibuat dengan Next.js + Go Fiber.
      </footer>
    </main>
  );
}
