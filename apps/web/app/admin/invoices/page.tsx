"use client";

// /admin/invoices — list invoices. Detail + PDF preview + mark-paid + cancel
// via row action.

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, Loader2, Receipt, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  user_id: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  currency: string;
  status: string;
  payment_method: string;
  payment_gw_ref?: string;
  paid_at?: string;
  due_at: string;
  created_at: string;
};

const STATUS_VARIANT: Record<string, "success" | "secondary" | "warning" | "destructive" | "outline"> = {
  paid: "success",
  unpaid: "warning",
  draft: "secondary",
  expired: "destructive",
  cancelled: "destructive",
  refund: "outline",
};

function formatIDR(amount: number): string {
  return amount.toLocaleString("id-ID");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminInvoicesPage() {
  const [items, setItems] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  useEffect(() => {
    load();
  }, [page]);

  async function load() {
    setLoading(true);
    try {
      const res = await api<{ items: Invoice[] }>(
        `/api/v1/admin/invoices?page=${page}&limit=50`,
      );
      setItems(res.items || []);
    } catch (e: unknown) {
      toast.error("Gagal load invoices", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  async function markPaid(inv: Invoice) {
    const ref = prompt(
      `Tandai INV ${inv.number} sebagai paid.\nNomor referensi bank (opsional):`,
    );
    if (ref === null) return; // user cancelled
    setBusy((s) => ({ ...s, [inv.id]: true }));
    try {
      await api(`/api/v1/admin/invoices/${inv.id}/mark-paid`, {
        method: "POST",
        body: JSON.stringify({ provider_ref: ref || undefined }),
      });
      toast.success(`${inv.number} ditandai paid`);
      await load();
    } catch (e: unknown) {
      toast.error("Gagal mark-paid", { description: (e as Error).message });
    } finally {
      setBusy((s) => ({ ...s, [inv.id]: false }));
    }
  }

  async function cancelInv(inv: Invoice) {
    if (!confirm(`Batalkan invoice ${inv.number}?`)) return;
    setBusy((s) => ({ ...s, [inv.id]: true }));
    try {
      await api(`/api/v1/admin/invoices/${inv.id}/cancel`, { method: "POST" });
      toast.success(`${inv.number} dibatalkan`);
      await load();
    } catch (e: unknown) {
      toast.error("Gagal cancel", { description: (e as Error).message });
    } finally {
      setBusy((s) => ({ ...s, [inv.id]: false }));
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Receipt className="h-6 w-6" />
        <div>
          <h1 className="text-2xl font-semibold">Invoices</h1>
          <p className="text-sm text-muted-foreground">
            Daftar invoice semua user. Mark-paid manual untuk pembayaran transfer bank yang di-verify admin.
          </p>
        </div>
      </div>

      <Card className={`overflow-hidden p-0 ${loading ? "opacity-60" : ""}`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nomor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Dibuat</TableHead>
              <TableHead>Dibayar</TableHead>
              <TableHead className="w-[220px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Belum ada invoice.
                </TableCell>
              </TableRow>
            )}
            {items.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="font-mono text-sm">{inv.number}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[inv.status] || "secondary"}>
                    {inv.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{inv.payment_method}</TableCell>
                <TableCell className="text-right font-medium">
                  Rp {formatIDR(inv.total)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(inv.created_at)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {inv.paid_at ? formatDate(inv.paid_at) : "—"}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Link href={`/api/v1/admin/invoices/${inv.id}/pdf`} target="_blank">
                      <Button size="sm" variant="ghost" title="Preview PDF">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                    {(inv.status === "unpaid" || inv.status === "draft") && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy[inv.id]}
                          onClick={() => markPaid(inv)}
                          title="Tandai paid (manual verify)"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy[inv.id]}
                          onClick={() => cancelInv(inv)}
                          title="Batalkan invoice"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {loading && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          ← Prev
        </Button>
        <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)}>
          Next →
        </Button>
      </div>
    </div>
  );
}
