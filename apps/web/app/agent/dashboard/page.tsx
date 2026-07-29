"use client";

// Agent dashboard — Phase 2 skeleton. Fokus ke daftarkan klien; tidak ada
// invite agent (privilege reseller). Wallet & pricing di-inherit dari reseller.

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Clock, Globe2, Loader2, PlusCircle, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";

type PurchaseRow = {
  job_id: string;
  domain: string;
  status: string;
  kind: string;
  client_id: string;
  client_name: string;
  client_email: string;
};

type WalletSnapshot = { balance: number; currency: string };

export default function AgentDashboardPage() {
  const [purchases, setPurchases] = useState<PurchaseRow[] | null>(null);
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  useEffect(() => {
    api<PurchaseRow[]>("/api/v1/agent/purchases?limit=10")
      .then((r) => setPurchases(r ?? []))
      .catch(() => setPurchases([]));
    api<WalletSnapshot>("/api/v1/agent/wallet")
      .then((w) => setWallet(w))
      .catch(() => setWallet({ balance: 0, currency: "IDR" }));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Selamat datang!</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Portal agent. Bantu reseller Anda daftarkan klien + kelola situs
          mereka.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatTile icon={Users} label="Klien saya" value="0" />
        <StatTile
          icon={Wallet}
          label="Wallet reseller induk"
          value={wallet ? formatIDR(wallet.balance) : "…"}
        />
      </div>

      <Card>
        <CardContent className="grid gap-3 p-5 sm:grid-cols-1">
          <QuickAction
            title="Daftarkan Klien Baru"
            desc="Tambah klien lalu beli domain atas nama mereka."
            icon={PlusCircle}
            href="/agent/clients"
          />
        </CardContent>
      </Card>

      <PurchasesCard rows={purchases} />

      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Cara kerja</h3>
          <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
            <li>Kumpulkan info klien (nama, email, alamat).</li>
            <li>Daftarkan klien di menu Klien — mereka terima email invite.</li>
            <li>Beli domain + buat situs pakai wallet reseller (Phase 3).</li>
            <li>Serahkan akses ke klien saat siap.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

function PurchasesCard({ rows }: { rows: PurchaseRow[] | null }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <Globe2 className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Domain yang saya proses</h3>
        </div>
        {rows === null ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Memuat…
          </div>
        ) : rows.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Belum ada domain yang Anda beli untuk klien. Buka daftar klien →
            tombol <span className="font-medium text-foreground">Beli Domain</span>.
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.job_id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium font-mono">{r.domain}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    untuk {r.client_name || r.client_email}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={r.status} />
                  <Button size="sm" variant="ghost" asChild className="gap-1">
                    <Link href={`/sites/pending/${r.job_id}`}>
                      Buka
                      <ArrowRight className="size-3" />
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "active") return <Badge variant="success" className="text-[10px]">Aktif</Badge>;
  if (status === "failed") return <Badge variant="destructive" className="text-[10px]">Gagal</Badge>;
  if (status === "cancelled") return <Badge variant="secondary" className="text-[10px]">Batal</Badge>;
  if (status === "expired") return <Badge variant="secondary" className="text-[10px]">Kadaluarsa</Badge>;
  return (
    <Badge variant="warning" className="gap-1 text-[10px]">
      <Clock className="size-2.5" />
      Proses
    </Badge>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-muted p-2 text-muted-foreground">
            <Icon className="size-4" />
          </div>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
        <p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

function formatIDR(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function QuickAction({
  title,
  desc,
  icon: Icon,
  href,
  disabled,
  note,
}: {
  title: string;
  desc: string;
  icon: React.ElementType;
  href: string;
  disabled?: boolean;
  note?: string;
}) {
  const content = (
    <div className="flex items-start gap-3">
      <div className="rounded-lg bg-primary/10 p-2 text-primary">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
        {disabled && note ? (
          <p className="mt-1 text-[10px] italic text-amber-600">{note}</p>
        ) : null}
      </div>
      {!disabled && <ArrowRight className="size-4 text-muted-foreground" />}
    </div>
  );
  if (disabled) {
    return (
      <div className="cursor-not-allowed rounded-lg border border-dashed p-3 opacity-60">
        {content}
      </div>
    );
  }
  return (
    <Link
      href={href}
      className="rounded-lg border p-3 transition-colors hover:border-primary hover:bg-primary/5"
    >
      {content}
    </Link>
  );
}
