"use client";

// Tanggapan moderation — mirror mockup dashboard-guru/tanggapan.html.
// Wired ke /api/v1/sites/:id/responses + POST /responses/:id/approve|reject
// + DELETE /responses/:id. Tab filter server-side (query ?status=).

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, RESPONSE_ROLE_LABEL, type ResponseItem, type ResponseStatus } from "@/lib/api";
import type { PaginatedResult } from "@/components/Pagination";

type Tab = ResponseStatus | "all";

const TAB_LABEL: Record<Tab, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  all: "Semua",
};

function StatusChip({ status }: { status: ResponseStatus }) {
  const map: Record<ResponseStatus, string> = {
    pending: "bg-amber-100 text-amber-800",
    approved: "bg-emerald-100 text-emerald-800",
    rejected: "bg-rose-100 text-rose-800",
  };
  const label: Record<ResponseStatus, string> = {
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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TanggapanPage() {
  const params = useParams<{ id: string }>();
  const sid = params.id;
  const [tab, setTab] = useState<Tab>("pending");
  const [items, setItems] = useState<ResponseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: "1", page_size: "50" });
      if (tab !== "all") p.set("status", tab);
      const r = await api<PaginatedResult<ResponseItem>>(
        `/api/v1/sites/${sid}/responses?${p}`,
      );
      setItems(r.items);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid, tab]);

  const visible = useMemo(() => items, [items]);

  async function moderate(id: string, action: "approve" | "reject") {
    setBusyId(id);
    try {
      await api(`/api/v1/responses/${id}/${action}`, { method: "POST" });
      toast.success(action === "approve" ? "Tanggapan disetujui" : "Tanggapan ditolak");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Hapus tanggapan ini?")) return;
    setBusyId(id);
    try {
      await api(`/api/v1/responses/${id}`, { method: "DELETE" });
      toast.success("Tanggapan dihapus");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
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

        <div className={`grid gap-3 p-5 ${loading ? "opacity-60" : ""}`}>
          {visible.map((c) => (
            <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[12px] font-bold text-blue-700">
                  {c.article_id
                    ? `Artikel #${c.article_id.slice(0, 8)}`
                    : c.learning_material_id
                      ? `Pembelajaran #${c.learning_material_id.slice(0, 8)}`
                      : "—"}
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {RESPONSE_ROLE_LABEL[c.author_role]}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                {c.author_name} · {fmtDate(c.created_at)}
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-700">{c.body}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusChip status={c.status} />
                {c.status !== "approved" && (
                  <button
                    onClick={() => moderate(c.id, "approve")}
                    disabled={busyId === c.id}
                    className="rounded-lg bg-emerald-100 px-3 py-1.5 text-[12px] font-bold text-emerald-700 hover:bg-emerald-200 disabled:opacity-50"
                  >
                    Setujui
                  </button>
                )}
                {c.status !== "rejected" && (
                  <button
                    onClick={() => moderate(c.id, "reject")}
                    disabled={busyId === c.id}
                    className="rounded-lg bg-rose-100 px-3 py-1.5 text-[12px] font-bold text-rose-700 hover:bg-rose-200 disabled:opacity-50"
                  >
                    Tolak
                  </button>
                )}
                <button
                  onClick={() => remove(c.id)}
                  disabled={busyId === c.id}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Hapus
                </button>
              </div>
            </div>
          ))}
          {!loading && visible.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
              Tidak ada tanggapan pada tab ini
            </div>
          )}
          {loading && visible.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-500">
              <Loader2 className="mx-auto size-4 animate-spin" />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
