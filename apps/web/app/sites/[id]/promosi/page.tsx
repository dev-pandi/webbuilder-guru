"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Megaphone,
  Plus,
  Pencil,
  Trash2,
  AlertCircle,
  Loader2,
  ExternalLink,
  ShieldAlert,
  ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  api,
  BANNER_STATUS_LABEL,
  type Banner,
  type BannerEffectiveStatus,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GuruFeatureNotice } from "@/components/GuruFeatureNotice";
import { BannerForm } from "./BannerForm";

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
          <ShieldAlert className="size-3" /> {label}
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

export default function PromosiPage() {
  const params = useParams<{ id: string }>();
  const [items, setItems] = useState<Banner[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Banner | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const r = await api<Banner[]>(`/api/v1/sites/${params.id}/banners`);
      setItems(r);
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
  }, [params.id]);

  async function toggleActive(b: Banner) {
    setActionLoading(`toggle-${b.id}`);
    try {
      await api(`/api/v1/banners/${b.id}`, {
        method: "PATCH",
        body: JSON.stringify({ teacher_active: !b.teacher_active }),
      });
      toast.success(
        b.teacher_active ? "Banner dinonaktifkan" : "Banner diaktifkan",
      );
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  async function remove(b: Banner) {
    if (!confirm(`Hapus banner "${b.internal_title}"?\n\nTindakan ini tidak dapat dibatalkan.`))
      return;
    setActionLoading(`delete-${b.id}`);
    try {
      await api(`/api/v1/banners/${b.id}`, { method: "DELETE" });
      toast.success("Banner dihapus");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  const list = items ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <GuruFeatureNotice
        title="Ruang Promosi"
        description="Banner promosi tampil di beranda website Anda dengan rasio 2:1 dan carousel otomatis. Semua banner harus disetujui admin platform. Gambar ideal 1200×600 pixel."
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-500/10">
              <Megaphone className="size-4 text-violet-600" />
            </div>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Kelola Banner
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Ruang Promosi</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {items ? `${items.length} banner` : "Memuat…"}
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="gap-2 shadow-sm"
        >
          <Plus className="size-4" /> Banner Baru
        </Button>
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
        {loading && !items ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="aspect-[2/1] animate-pulse rounded-xl bg-muted" />
            <div className="aspect-[2/1] animate-pulse rounded-xl bg-muted" />
          </div>
        ) : list.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Megaphone className="size-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="font-medium">Belum ada banner</p>
              <p className="text-sm text-muted-foreground">
                Buat banner promosi pertama Anda. Gunakan rasio 2:1 agar tampil optimal.
              </p>
            </div>
            <Button
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
              className="mt-2 gap-2"
            >
              <Plus className="size-4" /> Buat Banner
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {list.map((b) => (
              <Card key={b.id} className="overflow-hidden">
                <div className="relative aspect-[2/1] bg-muted">
                  {b.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={b.image_url}
                      alt={b.alt_text}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center">
                      <ImageIcon className="size-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute right-3 top-3">{statusBadge(b.effective_status)}</div>
                </div>
                <div className="space-y-3 p-4">
                  <div>
                    <p className="line-clamp-1 font-semibold">{b.internal_title}</p>
                    <a
                      href={b.target_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                    >
                      <ExternalLink className="size-3" />
                      <span className="line-clamp-1">{b.target_url}</span>
                    </a>
                  </div>

                  {!b.admin_enabled && b.admin_disabled_reason && (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                      <ShieldAlert className="size-3.5 shrink-0" />
                      <span>
                        <span className="font-semibold">Admin: </span>
                        {b.admin_disabled_reason}
                      </span>
                    </div>
                  )}

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

                  <div className="flex items-center justify-between gap-2 border-t pt-3">
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={b.teacher_active}
                        disabled={actionLoading !== null}
                        onChange={() => toggleActive(b)}
                        className="size-3.5"
                      />
                      Aktif (dari Guru)
                    </label>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(b);
                          setShowForm(true);
                        }}
                        disabled={actionLoading !== null}
                        className="h-8 gap-1"
                      >
                        <Pencil className="size-3.5" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => remove(b)}
                        disabled={actionLoading !== null}
                        className="h-8 gap-1 text-destructive hover:text-destructive"
                      >
                        {actionLoading === `delete-${b.id}` ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <BannerForm
        siteId={params.id}
        banner={editing}
        open={showForm}
        onClose={() => setShowForm(false)}
        onSaved={() => {
          setShowForm(false);
          refresh();
        }}
      />
    </div>
  );
}
