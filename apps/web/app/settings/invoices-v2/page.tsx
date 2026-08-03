"use client";

// /settings/invoices-v2 — riwayat invoice user dari sistem local invoices
// (Phase 1 self-sufficient). Beda dari /settings/invoices legacy yang
// proxy ke registrar-api PANDI.
//
// Setelah Phase 1 wallet + full checkout migrate, ini akan jadi
// canonical /settings/invoices dan legacy di-hapus.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Printer, Receipt } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Invoice = {
  id: string;
  number: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  currency: string;
  status: string;
  payment_method: string;
  paid_at?: string;
  due_at: string;
  created_at: string;
};

const STATUS_MAP: Record<
  string,
  { label: string; variant: "success" | "secondary" | "warning" | "destructive" | "outline" }
> = {
  draft: { label: "Draft", variant: "secondary" },
  unpaid: { label: "Belum dibayar", variant: "warning" },
  paid: { label: "Lunas", variant: "success" },
  expired: { label: "Kedaluwarsa", variant: "destructive" },
  cancelled: { label: "Dibatalkan", variant: "secondary" },
  refund: { label: "Refund", variant: "outline" },
};

function formatIDR(v: number): string {
  return `Rp ${v.toLocaleString("id-ID")}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function InvoicesV2Page() {
  const [items, setItems] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function load() {
    setLoading(true);
    try {
      const res = await api<{ items: Invoice[] }>(
        `/api/v1/invoices/v2?page=${page}&limit=20`,
      );
      setItems(res.items || []);
    } catch (e: unknown) {
      toast.error("Gagal load invoice", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="hidden rounded-xl bg-primary/15 p-3 text-primary sm:block">
            <Receipt className="size-6" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Invoice (Baru)
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              Riwayat invoice dari sistem billing internal. Untuk invoice lama
              dari sistem registrar, lihat di{" "}
              <Link href="/settings/invoices" className="underline">
                Invoice legacy
              </Link>
              .
            </p>
          </div>
        </div>
      </div>

      <Card className={`overflow-hidden p-0 ${loading ? "opacity-60" : ""}`}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-[180px]">Nomor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead className="text-right">PPN</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Dibuat</TableHead>
                <TableHead className="w-[100px] text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-14 text-center">
                    <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-16">
                    <EmptyState />
                  </TableCell>
                </TableRow>
              ) : (
                items.map((inv) => {
                  const info = STATUS_MAP[inv.status] || {
                    label: inv.status,
                    variant: "secondary" as const,
                  };
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-xs font-medium">
                        {inv.number}
                      </TableCell>
                      <TableCell>
                        <Badge variant={info.variant} className="text-xs">
                          {info.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{inv.payment_method}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {formatIDR(inv.subtotal)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                        {inv.tax_amount > 0 ? formatIDR(inv.tax_amount) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {formatIDR(inv.total)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(inv.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/api/v1/invoices/v2/${inv.id}/pdf`} target="_blank">
                          <Button size="sm" variant="ghost" title="Cetak / preview PDF">
                            <Printer className="size-3.5" />
                            <span className="ml-1 hidden lg:inline">Cetak</span>
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1 || loading}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          ← Sebelumnya
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={loading || items.length < 20}
          onClick={() => setPage((p) => p + 1)}
        >
          Berikutnya →
        </Button>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="rounded-full bg-muted p-4">
        <Receipt className="size-8 text-muted-foreground" />
      </div>
      <p className="font-medium">Belum ada invoice</p>
      <p className="max-w-md text-sm text-muted-foreground">
        Invoice akan muncul otomatis setelah Anda membeli atau memperpanjang
        domain via wizard.
      </p>
      <Button variant="outline" size="sm" asChild className="mt-2">
        <Link href="/sites/new-with-domain">
          Beli domain
          <ExternalLink className="size-3.5" />
        </Link>
      </Button>
    </div>
  );
}
