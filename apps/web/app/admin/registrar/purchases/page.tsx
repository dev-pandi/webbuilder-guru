"use client";

// Admin observability untuk domain purchases lintas user.
//
// Use case:
//   - "User X bilang domainnya stuck" → filter status=pending_document, cari email
//   - "Ada webhook yg failed batch semalam?" → sort=expires_soon status=failed
//   - "Berapa banyak yang stuck di pending_payment?" → filter status + lihat total
//
// Read-only: admin tidak boleh mutasi purchase dari sini (webhook + registrar
// harus tetap authoritative). Kalau perlu retry, arahkan ke user.

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
} from "lucide-react";
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
import { RegistrarSectionNav } from "../_nav";

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

// Semua status yang ada — sinkron dengan status constants backend.
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
  { value: "", label: "Terbaru (default)" },
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
  const [sort, setSort] = useState("");

  const [data, setData] = useState<PaginatedResult<Row> | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Reset ke page 1 saat filter/search berubah.
  useEffect(() => {
    setPage(1);
  }, [debouncedQ, status, kind, sort]);

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
      if (sort) params.set("sort", sort);
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
  }, [page, pageSize, debouncedQ, status, kind, sort]);

  const items = data?.items ?? [];
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (debouncedQ) n++;
    if (status !== "all") n++;
    if (kind !== "all") n++;
    if (sort) n++;
    return n;
  }, [debouncedQ, status, kind, sort]);

  function clearFilters() {
    setQ("");
    setStatus("all");
    setKind("all");
    setSort("");
  }

  return (
    <div className="space-y-6">
      <RegistrarSectionNav />

      <div>
        <div className="mb-1 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
            <ListChecks className="size-4 text-primary" />
          </div>
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Ops Observability
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Domain Purchases</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Semua pembelian domain lintas user — read-only. Filter berdasarkan
          status untuk cari yang stuck di pending atau failed. Retry / restart
          adalah aksi user, bukan admin.
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
              placeholder="Cari domain atau email…"
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
                <SelectItem key={o.value || "default"} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                      : "Belum ada purchase — mulai dari user."}
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
                        <span className="text-sm font-medium">{r.user_name || "—"}</span>
                        <a
                          href={`mailto:${r.user_email}`}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                        >
                          <Mail className="size-3" />
                          {r.user_email}
                        </a>
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
                          href={`/settings/domains/${encodeURIComponent(r.domain)}`}
                          className="mt-1 inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
                          title="Buka detail domain (dari sisi user)"
                        >
                          Detail
                          <ExternalLink className="size-3" />
                        </Link>
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
