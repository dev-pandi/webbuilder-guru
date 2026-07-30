"use client";

// "Invoice Saya" — list semua invoice user (register + renew, mix active +
// history). Data diproxied dari registrar via GET /api/v1/invoices; web
// builder tidak simpan invoice — single source of truth = registrar.
//
// Aksi utama:
//   - Cetak / simpan PDF (dialog dengan template A4)
//   - Bayar / Detail → deep-link ke /sites/pending/<job_id>
//
// Design: hero gradient + summary tiles + segmented filter + search + table
// dengan status badge dan action buttons.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Receipt,
  Loader2,
  ArrowRight,
  AlertCircle,
  Search,
  Printer,
  CheckCircle2,
  Clock,
  Ban,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { InvoicePrintDialog } from "./InvoicePrintDialog";
import type { Invoice, InvoicesResponse, Me, Pagination } from "./types";

// Mapping status registrar → label ID + badge variant.
const STATUS_LABEL: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "success" | "warning" }
> = {
  Unpaid: { label: "Belum dibayar", variant: "warning" },
  "On Check": { label: "Verifikasi bank", variant: "secondary" },
  Rejected: { label: "Ditolak", variant: "destructive" },
  Paid: { label: "Lunas", variant: "success" },
  Canceled: { label: "Dibatalkan", variant: "secondary" },
  Expired: { label: "Kedaluwarsa", variant: "destructive" },
  Refund: { label: "Dikembalikan", variant: "secondary" },
};

const FILTERS: {
  key: string;
  label: string;
  value: string;
  icon: typeof CheckCircle2;
}[] = [
  { key: "all", label: "Semua", value: "", icon: Receipt },
  {
    key: "unpaid",
    label: "Belum dibayar",
    value: "unpaid,on_check,rejected",
    icon: Clock,
  },
  { key: "paid", label: "Lunas", value: "paid", icon: CheckCircle2 },
  { key: "other", label: "Lainnya", value: "canceled,expired,refund", icon: Ban },
];

// InvoicesList — shared component untuk daftar invoice.
// `endpoint` opsional — default `/api/v1/invoices` (self-scope via
// external_user_id = caller). Reseller/agent portal WAJIB override ke
// `/api/v1/reseller/invoices` atau `/api/v1/agent/invoices` supaya
// aggregate (self + client managed) muncul; kalau tidak, invoice
// on-behalf-of client tidak akan tampil karena registrar filter by
// external_user_id yang tagged ke client, bukan caller.
export function InvoicesList({
  endpoint = "/api/v1/invoices",
}: {
  endpoint?: string;
} = {}) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);

  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  const [me, setMe] = useState<Me | null>(null);
  const [printInvoice, setPrintInvoice] = useState<Invoice | null>(null);

  // Fetch user profile sekali di mount — dipakai print header (bill-to).
  useEffect(() => {
    api<Me>("/api/v1/auth/me")
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  // Debounce search 350ms — hindari hit registrar tiap keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [filter, debouncedSearch]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      const isInitial = invoices.length === 0 && !refreshing;
      if (isInitial) setLoading(true);
      else setRefreshing(true);
      setErr(null);

      const filterValue = FILTERS.find((f) => f.key === filter)?.value ?? "";
      const params = new URLSearchParams();
      if (filterValue) params.set("status", filterValue);
      if (debouncedSearch) params.set("search", debouncedSearch);
      params.set("page", String(page));
      params.set("page_size", "20");

      try {
        const res = await api<InvoicesResponse>(
          `${endpoint}?${params.toString()}`,
          { signal: controller.signal } as RequestInit,
        );
        if (cancelled) return;
        setInvoices(res.items ?? []);
        setPagination(res.pagination ?? null);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 503) {
          setDisabled(true);
        } else if ((e as { name?: string })?.name !== "AbortError") {
          setErr((e as Error).message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, debouncedSearch, page, endpoint]);

  const stats = useMemo(() => {
    const unpaid = invoices.filter((i) =>
      ["Unpaid", "On Check", "Rejected"].includes(i.status),
    );
    const paid = invoices.filter((i) => i.status === "Paid");
    const totalUnpaid = unpaid.reduce((sum, i) => sum + i.total_price, 0);
    const totalPaid = paid.reduce((sum, i) => sum + i.total_price, 0);
    return {
      unpaidCount: unpaid.length,
      totalUnpaid,
      paidCount: paid.length,
      totalPaid,
      totalCount: invoices.length,
    };
  }, [invoices]);

  if (disabled) {
    return (
      <div className="space-y-6">
        <HeroHeader />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="rounded-full bg-muted p-4">
              <Receipt className="size-8 text-muted-foreground" />
            </div>
            <p className="font-medium">Fitur invoice belum tersedia</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Layanan registrar belum dikonfigurasi oleh admin. Hubungi tim kami
              kalau butuh bantuan.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HeroHeader />

      {/* Ringkasan — 3 tile besar */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          icon={Receipt}
          label="Total invoice"
          value={stats.totalCount.toString()}
          tone="default"
        />
        <StatTile
          icon={Clock}
          label="Belum dibayar"
          value={
            stats.unpaidCount > 0 ? formatIDR(stats.totalUnpaid) : "Tidak ada"
          }
          hint={
            stats.unpaidCount > 0
              ? `${stats.unpaidCount} invoice menunggu pembayaran`
              : "Semua lunas ✓"
          }
          tone={stats.unpaidCount > 0 ? "warning" : "success"}
        />
        <StatTile
          icon={CheckCircle2}
          label="Total lunas"
          value={formatIDR(stats.totalPaid)}
          hint={`${stats.paidCount} invoice terbayar`}
          tone="success"
        />
      </div>

      {/* Filter chips + search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const Icon = f.icon;
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all",
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {f.label}
              </button>
            );
          })}
        </div>
        <div className="relative sm:w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama domain…"
            className="pl-9"
          />
        </div>
      </div>

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
                <TableHead className="w-[180px]">Nomor invoice</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Jenis</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead className="w-[140px] text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={loading ? "opacity-60" : ""}>
              {loading && invoices.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-14 text-center text-muted-foreground"
                  >
                    <Loader2 className="mx-auto size-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-16">
                    <EmptyState
                      hasFilter={filter !== "all" || debouncedSearch.length > 0}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((inv) => (
                  <InvoiceRow
                    key={inv.uuid}
                    invoice={inv}
                    onPrint={() => setPrintInvoice(inv)}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Halaman {pagination.current} dari {pagination.totalPages} —{" "}
            {pagination.totalRecords} invoice
          </span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1 || refreshing}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Sebelumnya
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= pagination.totalPages || refreshing}
              onClick={() => setPage((p) => p + 1)}
            >
              Berikutnya
            </Button>
          </div>
        </div>
      )}

      <InvoicePrintDialog
        invoice={printInvoice}
        me={me}
        onClose={() => setPrintInvoice(null)}
      />
    </div>
  );
}

function HeroHeader() {
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <div className="hidden rounded-xl bg-primary/15 p-3 text-primary sm:block">
          <Receipt className="size-6" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Invoice</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Riwayat tagihan pembelian dan perpanjangan domain. Cetak invoice
            untuk keperluan pembukuan atau simpan sebagai PDF. Data
            di-sinkronkan langsung dari sistem billing registrar.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: string;
  hint?: string;
  tone: "default" | "warning" | "success";
}) {
  const toneMap = {
    default: {
      wrap: "border-border",
      icon: "bg-muted text-muted-foreground",
      value: "text-foreground",
    },
    warning: {
      wrap: "border-amber-200 bg-amber-50/40",
      icon: "bg-amber-100 text-amber-700",
      value: "text-amber-900",
    },
    success: {
      wrap: "border-emerald-200 bg-emerald-50/40",
      icon: "bg-emerald-100 text-emerald-700",
      value: "text-emerald-900",
    },
  }[tone];
  return (
    <div className={cn("rounded-xl border p-4", toneMap.wrap)}>
      <div className="flex items-center gap-3">
        <div className={cn("rounded-lg p-2", toneMap.icon)}>
          <Icon className="size-4" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
      </div>
      <p
        className={cn(
          "mt-3 truncate text-2xl font-bold tracking-tight",
          toneMap.value,
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="rounded-full bg-muted p-4">
        <Receipt className="size-8 text-muted-foreground" />
      </div>
      <p className="font-medium">
        {hasFilter ? "Tidak ada hasil" : "Belum ada invoice"}
      </p>
      <p className="max-w-md text-sm text-muted-foreground">
        {hasFilter
          ? "Coba ubah filter atau kata kunci pencarian."
          : "Invoice akan muncul otomatis setelah Anda membeli atau memperpanjang domain."}
      </p>
      {!hasFilter && (
        <Button variant="outline" size="sm" asChild className="mt-2">
          <Link href="/sites/new-with-domain">
            Beli domain
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      )}
    </div>
  );
}

function InvoiceRow({
  invoice,
  onPrint,
}: {
  invoice: Invoice;
  onPrint: () => void;
}) {
  const info = STATUS_LABEL[invoice.status] ?? {
    label: invoice.status,
    variant: "secondary" as const,
  };

  const firstJob = invoice.jobs?.[0];
  const extraJobs =
    invoice.jobs && invoice.jobs.length > 1 ? invoice.jobs.length - 1 : 0;
  const actionable =
    firstJob && ["Unpaid", "On Check"].includes(invoice.status);

  return (
    <TableRow className="group">
      <TableCell className="font-mono text-xs font-medium">
        {invoice.invoice_number}
      </TableCell>
      <TableCell>
        {firstJob ? (
          <div className="flex flex-col">
            <span className="font-medium">{firstJob.domain}</span>
            {extraJobs > 0 && (
              <span className="text-xs text-muted-foreground">
                +{extraJobs} domain lain
              </span>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {firstJob ? (
          <Badge variant="secondary" className="text-xs">
            {firstJob.kind === "renew"
              ? `Perpanjangan ${firstJob.years}th`
              : `Pendaftaran ${firstJob.years}th`}
          </Badge>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="text-right font-semibold tabular-nums">
        {formatIDR(invoice.total_price)}
      </TableCell>
      <TableCell>
        <Badge variant={info.variant} className="text-xs">
          {info.label}
        </Badge>
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
        {formatDate(invoice.created_at)}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={onPrint}
            title="Cetak / simpan PDF"
          >
            <Printer className="size-3.5" />
            <span className="hidden lg:inline">Cetak</span>
          </Button>
          {actionable && firstJob ? (
            <Button size="sm" variant="outline" asChild>
              <Link href={`/sites/pending/${firstJob.job_id}`}>
                Bayar
                <ArrowRight className="size-3" />
              </Link>
            </Button>
          ) : firstJob ? (
            <Button size="sm" variant="ghost" asChild>
              <Link href={`/sites/pending/${firstJob.job_id}`}>Detail</Link>
            </Button>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

function formatIDR(v: number): string {
  if (!Number.isFinite(v)) return "Rp 0";
  return `Rp ${Math.round(v).toLocaleString("id-ID")}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
