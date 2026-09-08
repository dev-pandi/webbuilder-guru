"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  MessageSquare,
  Check,
  X,
  Trash2,
  AlertCircle,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  User,
} from "lucide-react";
import { toast } from "sonner";
import {
  api,
  RESPONSE_ROLE_LABEL,
  type ResponseItem,
  type ResponseStatus,
} from "@/lib/api";
import { Pagination, type PaginatedResult } from "@/components/Pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GuruFeatureNotice } from "@/components/GuruFeatureNotice";

type StatusFilter = "_all" | ResponseStatus;

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "_all", label: "Semua" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

function statusBadge(s: ResponseStatus) {
  if (s === "approved")
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="size-3" /> Approved
      </Badge>
    );
  if (s === "rejected")
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="size-3" /> Rejected
      </Badge>
    );
  return (
    <Badge variant="warning" className="gap-1">
      <Clock className="size-3" /> Pending
    </Badge>
  );
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const min = Math.round(diff / 60000);
  if (min < 1) return "baru saja";
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day} hari lalu`;
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function TanggapanPage() {
  const params = useParams<{ id: string }>();
  const [filter, setFilter] = useState<StatusFilter>("_all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedResult<ResponseItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => setPage(1), [filter]);

  async function refresh() {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), page_size: "20", sort: "newest" });
      if (filter !== "_all") p.set("status", filter);
      const r = await api<PaginatedResult<ResponseItem>>(
        `/api/v1/sites/${params.id}/responses?${p}`,
      );
      setData(r);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, filter, page]);

  async function moderate(r: ResponseItem, action: "approve" | "reject") {
    setActionLoading(`${action}-${r.id}`);
    try {
      await api(`/api/v1/responses/${r.id}/${action}`, { method: "POST" });
      toast.success(action === "approve" ? "Tanggapan disetujui" : "Tanggapan ditolak");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  async function remove(r: ResponseItem) {
    if (!confirm(`Hapus tanggapan dari ${r.author_name}?\n\nTindakan ini tidak dapat dibatalkan.`))
      return;
    setActionLoading(`delete-${r.id}`);
    try {
      await api(`/api/v1/responses/${r.id}`, { method: "DELETE" });
      toast.success("Tanggapan dihapus");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  const items = data?.items ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <GuruFeatureNotice
        title="Moderasi Tanggapan"
        description="Semua tanggapan baru masuk sebagai Pending. Hanya tanggapan yang disetujui yang tampil di website dan masuk ke hitungan publik. Anda dapat menyetujui, menolak, atau menghapus."
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-500/10">
              <MessageSquare className="size-4 text-violet-600" />
            </div>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Kelola Tanggapan
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Tanggapan</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {data ? `${data.total} tanggapan` : "Memuat data…"}
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1.5 border-b">
        {STATUS_TABS.map((t) => {
          const active = filter === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setFilter(t.value)}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition ${
                active
                  ? "border-primary font-semibold text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {err && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>
            <span className="font-medium">Gagal memuat:</span> {err}
          </span>
        </div>
      )}

      <div className={`space-y-3 ${loading ? "opacity-60" : ""}`}>
        {loading && !data ? (
          <>
            <div className="h-28 animate-pulse rounded-xl border bg-muted/50" />
            <div className="h-28 animate-pulse rounded-xl border bg-muted/50" />
            <div className="h-28 animate-pulse rounded-xl border bg-muted/50" />
          </>
        ) : items.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <MessageSquare className="size-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="font-medium">
                {filter === "_all" ? "Belum ada tanggapan" : `Tidak ada tanggapan ${filter}`}
              </p>
              <p className="text-sm text-muted-foreground">
                Tanggapan akan muncul di sini setelah pengunjung mengirimnya.
              </p>
            </div>
          </Card>
        ) : (
          items.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-full bg-muted">
                    <User className="size-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-semibold leading-tight">{r.author_name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {RESPONSE_ROLE_LABEL[r.author_role]} · {timeAgo(r.created_at)}
                    </p>
                  </div>
                </div>
                {statusBadge(r.status)}
              </div>

              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-foreground">
                {r.body}
              </p>

              <div className="mt-4 flex items-center justify-end gap-2 border-t pt-3">
                {r.status !== "approved" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => moderate(r, "approve")}
                    disabled={actionLoading !== null}
                    className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                  >
                    {actionLoading === `approve-${r.id}` ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Check className="size-3.5" />
                    )}
                    Setujui
                  </Button>
                )}
                {r.status !== "rejected" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => moderate(r, "reject")}
                    disabled={actionLoading !== null}
                    className="gap-1.5"
                  >
                    {actionLoading === `reject-${r.id}` ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <X className="size-3.5" />
                    )}
                    Tolak
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(r)}
                  disabled={actionLoading !== null}
                  className="gap-1.5 text-destructive hover:text-destructive"
                >
                  {actionLoading === `delete-${r.id}` ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  Hapus
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>

      {data && data.total_pages > 1 && (
        <Pagination
          page={page}
          totalPages={data.total_pages}
          total={data.total}
          pageSize={data.page_size}
          onPage={setPage}
        />
      )}
    </div>
  );
}
