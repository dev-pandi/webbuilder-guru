"use client";

// TopupStatus — shared polling page untuk /reseller/wallet/topup/[id] +
// /agent/wallet/topup/[id]. basePath = prefix untuk back link + "top-up
// baru" link (mis. "/reseller/wallet" atau "/agent/wallet").
//
// Status enum (backend):
//   pending_payment  → tombol "Buka halaman pembayaran"
//   credited         → success (terminal, redirect ke wallet)
//   failed / expired / cancelled → terminal error state

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  CheckCircle,
  Clock,
  Eye,
  ExternalLink,
  FileText,
  Loader2,
  Receipt,
  Upload,
  UploadCloud,
  Wallet,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, getAccessToken, openBlob } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

type Topup = {
  id: string;
  user_id: string;
  invoice_id: string;
  amount: number;
  currency: string;
  payment_method: string;
  payment_url?: string;
  instructions?: string;
  status: string;
  reason?: string;
  ledger_id?: string;
  credited_at?: string;
  proof_mime?: string;
  proof_size?: number;
  proof_note?: string;
  proof_uploaded_at?: string;
  created_at: string;
  updated_at: string;
};

function isTerminal(status: string): boolean {
  return (
    status === "credited" ||
    status === "failed" ||
    status === "expired" ||
    status === "cancelled"
  );
}

function formatIDR(n: number): string {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

export function TopupStatus({ basePath }: { basePath: string }) {
  const router = useRouter();
  const params = useParams<{ topupId: string }>();
  const topupID = params.topupId;

  const [topup, setTopup] = useState<Topup | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const pollInterval = topup?.status === "pending_payment" ? 2000 : 3000;

  useEffect(() => {
    if (!topupID) return;
    let cancelled = false;
    const controller = new AbortController();
    abortRef.current = controller;

    async function fetchOnce() {
      try {
        const t = await api<Topup>(`/api/v1/wallet/topup/${topupID}`);
        if (cancelled) return;
        setTopup(t);
        setErr(null);
        setNotFound(false);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) {
          setNotFound(true);
          return;
        }
        setErr((e as Error).message);
      }
    }

    fetchOnce();
    const interval = setInterval(() => {
      if (topup && isTerminal(topup.status)) return;
      fetchOnce();
    }, pollInterval);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topupID, pollInterval]);

  if (notFound) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-10">
        <Button variant="ghost" size="sm" asChild className="gap-1.5">
          <Link href={basePath}>
            <ArrowLeft className="size-4" /> Wallet
          </Link>
        </Button>
        <Card>
          <CardContent className="py-10 text-center">
            <XCircle className="mx-auto size-8 text-destructive" />
            <p className="mt-3 font-medium">Top-up tidak ditemukan</p>
            <p className="mt-1 text-sm text-muted-foreground">
              ID tidak valid atau bukan milik akun Anda.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!topup) {
    return (
      <div className="mx-auto max-w-2xl py-10">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Memuat…
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="gap-1.5">
          <Link href={basePath}>
            <ArrowLeft className="size-4" /> Wallet
          </Link>
        </Button>
      </div>

      <div>
        <div className="mb-1 flex items-center gap-2">
          <Wallet className="size-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">
            Top-up {formatIDR(topup.amount)}
          </h1>
          <StatusBadge status={topup.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          Metode: <span className="font-medium">{topup.payment_method}</span>
        </p>
      </div>

      {err && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0 translate-y-0.5" />
          <span>{err}</span>
        </div>
      )}

      {topup.status === "pending_payment" && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-start gap-3">
              <Clock className="size-5 shrink-0 text-amber-600" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold">Menunggu pembayaran</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {topup.payment_method === "manual_bank"
                    ? "Transfer sesuai instruksi di bawah, lalu upload bukti transfer supaya admin bisa verifikasi lebih cepat."
                    : "Klik tombol di bawah untuk lanjut ke halaman pembayaran. Setelah bayar, halaman ini akan otomatis refresh."}
                </p>
              </div>
            </div>
            {topup.payment_url ? (
              <Button asChild size="lg" className="w-full gap-2">
                <a href={topup.payment_url} target="_blank" rel="noopener noreferrer">
                  Buka halaman pembayaran
                  <ExternalLink className="size-4" />
                </a>
              </Button>
            ) : topup.instructions ? (
              <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                {topup.instructions}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Menyiapkan link
                pembayaran…
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {topup.status === "pending_payment" && topup.payment_method === "manual_bank" && (
        <ProofUploader
          topupID={topup.id}
          hasExisting={Boolean(topup.proof_uploaded_at)}
          existingNote={topup.proof_note}
          existingUploadedAt={topup.proof_uploaded_at}
          onUploaded={(data) => {
            setTopup((t) =>
              t
                ? {
                    ...t,
                    proof_mime: data.proof_mime,
                    proof_size: data.proof_size,
                    proof_note: data.proof_note,
                    proof_uploaded_at: data.proof_uploaded_at,
                  }
                : t,
            );
          }}
        />
      )}

      {topup.status === "credited" && (
        <Card className="border-emerald-500/30">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold">
                  Saldo berhasil di-credit
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatIDR(topup.amount)} sudah masuk ke wallet Anda per{" "}
                  {topup.credited_at
                    ? new Date(topup.credited_at).toLocaleString("id-ID")
                    : "sekarang"}
                  .
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  openBlob(`/api/v1/invoices/${topup.invoice_id}/pdf`).catch((e) =>
                    toast.error("Gagal buka PDF", {
                      description: (e as Error).message,
                    }),
                  )
                }
              >
                Cetak invoice
              </Button>
              <Button size="sm" onClick={() => router.push(basePath)}>
                Ke wallet
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {(topup.status === "failed" ||
        topup.status === "expired" ||
        topup.status === "cancelled") && (
        <Card className="border-destructive/30">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-start gap-3">
              <XCircle className="size-5 shrink-0 text-destructive" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold">
                  {topup.status === "failed" && "Top-up gagal"}
                  {topup.status === "expired" && "Top-up kedaluwarsa"}
                  {topup.status === "cancelled" && "Top-up dibatalkan"}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {topup.reason ||
                    "Silakan buat top-up baru untuk isi saldo wallet."}
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" asChild>
                <Link href={`${basePath}/topup`}>Mulai top-up baru</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-1 p-5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Topup ID</span>
            <code className="font-mono">{topup.id.slice(0, 8)}…</code>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Invoice ID</span>
            <code className="font-mono">{topup.invoice_id.slice(0, 8)}…</code>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Dibuat</span>
            <span>{new Date(topup.created_at).toLocaleString("id-ID")}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "credited") {
    return <Badge variant="success">Sukses</Badge>;
  }
  if (status === "pending_payment") {
    return (
      <Badge variant="warning" className="gap-1">
        <Clock className="size-3" />
        Menunggu bayar
      </Badge>
    );
  }
  if (status === "failed" || status === "expired") {
    return <Badge variant="destructive">{status === "failed" ? "Gagal" : "Kedaluwarsa"}</Badge>;
  }
  return <Badge variant="secondary">{status}</Badge>;
}

const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const PROOF_MIMES = ["image/png", "image/jpeg", "image/jpg", "application/pdf"];

type ProofUploadResp = {
  topup_id: string;
  proof_mime: string;
  proof_size: number;
  proof_note: string;
  proof_uploaded_at: string;
};

function ProofUploader({
  topupID,
  hasExisting,
  existingNote,
  existingUploadedAt,
  onUploaded,
}: {
  topupID: string;
  hasExisting: boolean;
  existingNote?: string;
  existingUploadedAt?: string;
  onUploaded: (data: ProofUploadResp) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pickFile(f: File | null) {
    setErr(null);
    if (!f) return;
    if (f.size > MAX_PROOF_BYTES) {
      setErr("File terlalu besar (maks 5 MB)");
      return;
    }
    if (!PROOF_MIMES.includes(f.type)) {
      setErr("Format tidak didukung — hanya PNG, JPG, atau PDF");
      return;
    }
    setFile(f);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!file) {
      setErr("Pilih file bukti transfer dulu");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (note.trim()) fd.append("note", note.trim());
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE ?? "http://api.localhost"}/api/v1/wallet/topup/${topupID}/proof`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
          body: fd,
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.error) {
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      toast.success("Bukti transfer berhasil di-upload");
      onUploaded(body.data as ProofUploadResp);
      setFile(null);
      setNote("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const isPdf = file?.type === "application/pdf";

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <Receipt className="size-5 shrink-0 text-primary" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold">
              {hasExisting ? "Ganti bukti transfer" : "Upload bukti transfer"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasExisting
                ? "Bukti sebelumnya sudah ter-upload. Upload ulang kalau ada revisi (misal salah kirim)."
                : "Upload screenshot mobile banking / foto struk / PDF e-statement supaya admin bisa verify lebih cepat."}
            </p>
          </div>
        </div>

        {hasExisting && (
          <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
            <CheckCircle className="size-4 shrink-0 translate-y-0.5 text-emerald-600" />
            <div className="flex-1">
              <p className="font-medium">Bukti sudah di-upload</p>
              {existingUploadedAt && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Di-upload {new Date(existingUploadedAt).toLocaleString("id-ID")}
                </p>
              )}
              {existingNote && (
                <p className="mt-1 text-xs italic text-muted-foreground">
                  &ldquo;{existingNote}&rdquo;
                </p>
              )}
              <div className="mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={async () => {
                    try {
                      const res = await api<{ image: string; type: string }>(
                        `/api/v1/wallet/topup/${topupID}/proof`,
                      );
                      const [, meta = "", b64 = ""] =
                        res.image.match(/^data:([^;]+);base64,(.+)$/) ?? [];
                      const bin = atob(b64);
                      const bytes = new Uint8Array(bin.length);
                      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                      const blob = new Blob([bytes], { type: meta || res.type });
                      const url = URL.createObjectURL(blob);
                      window.open(url, "_blank", "noopener,noreferrer");
                      setTimeout(() => URL.revokeObjectURL(url), 30_000);
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  <Eye className="size-3.5" /> Lihat bukti
                </Button>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-3">
          <input
            ref={fileRef}
            id="proof-file"
            type="file"
            accept={PROOF_MIMES.join(",")}
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            className="sr-only"
          />
          {!file ? (
            <label
              htmlFor="proof-file"
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                pickFile(e.dataTransfer.files?.[0] ?? null);
              }}
              className={[
                "group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 bg-muted/20 hover:border-primary/60 hover:bg-primary/5",
              ].join(" ")}
            >
              <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform group-hover:scale-105">
                <UploadCloud className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  Tarik file ke sini atau{" "}
                  <span className="text-primary underline-offset-2 hover:underline">
                    pilih file
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  PNG, JPG, atau PDF · maks 5 MB
                </p>
              </div>
            </label>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border bg-background p-3">
              <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
                {preview ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={preview} alt={file.name} className="size-full object-cover" />
                ) : (
                  <FileText className="size-6 text-primary" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB{isPdf ? " · PDF" : file.type.startsWith("image/") ? " · Gambar" : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFile(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              >
                Ganti
              </Button>
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="proof-note"
              className="text-xs font-medium text-muted-foreground"
            >
              Catatan <span className="font-normal">(opsional)</span>
            </label>
            <Textarea
              id="proof-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="mis. Transfer dari BCA a.n. Budi Santoso — 15:30 WIB"
              rows={2}
              maxLength={500}
            />
          </div>

          {err && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0 translate-y-0.5" />
              <span>{err}</span>
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={submitting || !file} className="gap-2">
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Mengunggah…
                </>
              ) : (
                <>
                  <Upload className="size-4" />
                  {hasExisting ? "Ganti bukti" : "Kirim bukti"}
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
