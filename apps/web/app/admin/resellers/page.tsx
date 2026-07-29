"use client";

// Admin: Reseller management — list applications + approve/suspend.
// Phase 1 scope: pending → active toggle. Advanced ops (tier assign, quota,
// audit trail) di phase berikutnya.

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Briefcase,
  Check,
  Clock,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Search,
  Shield,
  ShieldOff,
  X,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/lib/api";
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

type Reseller = {
  id: string;
  email: string;
  name: string;
  reseller_display_name: string;
  reseller_status: "pending_approval" | "active" | "suspended" | "";
  reseller_tier: string;
  phone_number: string;
  city: string;
  created_at: string;
  email_verified_at?: string;
};

type Paginated<T> = {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

const STATUS_LABEL: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "success" | "warning" }
> = {
  pending_approval: { label: "Menunggu Approval", variant: "warning" },
  active: { label: "Aktif", variant: "success" },
  suspended: { label: "Suspended", variant: "destructive" },
};

const FILTERS: { key: string; label: string; value: string; icon: React.ElementType }[] = [
  { key: "all", label: "Semua", value: "", icon: Briefcase },
  { key: "pending", label: "Pending", value: "pending_approval", icon: Clock },
  { key: "active", label: "Aktif", value: "active", icon: Shield },
  { key: "suspended", label: "Suspended", value: "suspended", icon: ShieldOff },
];

export default function AdminResellersPage() {
  const [items, setItems] = useState<Reseller[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  // Default: "all" supaya admin lihat gambar utuh. Kalau ada pending, chip
  // "Pending" akan tampil dot indicator supaya admin tetap tahu ada aksi.
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [actioningID, setActioningID] = useState<string | null>(null);
  // Pending count — refresh saat mount + setelah approve/suspend supaya
  // indicator dot on "Pending" chip selalu akurat.
  const [pendingCount, setPendingCount] = useState(0);

  async function refreshPendingCount() {
    try {
      const res = await api<Paginated<Reseller>>(
        "/api/v1/admin/resellers?status=pending_approval&page_size=1",
      );
      setPendingCount(res.total ?? 0);
    } catch {
      // silent — dot hanya informatif, tidak block flow
    }
  }

  useEffect(() => {
    refreshPendingCount();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [filter, debouncedSearch]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr(null);
      const status = FILTERS.find((f) => f.key === filter)?.value ?? "";
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (debouncedSearch) params.set("search", debouncedSearch);
      params.set("page", String(page));
      params.set("page_size", "20");
      try {
        const res = await api<Paginated<Reseller>>(
          `/api/v1/admin/resellers?${params.toString()}`,
        );
        if (cancelled) return;
        setItems(res.items ?? []);
        setTotal(res.total ?? 0);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [filter, debouncedSearch, page]);

  async function doAction(id: string, action: "approve" | "suspend") {
    if (actioningID) return;
    if (action === "suspend" && !confirm("Yakin suspend reseller ini? Mereka tidak akan bisa login sampai di-approve ulang.")) {
      return;
    }
    setActioningID(id);
    try {
      const updated = await api<Reseller>(
        `/api/v1/admin/resellers/${id}/${action}`,
        { method: "POST" },
      );
      setItems((rs) => rs.map((r) => (r.id === id ? updated : r)));
      toast.success(action === "approve" ? "Reseller di-approve" : "Reseller di-suspend");
      // Sync badge indicator setelah status berubah.
      refreshPendingCount();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActioningID(null);
    }
  }

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / 20)), [total]);

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <Briefcase className="size-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Reseller Management</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Review aplikasi reseller baru dan kelola status active/suspended.
        </p>
      </div>

      {/* Filter chips + search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const Icon = f.icon;
            const active = filter === f.key;
            const showPendingDot = f.key === "pending" && pendingCount > 0;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "relative inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all",
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {f.label}
                {showPendingDot && (
                  <>
                    {/* Count badge inline supaya admin tau exact jumlah */}
                    <span
                      className={cn(
                        "inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold",
                        active
                          ? "bg-primary-foreground text-primary"
                          : "bg-amber-500 text-white",
                      )}
                    >
                      {pendingCount}
                    </span>
                    {/* Ping animation untuk grab attention saat chip belum aktif */}
                    {!active && (
                      <span className="absolute -top-1 -right-1 flex size-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
                        <span className="relative inline-flex size-2.5 rounded-full bg-amber-500" />
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
        <div className="relative sm:w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari email / nama bisnis…"
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
                <TableHead>Bisnis</TableHead>
                <TableHead>PIC & Kontak</TableHead>
                <TableHead>Lokasi</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tanggal Daftar</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={loading ? "opacity-60" : ""}>
              {loading && items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-14 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-14 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Briefcase className="size-8 opacity-30" />
                      <p className="text-sm font-medium">
                        {debouncedSearch || filter !== "all"
                          ? "Tidak ada hasil"
                          : "Belum ada aplikasi reseller"}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((r) => {
                  const info = STATUS_LABEL[r.reseller_status] ?? {
                    label: r.reseller_status || "-",
                    variant: "secondary" as const,
                  };
                  const isPending = r.reseller_status === "pending_approval";
                  const isActive = r.reseller_status === "active";
                  const isSuspended = r.reseller_status === "suspended";
                  const acting = actioningID === r.id;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <p className="font-medium">{r.reseller_display_name || "-"}</p>
                        {r.reseller_tier && (
                          <Badge variant="secondary" className="mt-1 text-[10px]">
                            {r.reseller_tier}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">{r.name}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <Mail className="size-3" />
                          {r.email}
                        </p>
                        {r.phone_number && (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="size-3" />
                            {r.phone_number}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="size-3" />
                          {r.city || "-"}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant={info.variant} className="text-xs">
                          {info.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(r.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" asChild className="gap-1.5 text-primary hover:bg-blue-400 hover:text-blue-50">
                            <Link href={`/admin/resellers/${r.id}`}>Detail</Link>
                          </Button>
                          {isPending && (
                            <Button
                              size="sm"
                              variant="default"
                              disabled={acting}
                              onClick={() => doAction(r.id, "approve")}
                              className="gap-1.5"
                            >
                              {acting ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Check className="size-3.5" />
                              )}
                              Approve
                            </Button>
                          )}
                          {isActive && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={acting}
                              onClick={() => doAction(r.id, "suspend")}
                              className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                              {acting ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <ShieldOff className="size-3.5" />
                              )}
                              Suspend
                            </Button>
                          )}
                          {isSuspended && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={acting}
                              onClick={() => doAction(r.id, "approve")}
                              className="gap-1.5"
                            >
                              {acting ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Shield className="size-3.5" />
                              )}
                              Aktifkan lagi
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Halaman {page} dari {totalPages} — {total} reseller
          </span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Sebelumnya
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Berikutnya
            </Button>
          </div>
        </div>
      )}
    </div>
  );
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
