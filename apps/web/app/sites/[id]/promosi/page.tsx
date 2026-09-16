"use client";

// Ruang Promosi — mirror mockup dashboard-guru/promosi.html.
// Banner rasio 2:1, dual approval Status Guru + Status Admin.

import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";

type AdminStatus = "allowed" | "blocked";

type Banner = {
  id: string;
  title: string;
  url: string;
  startDate: string;
  endDate: string;
  order: number;
  guruActive: boolean;
  adminStatus: AdminStatus;
  gradient: string;
};

const INITIAL: Banner[] = [
  {
    id: "1",
    title: "Membaca Membuka Dunia",
    url: "https://contoh.id/program-literasi",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    order: 1,
    guruActive: true,
    adminStatus: "allowed",
    gradient: "linear-gradient(135deg,#1e4f89,#77a9d9)",
  },
  {
    id: "2",
    title: "Pendidikan untuk Masa Depan",
    url: "https://contoh.id/pelatihan",
    startDate: "2026-09-10",
    endDate: "2026-10-10",
    order: 2,
    guruActive: true,
    adminStatus: "blocked",
    gradient: "linear-gradient(135deg,#8b5e3c,#e3b57a)",
  },
  {
    id: "3",
    title: "Berbagi Praktik Baik",
    url: "https://contoh.id/komunitas",
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    order: 3,
    guruActive: false,
    adminStatus: "allowed",
    gradient: "linear-gradient(135deg,#4f6577,#8faabd)",
  },
];

export default function PromosiPage() {
  const [banners, setBanners] = useState<Banner[]>(INITIAL);

  function update<K extends keyof Banner>(id: string, key: K, value: Banner[K]) {
    setBanners((prev) => prev.map((b) => (b.id === id ? { ...b, [key]: value } : b)));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            Ruang Promosi
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Kelola banner promosi yang tampil di Beranda Website Pribadi Guru.
          </p>
        </div>
        <button
          onClick={() => toast.success("Fitur tambah banner masih mockup")}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
        >
          <Plus className="size-4" />
          Tambah Banner
        </button>
      </div>

      <div className="rounded-xl bg-blue-50 px-4 py-3 text-[13px] text-blue-800">
        <strong>Rasio 2:1</strong> — gunakan banner full-image. Banner tampil hanya jika Status Guru aktif dan Status Admin diizinkan.
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {banners.map((b) => (
          <div key={b.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div
              className="flex aspect-[2/1] items-end rounded-xl p-4 text-lg font-bold text-white"
              style={{ background: b.gradient }}
            >
              {b.title}
            </div>

            <div className="mt-3 grid gap-3">
              <div className="grid gap-1.5">
                <label className="text-[12px] font-bold text-slate-600">URL Tujuan</label>
                <input
                  value={b.url}
                  onChange={(e) => update(b.id, "url", e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <label className="text-[12px] font-bold text-slate-600">Tanggal Mulai</label>
                  <input
                    type="date"
                    value={b.startDate}
                    onChange={(e) => update(b.id, "startDate", e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-[12px] font-bold text-slate-600">Tanggal Selesai</label>
                  <input
                    type="date"
                    value={b.endDate}
                    onChange={(e) => update(b.id, "endDate", e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-[13px]">
                <strong className="text-slate-700">Urutan</strong>
                <select
                  value={b.order}
                  onChange={(e) => update(b.id, "order", Number(e.target.value))}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400"
                >
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between text-[13px]">
                <strong className="text-slate-700">Status Guru</strong>
                <label className="inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={b.guruActive}
                    onChange={(e) => update(b.id, "guruActive", e.target.checked)}
                    className="peer sr-only"
                  />
                  <span className="relative h-6 w-11 rounded-full bg-slate-300 transition-colors peer-checked:bg-emerald-500">
                    <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
                  </span>
                  <span className="text-[12px] font-bold text-slate-700">
                    {b.guruActive ? "Aktif" : "Nonaktif"}
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-between text-[13px]">
                <strong className="text-slate-700">Status Admin</strong>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    b.adminStatus === "allowed"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {b.adminStatus === "allowed" ? "Diizinkan" : "Tidak diizinkan"}
                </span>
              </div>

              {b.adminStatus === "blocked" && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12px] font-bold text-rose-700">
                  Dinonaktifkan oleh Admin
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => toast.success("Urutan banner diperbarui")}
                  className="rounded-lg bg-blue-50 px-3 py-2 text-[12px] font-bold text-blue-700 hover:bg-blue-100"
                >
                  Atur Urutan
                </button>
                <button
                  onClick={() => toast.success("Perubahan disimpan")}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-bold text-slate-700 hover:bg-slate-50"
                >
                  Simpan
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
