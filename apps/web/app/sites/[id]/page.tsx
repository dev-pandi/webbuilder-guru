"use client";

// Dashboard Guru — landing setiap site. Mirror mockup dashboard-guru/index.html:
// header aksi + 4 stat card + Aksi Cepat + Konten Terbaru (table) + chart +
// Tanggapan pending + Promosi preview + Template mini.

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowUpRight,
  BookOpen,
  ExternalLink,
  Eye,
  FileText,
  MessageSquare,
  Megaphone,
  Newspaper,
  PenLine,
  Plus,
} from "lucide-react";

type ChipTone = "green" | "gray" | "amber" | "red" | "blue" | "purple";

function Chip({ tone, children }: { tone: ChipTone; children: React.ReactNode }) {
  const tones: Record<ChipTone, string> = {
    green: "bg-emerald-100 text-emerald-800",
    gray: "bg-slate-100 text-slate-600",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-rose-100 text-rose-800",
    blue: "bg-blue-100 text-blue-800",
    purple: "bg-violet-100 text-violet-800",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

const stats = [
  {
    label: "Total Tulisan",
    value: "28",
    trend: "+12% bulan ini",
    trendPositive: true,
    icon: Newspaper,
    tint: "bg-orange-100 text-orange-600",
  },
  {
    label: "Total Views",
    value: "12.430",
    trend: "+18% bulan ini",
    trendPositive: true,
    icon: Eye,
    tint: "bg-blue-100 text-blue-600",
  },
  {
    label: "Tanggapan Pending",
    value: "5",
    trend: "Perlu ditinjau",
    trendPositive: false,
    icon: MessageSquare,
    tint: "bg-violet-100 text-violet-600",
  },
  {
    label: "Banner Promosi Aktif",
    value: "2",
    trend: "2 dari 3 banner",
    trendPositive: true,
    icon: Megaphone,
    tint: "bg-emerald-100 text-emerald-600",
  },
];

const contentRows = [
  { title: "Hati-hati dengan Spasi", rubrik: "Ceritaku", status: "Published", views: "1.248", tanggapan: "18", tone: "green" as ChipTone },
  { title: "Ketika Buku Mengubah Cara Pandang", rubrik: "Bacaanku", status: "Published", views: "972", tanggapan: "12", tone: "green" as ChipTone },
  { title: "Kelas yang Hidup dengan Pertanyaan", rubrik: "Inspirasiku", status: "Draft", views: "0", tanggapan: "0", tone: "gray" as ChipTone },
  { title: "Bahasa, Jembatan yang Menyatukan", rubrik: "Bangsaku", status: "Published", views: "1.084", tanggapan: "16", tone: "green" as ChipTone },
];

const chartBars = [28, 38, 46, 42, 57, 49, 68, 61, 76, 69, 89, 78];
const chartValues = ["410", "562", "681", "625", "842", "721", "1.008", "906", "1.129", "1.021", "1.318", "1.156"];

const pendingComments = [
  { initials: "AS", name: "Andi Saputra", time: "2 jam lalu", text: "Artikel ini sangat menginspirasi, terima kasih Bu!" },
  { initials: "SN", name: "Siti Nurhaliza", time: "5 jam lalu", text: "Saya jadi lebih semangat belajar setelah membaca tulisan ini." },
];

const themeMini = [
  { name: "Hangat & Personal", note: "Sedang digunakan", active: true, gradient: "linear-gradient(135deg,#f0d9cc,#fff)" },
  { name: "Modern", note: "Profesional", active: false, gradient: "linear-gradient(135deg,#e8eff7,#fff)" },
  { name: "Ceria", note: "Edukatif", active: false, gradient: "linear-gradient(135deg,#fff2b8,#e9f8ef)" },
  { name: "Minimal", note: "Editorial", active: false, gradient: "linear-gradient(135deg,#eceae5,#fff)" },
];

export default function SiteDashboardPage() {
  const params = useParams<{ id: string }>();
  const sid = params.id;

  return (
    <div className="space-y-5">
      {/* Page head */}
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            Selamat datang di Website Pribadi Guru
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Ringkasan aktivitas dan konten Website Pribadi Guru Anda.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/sites/${sid}/tampilan`}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50"
          >
            Preview Website
            <ExternalLink className="size-4" />
          </Link>
          <Link
            href={`/sites/${sid}/tulisan/new`}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
          >
            <Plus className="size-4" />
            Tulis Baru
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className={`grid h-12 w-12 place-items-center rounded-xl ${s.tint}`}>
                <Icon className="size-5" />
              </div>
              <div>
                <div className="text-[12px] text-slate-500">{s.label}</div>
                <div className="text-2xl font-bold leading-tight text-slate-900">{s.value}</div>
                <div
                  className={`text-[11px] font-bold ${
                    s.trendPositive ? "text-emerald-600" : "text-amber-600"
                  }`}
                >
                  {s.trend}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,0.8fr)]">
        {/* Left column */}
        <div className="space-y-5">
          {/* Aksi Cepat */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-[15px] font-bold text-slate-900">Aksi Cepat</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <QuickAction href={`/sites/${sid}/tulisan/new`} icon={PenLine} label="Tulis Artikel Baru" />
              <QuickAction href={`/sites/${sid}/forum/new`} icon={MessageSquare} label="Buat Topik Forum" />
              <QuickAction href={`/sites/${sid}/pembelajaran/new`} icon={BookOpen} label="Tambah Materi" />
              <QuickAction href={`/sites/${sid}/promosi`} icon={Megaphone} label="Unggah Banner Promo" />
            </div>
          </section>

          {/* Konten Terbaru */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-[15px] font-bold text-slate-900">Konten Terbaru</h2>
              <Link
                href={`/sites/${sid}/tulisan`}
                className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-[12px] font-bold text-blue-700 hover:bg-blue-100"
              >
                Lihat Semua →
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse">
                <thead>
                  <tr>
                    {["Judul", "Rubrik", "Status", "Views", "Tanggapan", "Aksi"].map((h) => (
                      <th
                        key={h}
                        className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contentRows.map((row) => (
                    <tr key={row.title} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="grid h-9 w-11 place-items-center rounded-lg bg-gradient-to-br from-slate-200 to-slate-300 text-slate-500">
                            <FileText className="size-4" />
                          </div>
                          <span className="text-[13px] font-semibold text-slate-900">
                            {row.title}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-[13px] text-slate-600">{row.rubrik}</td>
                      <td className="px-4 py-3.5">
                        <Chip tone={row.tone}>{row.status}</Chip>
                      </td>
                      <td className="px-4 py-3.5 text-[13px] text-slate-700">{row.views}</td>
                      <td className="px-4 py-3.5 text-[13px] text-slate-700">{row.tanggapan}</td>
                      <td className="px-4 py-3.5 text-slate-400">⋯</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Chart */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-[15px] font-bold text-slate-900">Statistik Kunjungan</h2>
              <Chip tone="blue">30 hari terakhir</Chip>
            </div>
            <div className="p-5">
              <div className="flex h-52 items-end gap-2.5 border-b border-slate-200 pt-4">
                {chartBars.map((h, i) => (
                  <div
                    key={i}
                    className="group relative flex-1 rounded-t-md bg-gradient-to-t from-blue-500 to-blue-400"
                    style={{ height: `${h}%` }}
                  >
                    <span className="pointer-events-none absolute -top-8 left-1/2 hidden -translate-x-1/2 rounded-md bg-slate-900 px-1.5 py-1 text-[10px] font-bold text-white group-hover:block">
                      {chartValues[i]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Tanggapan pending */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-[15px] font-bold text-slate-900">Tanggapan Menunggu</h2>
              <Link
                href={`/sites/${sid}/tanggapan`}
                className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-[12px] font-bold text-blue-700 hover:bg-blue-100"
              >
                Lihat Semua →
              </Link>
            </div>
            <div className="divide-y divide-slate-100">
              {pendingComments.map((c) => (
                <div key={c.name} className="px-5 py-4">
                  <div className="flex gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-orange-200 to-orange-400 text-[12px] font-bold text-orange-900">
                      {c.initials}
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-[13px] text-slate-900">{c.name}</strong>
                        <span className="text-[11px] text-slate-500">{c.time}</span>
                      </div>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-slate-600">{c.text}</p>
                      <div className="mt-2.5 flex gap-2">
                        <Link
                          href={`/sites/${sid}/tanggapan`}
                          className="rounded-lg bg-emerald-100 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-200"
                        >
                          Setujui
                        </Link>
                        <Link
                          href={`/sites/${sid}/tanggapan`}
                          className="rounded-lg bg-rose-100 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-200"
                        >
                          Tolak
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Ruang promosi preview */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-[15px] font-bold text-slate-900">Ruang Promosi</h2>
              <Link
                href={`/sites/${sid}/promosi`}
                className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-[12px] font-bold text-blue-700 hover:bg-blue-100"
              >
                Kelola Banner →
              </Link>
            </div>
            <div className="p-5">
              <div className="relative flex aspect-[2/1] items-end overflow-hidden rounded-xl bg-gradient-to-br from-blue-800 to-blue-500 p-5 text-white">
                <span className="absolute -right-8 -top-14 h-44 w-44 rounded-full bg-white/10" />
                <strong className="relative z-10 text-lg">Membaca Membuka Dunia</strong>
              </div>
              <div className="mt-3 flex items-center justify-between text-[12px]">
                <Chip tone="green">Aktif</Chip>
                <span className="text-slate-500">01 Sep – 30 Sep 2026</span>
              </div>
            </div>
          </section>

          {/* Template aktif */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-[15px] font-bold text-slate-900">Template Website Aktif</h2>
              <Link
                href={`/sites/${sid}/tampilan`}
                className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-[12px] font-bold text-blue-700 hover:bg-blue-100"
              >
                Ubah Template →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2.5 p-4">
              {themeMini.map((t) => (
                <div
                  key={t.name}
                  className={`rounded-xl border-2 p-2 ${
                    t.active ? "border-orange-500 bg-orange-50" : "border-transparent bg-slate-50"
                  }`}
                >
                  <div
                    className="mb-2 aspect-[16/10] rounded-md border border-slate-200"
                    style={{ background: t.gradient }}
                  />
                  <div className="text-[12px] font-bold text-slate-900">{t.name}</div>
                  <div className="text-[10px] text-slate-500">{t.note}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-[13px] font-bold text-slate-800 hover:bg-white hover:shadow-sm"
    >
      <span className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white">
        <Icon className="size-4 text-slate-700" />
      </span>
      {label}
      <ArrowUpRight className="ml-auto size-3.5 text-slate-400" />
    </Link>
  );
}
