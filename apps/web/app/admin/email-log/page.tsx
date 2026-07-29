"use client";

// Admin email log viewer — untuk debugging "kenapa email tidak masuk?".
// Log tiap Send() attempt (sukses + gagal) + duration + driver.

import { Fragment, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Filter,
  Inbox,
  Loader2,
  Mail,
  Search,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Entry = {
  id: string;
  to_address: string;
  subject: string;
  body_preview: string;
  driver: "log" | "smtp";
  status: "sent" | "failed";
  error?: string;
  duration_ms: number;
  created_at: string;
};

type PagedResp = {
  items: Entry[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

const STATUS_FILTERS = [
  { value: "", label: "Semua" },
  { value: "sent", label: "Terkirim" },
  { value: "failed", label: "Gagal" },
];

export default function EmailLogPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("");
  const [to, setTo] = useState("");
  const [debouncedTo, setDebouncedTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedTo(to.trim()), 350);
    return () => clearTimeout(t);
  }, [to]);

  useEffect(() => {
    setPage(1);
  }, [status, debouncedTo]);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    const q = new URLSearchParams({
      page: String(page),
      page_size: "50",
    });
    if (status) q.set("status", status);
    if (debouncedTo) q.set("to", debouncedTo);
    api<PagedResp>(`/api/v1/admin/email-log?${q.toString()}`)
      .then((res) => {
        setEntries(res.items ?? []);
        setTotalPages(res.total_pages);
        setTotal(res.total);
      })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [page, status, debouncedTo]);

  const failedCount = entries.filter((e) => e.status === "failed").length;
  const logDriverCount = entries.filter((e) => e.driver === "log").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Mail className="size-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Email Log</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Audit tiap email yang di-kirim (reset password, verifikasi, invite,
            notifikasi). Cek di sini kalau ada laporan email tidak masuk.
          </p>
        </div>
      </div>

      {/* Diagnostic hint kalau driver=log terdeteksi di data */}
      {logDriverCount > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertCircle className="size-4 shrink-0 translate-y-0.5" />
          <div>
            <p className="font-medium">Driver "log" terdeteksi</p>
            <p className="mt-1 text-xs">
              Beberapa entry pakai driver <code>log</code> — email hanya
              di-print ke stdout, TIDAK dikirim ke SMTP. Cek{" "}
              <code>MAIL_DRIVER</code> di <code>.env</code>: harus{" "}
              <code>smtp</code> supaya email beneran keluar.
            </p>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Filter className="size-4" />
            Filter
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Status
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setStatus(f.value)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      status === f.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-muted",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="to" className="text-xs uppercase tracking-wider text-muted-foreground">
                Filter penerima
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="to"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="Cari email penerima…"
                  className="pl-9"
                />
              </div>
            </div>
          </div>
          <p className="pt-2 text-xs text-muted-foreground">
            {total.toLocaleString("id-ID")} entry
            {failedCount > 0 && (
              <>
                {" · "}
                <span className="font-medium text-destructive">
                  {failedCount} gagal
                </span>{" "}
                di halaman ini
              </>
            )}
          </p>
        </CardContent>
      </Card>

      {err && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0 translate-y-0.5" />
          <span>{err}</span>
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-40">Waktu</TableHead>
                <TableHead>Penerima</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20 text-right">Durasi</TableHead>
                <TableHead className="w-0">Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={loading ? "opacity-60" : ""}>
              {loading && entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-14 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-14 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Inbox className="size-8 opacity-30" />
                      <p className="text-sm font-medium">Belum ada log email</p>
                      <p className="max-w-md text-xs">
                        Setiap email yang di-kirim (reset password, verify, invite,
                        notifikasi) akan muncul di sini.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((e) => (
                  <Fragment key={e.id}>
                    <TableRow>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(e.created_at)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{e.to_address}</TableCell>
                      <TableCell className="max-w-[280px] truncate text-sm">
                        {e.subject}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={e.driver === "smtp" ? "secondary" : "warning"}
                          className="font-mono text-[10px]"
                        >
                          {e.driver}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {e.status === "sent" ? (
                          <Badge variant="success" className="gap-1 text-xs">
                            <CheckCircle2 className="size-3" />
                            Terkirim
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="gap-1 text-xs">
                            <XCircle className="size-3" />
                            Gagal
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        {e.duration_ms}ms
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                          className="text-xs text-primary hover:underline"
                        >
                          {expanded === e.id ? "Tutup" : "Lihat"}
                        </button>
                      </TableCell>
                    </TableRow>
                    {expanded === e.id && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={7} className="py-3">
                          {e.error && (
                            <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-destructive">
                                Error dari mail driver
                              </p>
                              <pre className="whitespace-pre-wrap break-words text-xs text-destructive">
                                {e.error}
                              </pre>
                            </div>
                          )}
                          <div className="rounded-md border bg-background p-3">
                            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Body preview (500 char pertama)
                            </p>
                            <pre className="whitespace-pre-wrap break-words text-[11px] text-foreground/90">
                              {e.body_preview || "(kosong)"}
                            </pre>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {totalPages > 1 && (
        <div className={cn("flex items-center justify-between text-sm", loading && "opacity-60")}>
          <span className="text-muted-foreground">
            Halaman {page} dari {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Sebelumnya
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Berikutnya
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}
