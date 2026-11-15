"use client";

// Admin observability untuk domain purchases (transaction log) lintas user.
// Beda dari /admin/domain yang aggregate current-state — di sini setiap
// event register/renew punya baris sendiri.
//
// Use case:
//   - "User X bilang domainnya stuck" → filter status=pending_document, cari email
//   - "Ada webhook yg failed batch semalam?" → sort=expires_soon status=failed
//   - "Berapa banyak yang stuck di pending_payment?" → filter status + lihat total
//
// Read-only: mutasi (retry, cancel) tetap dari sisi user.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ListChecks,
  Search,
  Loader2,
  AlertCircle,
  RefreshCw,
  Mail,
  ExternalLink,
  ChevronLeft,
  RotateCcw,
  CalendarRange,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Pagination, useDebounced, type PaginatedResult } from "@/components/Pagination";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Row = {
  job_id: string;
  domain: string;
  status: string;
  kind: string;
  reason?: string;
  years: number;
  payment_method?: string;
  expires_at?: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  user_email: string;
  user_name: string;
  site_id?: string | null;
};

const STATUS_OPTIONS = [
  { value: "all", label: "Semua status" },
  { value: "pending_payment", label: "Menunggu bayar" },
  { value: "pending_document", label: "Menunggu dokumen" },
  { value: "pending_provisioning", label: "Diproses registrar" },
  { value: "active", label: "Aktif" },
  { value: "failed", label: "Gagal" },
  { value: "expired", label: "Kadaluwarsa" },
];

const KIND_OPTIONS = [
  { value: "all", label: "Semua tipe" },
  { value: "register", label: "Register" },
  { value: "renew", label: "Renew" },
];

const SORT_OPTIONS = [
  { value: "default", label: "Terbaru (default)" },
  { value: "created_asc", label: "Terlama" },
  { value: "expires_soon", label: "Segera expire" },
  { value: "domain_asc", label: "Domain A-Z" },
  { value: "domain_desc", label: "Domain Z-A" },
];

function statusVariant(s: string): "success" | "destructive" | "secondary" {
  if (s === "active") return "success";
  if (s === "failed" || s === "expired") return "destructive";
  return "secondary";
}

function statusLabel(s: string): string {
  const found = STATUS_OPTIONS.find((o) => o.value === s);
  return found?.label ?? s;
}

export default function AdminPurchasesPage() {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [status, setStatus] = useState("all");
  const [kind, setKind] = useState("all");
  const [sort, setSort] = useState("default");
  // Tanggal transaksi (created_at), YYYY-MM-DD WIB — beda dengan halaman
  // Domain Aktif yang memfilter tanggal terdaftar di registry.
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");

  const [data, setData] = useState<PaginatedResult<Row> | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<Record<string, boolean>>({});
  // refetchTick — bump untuk force refetch setelah retry berhasil, tanpa
  // duplicate fetchData logic.
  const [refetchTick, setRefetchTick] = useState(0);

  async function onRetry(jobID: string, domain: string) {
    if (retrying[jobID]) return;
    if (!confirm(`Retry provisioning untuk ${domain}? Backend akan re-invoke ExecuteAfterPayment (tidak charge ulang).`)) {
      return;
    }
    setRetrying((s) => ({ ...s, [jobID]: true }));
    try {
      await api(`/api/v1/admin/registrar/purchases/${jobID}/retry`, {
        method: "POST",
      });
      toast.success(`Retry ${domain} dikirim — status akan update`);
      setRefetchTick((t) => t + 1);
    } catch (e) {
      toast.error(`Retry ${domain} gagal: ${(e as Error).message}`);
    } finally {
      setRetrying((s) => ({ ...s, [jobID]: false }));
    }
  }

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, status, kind, sort, createdFrom, createdTo]);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      setErr(null);
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (debouncedQ) params.set("q", debouncedQ);
      if (status !== "all") params.set("status", status);
      if (kind !== "all") params.set("kind", kind);
      if (sort && sort !== "default") params.set("sort", sort);
      if (createdFrom) params.set("created_from", createdFrom);
      if (createdTo) params.set("created_to", createdTo);
      try {
        const res = await api<PaginatedResult<Row>>(
          `/api/v1/admin/registrar/purchases?${params.toString()}`,
        );
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [page, pageSize, debouncedQ, status, kind, sort, createdFrom, createdTo, refetchTick]);

  const items = data?.items ?? [];
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (debouncedQ) n++;
    if (status !== "all") n++;
    if (kind !== "all") n++;
    if (sort && sort !== "default") n++;
    if (createdFrom || createdTo) n++;
    return n;
  }, [debouncedQ, status, kind, sort, createdFrom, createdTo]);

  function clearFilters() {
    setQ("");
    setStatus("all");
    setKind("all");
    setSort("default");
    setCreatedFrom("");
    setCreatedTo("");
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 gap-1.5 -ml-3">
          <Link href="/admin/domain">
            <ChevronLeft className="size-4" />
            Domain Aktif
          </Link>
        </Button>
        <div className="mb-1 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
            <ListChecks className="size-4 text-primary" />
          </div>
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Ops Observability
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Riwayat Transaksi Domain</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Semua event register / renew lintas user — transaction log. Untuk
          list domain aktif per FQDN (1 baris per domain), lihat halaman
          Domain Aktif.
        </p>
      </div>

      {err && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari domain, email, atau nama…"
              className="h-9 pl-8"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIND_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="h-9 w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div
            className="flex items-center gap-1.5"
            role="group"
            aria-label="Rentang tanggal transaksi"
            title="Tanggal transaksi dibuat (WIB), bukan tanggal domain terdaftar di registry"
          >
            <CalendarRange className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Transaksi</span>
            <Input
              type="date"
              aria-label="Transaksi dari"
              value={createdFrom}
              max={createdTo || undefined}
              onChange={(e) => setCreatedFrom(e.target.value)}
              className="h-9 w-[140px]"
            />
            <span className="text-xs text-muted-foreground">s.d.</span>
            <Input
              type="date"
              aria-label="Transaksi sampai"
              value={createdTo}
              min={createdFrom || undefined}
              onChange={(e) => setCreatedTo(e.target.value)}
              className="h-9 w-[140px]"
            />
          </div>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5">
              <RefreshCw className="size-3.5" />
              Reset ({activeFilterCount})
            </Button>
          )}
        </div>

        <div className={loading ? "opacity-60" : ""}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead>Expire</TableHead>
                <TableHead>Dibuat</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center">
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" /> Memuat…
                    </span>
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    {activeFilterCount > 0
                      ? "Tidak ada hasil untuk filter tersebut."
                      : "Belum ada transaksi."}
                  </TableCell>
                </TableRow>
              ) : (
                items.map((r) => (
                  <TableRow key={r.job_id}>
                    <TableCell className="align-top">
                      <div className="flex flex-col gap-0.5">
                        <code className="font-medium">{r.domain}</code>
                        <span className="text-xs text-muted-foreground">
                          {r.years} tahun · {r.payment_method || "—"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-col gap-0.5">
                        <Link
                          href={`/admin/users/${r.user_id}`}
                          className="text-sm font-medium hover:text-primary hover:underline underline-offset-4"
                          title="Buka detail user"
                        >
                          {r.user_name || "—"}
                        </Link>
                        <Link
                          href={`/admin/users/${r.user_id}`}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                          title="Buka detail user"
                        >
                          <Mail className="size-3" />
                          {r.user_email}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-col gap-1">
                        <Badge variant={statusVariant(r.status)} className="w-fit text-xs">
                          {statusLabel(r.status)}
                        </Badge>
                        {r.reason && (
                          <span className="max-w-xs text-xs text-muted-foreground">
                            {r.reason}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge variant="secondary" className="text-xs capitalize">
                        {r.kind}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-top text-xs text-muted-foreground">
                      {formatDate(r.expires_at)}
                    </TableCell>
                    <TableCell className="align-top text-xs text-muted-foreground">
                      <div className="flex flex-col">
                        <span>{formatDate(r.created_at)}</span>
                        {r.updated_at !== r.created_at && (
                          <span className="text-[10px]">
                            update: {formatDate(r.updated_at)}
                          </span>
                        )}
                        <Link
                          href={`/admin/domain/${encodeURIComponent(r.domain)}`}
                          className="mt-1 inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
                          title="Buka detail domain (admin view, bypass ownership)"
                        >
                          Detail
                          <ExternalLink className="size-3" />
                        </Link>
                        {/* Retry untuk pending_payment / pending_provisioning / failed.
                            Backend syncFromEPPIfActive cek registry dulu — kalau EPP
                            sudah punya domain, langsung promote ke active (no duplicate
                            register). Status active otomatis skip tombol. */}
                        {(r.status === "pending_payment" ||
                          r.status === "pending_provisioning" ||
                          r.status === "failed") && (
                          <button
                            type="button"
                            onClick={() => onRetry(r.job_id, r.domain)}
                            disabled={!!retrying[r.job_id]}
                            className="mt-1 inline-flex items-center gap-1 text-xs text-amber-700 underline-offset-4 hover:underline disabled:opacity-50 dark:text-amber-500"
                            title="Retry provisioning (rerun ExecuteAfterPayment, tidak charge ulang). Untuk unblock user yang stuck karena api-registry fail."
                          >
                            {retrying[r.job_id] ? (
                              <>
                                <Loader2 className="size-3 animate-spin" />
                                Retry…
                              </>
                            ) : (
                              <>
                                <RotateCcw className="size-3" />
                                Retry
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {data && (
          <Pagination
            page={data.page}
            totalPages={data.total_pages}
            total={data.total}
            pageSize={data.page_size}
            onPage={setPage}
          />
        )}
      </Card>
    </div>
  );
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}
