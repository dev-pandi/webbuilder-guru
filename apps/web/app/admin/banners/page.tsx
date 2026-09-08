"use client";

// /admin/banners — Moderasi banner promosi cross-site (spec §27).
// Admin dapat aktifkan/nonaktifkan banner guru. Efek langsung ke:
//   - carousel di website guru
//   - carousel di Ruang Promosi Portal Utama

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  ExternalLink,
  Loader2,
  Megaphone,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import {
  api,
  BANNER_STATUS_LABEL,
  type AdminBannerView,
  type BannerEffectiveStatus,
} from "@/lib/api";
import { Pagination, useDebounced, type PaginatedResult } from "@/components/Pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Filter = "_all" | "admin_enabled" | "admin_disabled";

const FILTER_OPTIONS: { value: Filter; label: string }[] = [
  { value: "_all", label: "Semua" },
  { value: "admin_enabled", label: "Diizinkan Admin" },
  { value: "admin_disabled", label: "Dinonaktifkan Admin" },
];

function statusBadge(s: BannerEffectiveStatus) {
  const label = BANNER_STATUS_LABEL[s];
  switch (s) {
    case "active":
      return <Badge variant="success">{label}</Badge>;
    case "teacher_off":
      return <Badge variant="secondary">{label}</Badge>;
    case "admin_disabled":
      return (
        <Badge variant="destructive" className="gap-1">
          <ShieldOff className="size-3" /> {label}
        </Badge>
      );
    case "not_started":
      return <Badge variant="warning">{label}</Badge>;
    case "ended":
      return <Badge variant="secondary">{label}</Badge>;
  }
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminBannersPage() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Filter>("_all");
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [data, setData] = useState<PaginatedResult<AdminBannerView> | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [disableTarget, setDisableTarget] = useState<AdminBannerView | null>(null);
  const [disableReason, setDisableReason] = useState("");

  useEffect(() => setPage(1), [filter, debouncedQ]);

  async function refresh() {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), page_size: "20" });
      if (filter !== "_all") p.set("status", filter);
      const r = await api<PaginatedResult<AdminBannerView>>(
        `/api/v1/admin/banners?${p}`,
      );
      // Client-side filter Q (endpoint tidak support q untuk sekarang — sederhana).
      if (debouncedQ) {
        const needle = debouncedQ.toLowerCase();
        r.items = r.items.filter(
          (b) =>
            b.internal_title.toLowerCase().includes(needle) ||
            b.site_name.toLowerCase().includes(needle) ||
            b.owner_name.toLowerCase().includes(needle),
        );
      }
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
  }, [page, filter, debouncedQ]);

  async function enable(b: AdminBannerView) {
    setActionLoading(`enable-${b.id}`);
    try {
      await api(`/api/v1/admin/banners/${b.id}/set-enabled`, {
        method: "POST",
        body: JSON.stringify({ enabled: true, reason: "" }),
      });
      toast.success(`Banner "${b.internal_title}" diaktifkan`);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  async function confirmDisable() {
    if (!disableTarget) return;
    setActionLoading(`disable-${disableTarget.id}`);
    try {
      await api(`/api/v1/admin/banners/${disableTarget.id}/set-enabled`, {
        method: "POST",
        body: JSON.stringify({ enabled: false, reason: disableReason }),
      });
      toast.success(`Banner "${disableTarget.internal_title}" dinonaktifkan`);
      setDisableTarget(null);
      setDisableReason("");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-500/10">
              <Megaphone className="size-4 text-violet-600" />
            </div>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Moderasi Platform
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Banner Guru</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Kelola banner promosi seluruh guru. Penonaktifan admin berlaku
            langsung di website guru dan Ruang Promosi Portal.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari judul, situs, atau guru…"
            className="h-9 border-transparent bg-muted/40 pl-9 focus:border-input focus:bg-background"
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger className="h-9 w-52 border-transparent bg-muted/40 focus:border-input">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTER_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {err && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>
            <span className="font-medium">Gagal memuat:</span> {err}
          </span>
        </div>
      )}

      <div className={loading ? "opacity-60" : ""}>
        {loading && !data ? (
          <div className="space-y-3">
            <div className="h-28 animate-pulse rounded-xl border bg-muted/50" />
            <div className="h-28 animate-pulse rounded-xl border bg-muted/50" />
          </div>
        ) : items.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Megaphone className="size-5 text-muted-foreground" />
            </div>
            <p className="font-medium">
              {debouncedQ || filter !== "_all"
                ? "Tidak ada banner sesuai filter"
                : "Belum ada banner terdaftar"}
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((b) => (
              <Card key={b.id} className="p-4">
                <div className="flex gap-4">
                  <div className="relative w-48 shrink-0 overflow-hidden rounded-lg bg-muted">
                    <div className="aspect-[2/1]">
                      {b.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={b.image_url}
                          alt={b.alt_text}
                          className="size-full object-cover"
                        />
                      ) : null}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="line-clamp-1 font-semibold">{b.internal_title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{b.owner_name}</span>
                          {" · "}
                          <span>{b.site_name}</span>
                        </p>
                      </div>
                      {statusBadge(b.effective_status)}
                    </div>

                    <a
                      href={b.target_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                    >
                      <ExternalLink className="size-3" />
                      <span className="line-clamp-1">{b.target_url}</span>
                    </a>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                      <div>
                        <span className="font-medium text-foreground">Mulai:</span>{" "}
                        {fmtDate(b.start_at)}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Berakhir:</span>{" "}
                        {fmtDate(b.end_at)}
                      </div>
                    </div>

                    {!b.admin_enabled && b.admin_disabled_reason && (
                      <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                        <ShieldAlert className="size-3.5 shrink-0" />
                        <span>
                          <span className="font-semibold">Alasan penonaktifan: </span>
                          {b.admin_disabled_reason}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-2 border-t pt-2">
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>Guru:</span>
                        {b.teacher_active ? (
                          <Badge variant="secondary" className="gap-0.5">
                            <ShieldCheck className="size-3" /> aktif
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-0.5">
                            <ShieldOff className="size-3" /> nonaktif
                          </Badge>
                        )}
                        <span>Admin:</span>
                        {b.admin_enabled ? (
                          <Badge variant="success" className="gap-0.5">
                            <ShieldCheck className="size-3" /> diizinkan
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="gap-0.5">
                            <ShieldOff className="size-3" /> ditolak
                          </Badge>
                        )}
                      </div>
                      <div className="flex-1" />
                      {b.admin_enabled ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setDisableTarget(b);
                            setDisableReason("");
                          }}
                          disabled={actionLoading !== null}
                          className="gap-1.5"
                        >
                          <ShieldOff className="size-3.5" /> Nonaktifkan
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => enable(b)}
                          disabled={actionLoading !== null}
                          className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                        >
                          {actionLoading === `enable-${b.id}` ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <ShieldCheck className="size-3.5" />
                          )}
                          Izinkan Kembali
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
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

      <Dialog
        open={!!disableTarget}
        onOpenChange={(v) => {
          if (!v) {
            setDisableTarget(null);
            setDisableReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nonaktifkan banner?</DialogTitle>
            <DialogDescription>
              Banner ini akan langsung disembunyikan dari website guru dan Ruang
              Promosi Portal. Guru masih dapat melihat banner di dashboardnya.
            </DialogDescription>
          </DialogHeader>
          {disableTarget && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-semibold">{disableTarget.internal_title}</p>
              <p className="text-xs text-muted-foreground">
                {disableTarget.owner_name} · {disableTarget.site_name}
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="reason">Alasan (opsional, ditampilkan ke guru)</Label>
            <Textarea
              id="reason"
              value={disableReason}
              onChange={(e) => setDisableReason(e.target.value)}
              rows={3}
              placeholder="Contoh: Konten tidak sesuai dengan pedoman platform."
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDisableTarget(null);
                setDisableReason("");
              }}
              disabled={actionLoading !== null}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDisable}
              disabled={actionLoading !== null}
              className="gap-2"
            >
              {actionLoading?.startsWith("disable-") ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ShieldOff className="size-4" />
              )}
              Nonaktifkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
