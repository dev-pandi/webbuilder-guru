"use client";

// /admin/promos/[id] — detail promo + redemption history.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertCircle, ArrowLeft, Loader2, Tag } from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Promo = {
  id: string;
  code: string;
  description: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  applies_to: "register" | "renew" | "both";
  allowed_tlds: string[];
  min_subtotal: number;
  max_discount: number;
  valid_from?: string;
  valid_until?: string;
  max_uses?: number;
  max_uses_per_user: number;
  active: boolean;
  created_at: string;
};

type Redemption = {
  id: string;
  promo_id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  invoice_id: string;
  invoice_number: string;
  discount_applied: number;
  created_at: string;
};

export default function AdminPromoDetailPage() {
  const params = useParams<{ id: string }>();
  const promoID = params.id;
  const [promo, setPromo] = useState<Promo | null>(null);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [p, r] = await Promise.all([
          api<Promo>(`/api/v1/admin/promos/${promoID}`),
          api<Redemption[]>(`/api/v1/admin/promos/${promoID}/redemptions`),
        ]);
        setPromo(p);
        setRedemptions(r ?? []);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [promoID]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat…
      </div>
    );
  }
  if (err || !promo) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild className="gap-1.5">
          <Link href="/admin/promos">
            <ArrowLeft className="size-4" /> Promo
          </Link>
        </Button>
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0 translate-y-0.5" />
          <span>{err ?? "Promo tidak ditemukan"}</span>
        </div>
      </div>
    );
  }

  const totalDiscount = redemptions.reduce((sum, r) => sum + r.discount_applied, 0);

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="gap-1.5">
          <Link href="/admin/promos">
            <ArrowLeft className="size-4" /> Promo
          </Link>
        </Button>
      </div>

      <div>
        <div className="mb-1 flex items-center gap-2">
          <Tag className="size-5 text-primary" />
          <h1 className="font-mono text-2xl font-bold tracking-tight">{promo.code}</h1>
          {promo.active ? (
            <Badge variant="success">Aktif</Badge>
          ) : (
            <Badge variant="secondary">Non-aktif</Badge>
          )}
        </div>
        {promo.description && (
          <p className="text-sm text-muted-foreground">{promo.description}</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Total pakai" value={String(redemptions.length)} />
        <StatTile
          label="Diskon terserap"
          value={formatIDR(totalDiscount)}
        />
        <StatTile
          label="Sisa slot"
          value={
            promo.max_uses != null
              ? `${Math.max(0, promo.max_uses - redemptions.length)} / ${promo.max_uses}`
              : "∞"
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Konfigurasi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Diskon">
            {promo.discount_type === "percent"
              ? `${promo.discount_value}%`
              : formatIDR(promo.discount_value)}
            {promo.max_discount > 0 && promo.discount_type === "percent" && (
              <span className="ml-1 text-muted-foreground">
                (max {formatIDR(promo.max_discount)})
              </span>
            )}
          </Row>
          <Row label="Berlaku untuk">{appliesToLabel(promo.applies_to)}</Row>
          <Row label="TLD">
            {promo.allowed_tlds.length === 0
              ? "Semua TLD"
              : promo.allowed_tlds.map((t) => `.${t}`).join(", ")}
          </Row>
          <Row label="Min subtotal">
            {promo.min_subtotal > 0 ? formatIDR(promo.min_subtotal) : "Tidak ada minimum"}
          </Row>
          <Row label="Max pakai per user">{promo.max_uses_per_user}</Row>
          {promo.valid_from && <Row label="Berlaku dari">{formatDate(promo.valid_from)}</Row>}
          {promo.valid_until && (
            <Row label="Berlaku sampai">{formatDate(promo.valid_until)}</Row>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden p-0">
        <CardHeader className="p-4">
          <CardTitle className="text-sm">Riwayat pemakaian ({redemptions.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {redemptions.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Belum ada yang pakai promo ini.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead className="text-right">Diskon</TableHead>
                  <TableHead className="text-right">Tanggal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {redemptions.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="text-sm font-medium">{r.user_name}</div>
                      <div className="text-xs text-muted-foreground">{r.user_email}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.invoice_number}</TableCell>
                    <TableCell className="text-right font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatIDR(r.discount_applied)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {formatDateTime(r.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-bold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function formatIDR(n: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

function appliesToLabel(v: string): string {
  if (v === "register") return "Register saja";
  if (v === "renew") return "Renew saja";
  return "Register + Renew";
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

function formatDateTime(iso: string): string {
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
