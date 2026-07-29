"use client";

// /agent/pricing — read-only view kulakan dari reseller induk (Phase 3.12).
// Endpoint sama dengan /reseller/pricing tapi handler filter response
// (agent tidak lihat client_price, cuma agent_price sebagai kulakan mereka).

import { useEffect, useState } from "react";
import {
  AlertCircle,
  DollarSign,
  Info,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PriceRow = {
  id: string;
  tld: string;
  agent_register_price: number;
  agent_renew_price: number;
  client_register_price: number; // di response, tapi tidak kita tampilkan
  client_renew_price: number;
  currency: string;
};

export default function AgentPricingPage() {
  const [items, setItems] = useState<PriceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api<PriceRow[]>("/api/v1/agent/pricing")
      .then((r) => setItems(r ?? []))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <DollarSign className="size-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Kulakan Reseller Induk</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Harga register + renew per TLD yang reseller induk Anda set. Anda
          bayar segini ke reseller (settlement out-of-system), lalu bebas
          markup ke client.
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
        <Info className="size-4 shrink-0 translate-y-0.5 text-primary" />
        <div className="text-xs text-muted-foreground">
          Reseller induk yang set harga ini. Kalau ada perubahan, minta reseller
          Anda untuk update. Anda tidak bisa edit dari sini.
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
                <TableHead>TLD</TableHead>
                <TableHead>Kulakan Register</TableHead>
                <TableHead>Kulakan Renew</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={loading ? "opacity-60" : ""}>
              {loading && items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-14 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-14 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <DollarSign className="size-8 opacity-30" />
                      <p className="text-sm font-medium">Reseller induk belum set harga</p>
                      <p className="text-xs">
                        Domain masih pakai <b>retail</b> platform sebagai default.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono font-medium">.{p.tld}</TableCell>
                    <TableCell>{fmt(p.agent_register_price, p.currency)}</TableCell>
                    <TableCell>{fmt(p.agent_renew_price, p.currency)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function fmt(amount: number, currency: string): string {
  if (currency === "IDR") {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(amount);
  }
  return `${currency} ${amount.toLocaleString("id-ID")}`;
}
