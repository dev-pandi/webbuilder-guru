"use client";

// /admin/aduan/[id] — detail aduan: bukti, situs & domain yang cocok, aksi
// tangguhkan/pulihkan, dan status peninjauan.
//
// Bukti hanya bisa dibaca lewat endpoint admin berautentikasi. <img src>
// tidak bisa mengirim header Authorization, jadi berkas diambil dengan
// fetch + Bearer lalu ditampilkan sebagai blob URL.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ExternalLink,
  FileText,
  Globe2,
  LayoutTemplate,
  Loader2,
  Mail,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { API_BASE, api, getAccessToken } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { STATUS_META, fmtDateTime, type AbuseReport } from "../shared";

type EvidenceFile = { id: string; filename: string; mime_type: string; size_bytes: number };
type SiteInfo = {
  id: string;
  name: string;
  slug: string;
  status: string;
  owner_email: string;
  owner_name: string;
  suspended_at?: string;
  suspended_reason?: string;
};
type DomainInfo = { name: string; status: string; suspended_at?: string; suspended_reason?: string };
type Detail = {
  report: AbuseReport;
  files: EvidenceFile[];
  category_label: string;
  site?: SiteInfo;
  domain?: DomainInfo;
};

type Target = { kind: "site" | "domain"; suspend: boolean; label: string };

function EvidenceItem({ reportId, file }: { reportId: string; file: EvidenceFile }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    fetch(`${API_BASE}/api/v1/admin/abuse-reports/${reportId}/files/${file.id}`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    })
      .then((r) => (r.ok ? r.blob() : Promise.reject(r.status)))
      .then((b) => {
        if (cancelled) return;
        url = URL.createObjectURL(b);
        setSrc(url);
      })
      .catch(() => !cancelled && setErr(true));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [reportId, file.id]);

  const isImage = file.mime_type.startsWith("image/");
  return (
    <div className="overflow-hidden rounded-lg border bg-muted/30">
      {err ? (
        <div className="flex h-40 items-center justify-center p-3 text-center text-xs text-destructive">
          Gagal memuat berkas
        </div>
      ) : !src ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : isImage ? (
        <a href={src} target="_blank" rel="noopener noreferrer" title="Buka ukuran penuh">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={file.filename} className="h-40 w-full object-cover" />
        </a>
      ) : (
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground"
        >
          <FileText className="size-8" />
          <span className="text-xs">Buka PDF</span>
        </a>
      )}
      <div className="truncate border-t bg-background px-2 py-1.5 text-[11px] text-muted-foreground">
        {file.filename}
      </div>
    </div>
  );
}

export default function AduanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<AbuseReport["status"]>("baru");
  const [note, setNote] = useState("");
  const [savingReview, setSavingReview] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [reason, setReason] = useState("");
  const [acting, setActing] = useState(false);

  const load = useCallback(() => {
    api<Detail>(`/api/v1/admin/abuse-reports/${id}`)
      .then((d) => {
        setData(d);
        setStatus(d.report.status);
        setNote(d.report.admin_note);
      })
      .catch((e) => setErr((e as Error).message));
  }, [id]);

  useEffect(() => load(), [load]);

  async function saveReview() {
    setSavingReview(true);
    try {
      await api(`/api/v1/admin/abuse-reports/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, admin_note: note }),
      });
      toast.success("Status aduan tersimpan");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingReview(false);
    }
  }

  function openAction(t: Target) {
    setReason(t.suspend ? `Aduan ${data?.category_label?.toLowerCase() ?? ""}`.trim() : "");
    setTarget(t);
  }

  async function runAction() {
    if (!target || !data) return;
    if (target.suspend && !reason.trim()) {
      toast.error("Alasan penangguhan wajib diisi.");
      return;
    }
    const path =
      target.kind === "site"
        ? `/api/v1/admin/sites/${data.site!.id}/${target.suspend ? "suspend" : "unsuspend"}`
        : `/api/v1/admin/domains/${encodeURIComponent(data.domain!.name)}/${target.suspend ? "suspend" : "unsuspend"}`;
    setActing(true);
    try {
      await api(path, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim(), report_id: id }),
      });
      // Penangguhan = tindakan; tandai aduan otomatis supaya antrean jujur.
      if (target.suspend && data.report.status !== "ditindak") {
        await api(`/api/v1/admin/abuse-reports/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "ditindak", admin_note: note || reason.trim() }),
        });
      }
      toast.success(
        target.suspend
          ? `${target.label} ditangguhkan — berlaku dalam ±5 detik`
          : `${target.label} dipulihkan`,
      );
      setTarget(null);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActing(false);
    }
  }

  if (err) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
        <AlertCircle className="size-4" /> {err}
      </div>
    );
  }
  if (!data) {
    return (
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat…
      </span>
    );
  }

  const { report, files, site, domain } = data;
  const meta = STATUS_META[report.status];

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ms-2 gap-1.5 text-muted-foreground">
          <Link href="/admin/aduan">
            <ArrowLeft className="size-4" /> Semua aduan
          </Link>
        </Button>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            <code>{report.reported_host}</code>
          </h1>
          <Badge variant={meta.variant}>{meta.label}</Badge>
          <Badge variant="outline">{data.category_label}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Ref. <code>{report.id.slice(0, 8).toUpperCase()}</code> · masuk {fmtDateTime(report.created_at)}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Uraian pelapor</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="whitespace-pre-line text-sm leading-relaxed">{report.description}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
                <span>
                  URL dilaporkan:{" "}
                  <a
                    href={report.reported_url.startsWith("http") ? report.reported_url : `https://${report.reported_url}`}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    {report.reported_url}
                    <ExternalLink className="size-3" />
                  </a>
                </span>
                <span className="inline-flex items-center gap-1">
                  <Mail className="size-3" />
                  {report.reporter_name ? `${report.reporter_name} · ` : ""}
                  {report.reporter_email}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Bukti ({files.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {files.map((f) => (
                  <EvidenceItem key={f.id} reportId={report.id} file={f} />
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Peninjauan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(STATUS_META) as AbuseReport["status"][]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      status === s ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                    }`}
                  >
                    {STATUS_META[s].label}
                  </button>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adm-note">Catatan internal</Label>
                <Textarea
                  id="adm-note"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Hasil verifikasi, tindakan yang diambil, dsb."
                />
              </div>
              <Button onClick={saveReview} disabled={savingReview} size="sm" className="gap-1.5">
                {savingReview && <Loader2 className="size-3.5 animate-spin" />}
                Simpan peninjauan
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <LayoutTemplate className="size-4" /> Situs
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {site ? (
                <>
                  <div>
                    <div className="font-medium">{site.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Pemilik: {site.owner_name || "—"} · {site.owner_email}
                    </div>
                  </div>
                  {site.suspended_at ? (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs">
                      <div className="font-medium text-destructive">Ditangguhkan</div>
                      <div className="mt-0.5 text-muted-foreground">{site.suspended_reason}</div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">Status: aktif ({site.status})</div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {site.suspended_at ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => openAction({ kind: "site", suspend: false, label: "Situs" })}
                      >
                        <ShieldCheck className="size-3.5" /> Pulihkan situs
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="gap-1.5"
                        onClick={() => openAction({ kind: "site", suspend: true, label: "Situs" })}
                      >
                        <ShieldAlert className="size-3.5" /> Tangguhkan situs
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" asChild>
                      <Link href={`/sites/${site.id}/editor`}>Buka editor</Link>
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Host ini tidak terhubung ke situs mana pun di platform — tidak ada
                  yang bisa ditangguhkan di sini. Aduan bisa ditandai ditolak atau
                  diteruskan ke pihak berwenang.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Globe2 className="size-4" /> Domain
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {domain ? (
                <>
                  <code className="font-medium">{domain.name}</code>
                  {domain.suspended_at ? (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs">
                      <div className="font-medium text-destructive">Ditangguhkan</div>
                      <div className="mt-0.5 text-muted-foreground">{domain.suspended_reason}</div>
                    </div>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Menangguhkan domain menghentikan penayangan situs di domain
                    ini. Ini penangguhan di platform, bukan di registry.
                  </p>
                  {domain.suspended_at ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => openAction({ kind: "domain", suspend: false, label: "Domain" })}
                    >
                      <ShieldCheck className="size-3.5" /> Pulihkan domain
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="gap-1.5"
                      onClick={() => openAction({ kind: "domain", suspend: true, label: "Domain" })}
                    >
                      <ShieldAlert className="size-3.5" /> Tangguhkan domain
                    </Button>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Domain tidak didaftarkan lewat platform (mis. domain milik
                  sendiri). Tangguhkan situsnya bila perlu.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {target?.suspend ? "Tangguhkan" : "Pulihkan"} {target?.label.toLowerCase()}?
            </DialogTitle>
            <DialogDescription>
              {target?.suspend
                ? "Semua halaman akan diganti pemberitahuan penangguhan bagi pengunjung. Pemilik tetap bisa mengakses editor. Berlaku dalam ±5 detik."
                : "Situs akan kembali dapat diakses publik."}
            </DialogDescription>
          </DialogHeader>
          {target?.suspend && (
            <div className="space-y-1.5">
              <Label htmlFor="susp-reason">Alasan (wajib, tercatat di audit log)</Label>
              <Textarea id="susp-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={acting}>
              Batal
            </Button>
            <Button
              variant={target?.suspend ? "destructive" : "default"}
              onClick={runAction}
              disabled={acting}
              className="gap-1.5"
            >
              {acting && <Loader2 className="size-3.5 animate-spin" />}
              {target?.suspend ? "Tangguhkan" : "Pulihkan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
