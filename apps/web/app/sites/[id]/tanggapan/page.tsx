"use client";

// Tanggapan moderation — mirror mockup dashboard-guru/tanggapan.html.
// 4 tab: Pending / Approved / Rejected / Semua. Action tombol update
// local state (mockup) — belum panggil API.

import { useMemo, useState } from "react";
import { toast } from "sonner";

type Status = "pending" | "approved" | "rejected";
type Tab = Status | "all";

type Comment = {
  id: string;
  source: string;
  author: string;
  date: string;
  text: string;
  status: Status;
};

const INITIAL: Comment[] = [
  { id: "1", source: "Hati-hati dengan Spasi", author: "Andi Saputra", date: "15 Sep 2026", text: "Artikel ini sangat menginspirasi, terima kasih Bu!", status: "pending" },
  { id: "2", source: "Ketika Buku Mengubah Cara Pandang", author: "Siti Nurhaliza", date: "14 Sep 2026", text: "Saya jadi ingin membaca buku yang Ibu rekomendasikan.", status: "approved" },
  { id: "3", source: "Forum Diskusi: AI dalam Menulis", author: "Rizky Maulana", date: "13 Sep 2026", text: "Komentar contoh yang tidak sesuai pedoman diskusi.", status: "rejected" },
];

const TAB_LABEL: Record<Tab, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  all: "Semua",
};

function StatusChip({ status }: { status: Status }) {
  const map: Record<Status, string> = {
    pending: "bg-amber-100 text-amber-800",
    approved: "bg-emerald-100 text-emerald-800",
    rejected: "bg-rose-100 text-rose-800",
  };
  const label: Record<Status, string> = {
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${map[status]}`}>
      {label[status]}
    </span>
  );
}

export default function TanggapanPage() {
  const [tab, setTab] = useState<Tab>("pending");
  const [comments, setComments] = useState<Comment[]>(INITIAL);

  const visible = useMemo(() => {
    if (tab === "all") return comments;
    return comments.filter((c) => c.status === tab);
  }, [comments, tab]);

  function setStatus(id: string, next: Status) {
    setComments((prev) => prev.map((c) => (c.id === id ? { ...c, status: next } : c)));
    toast.success(next === "approved" ? "Tanggapan disetujui" : "Tanggapan ditolak");
  }

  function remove(id: string) {
    setComments((prev) => prev.filter((c) => c.id !== id));
    toast.success("Tanggapan dihapus");
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Tanggapan</h1>
        <p className="mt-1 text-sm text-slate-500">
          Moderasi komentar sebelum tampil di website publik.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex gap-2 border-b border-slate-200 px-5">
          {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`border-b-2 px-1 py-3.5 text-[13px] font-bold transition ${
                tab === t
                  ? "border-orange-500 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>

        <div className="grid gap-3 p-5">
          {visible.map((c) => (
            <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-[12px] font-bold text-blue-700">{c.source}</div>
              <div className="mt-1 text-[11px] text-slate-500">
                {c.author} · {c.date}
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-700">{c.text}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusChip status={c.status} />
                {c.status === "pending" && (
                  <>
                    <button
                      onClick={() => setStatus(c.id, "approved")}
                      className="rounded-lg bg-emerald-100 px-3 py-1.5 text-[12px] font-bold text-emerald-700 hover:bg-emerald-200"
                    >
                      Setujui
                    </button>
                    <button
                      onClick={() => setStatus(c.id, "rejected")}
                      className="rounded-lg bg-rose-100 px-3 py-1.5 text-[12px] font-bold text-rose-700 hover:bg-rose-200"
                    >
                      Tolak
                    </button>
                  </>
                )}
                <button
                  onClick={() => remove(c.id)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-700 hover:bg-slate-50"
                >
                  Hapus
                </button>
              </div>
            </div>
          ))}
          {visible.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
              Tidak ada tanggapan pada tab ini
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
