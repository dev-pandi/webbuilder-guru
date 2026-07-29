"use client";

// Reseller dashboard — Phase 1 skeleton. Empty state karena belum ada
// data (client / agent / domain). Phase 2-3 nanti populate real stats.

import Link from "next/link";
import { ArrowRight, PlusCircle, UserPlus, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function ResellerDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Selamat datang!</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Portal reseller Anda. Mulai dari daftarkan klien baru atau undang agent
          ke tim.
        </p>
      </div>

      {/* Empty state stat tiles — Phase 3+ populate real numbers */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile icon={Users} label="Klien" value="0" />
        <StatTile icon={UserPlus} label="Agent" value="0" />
        <StatTile icon={Wallet} label="Saldo Wallet" value="Rp 0" />
      </div>

      {/* Quick actions */}
      <Card>
        <CardContent className="grid gap-3 p-5 sm:grid-cols-2">
          <QuickAction
            title="Daftarkan Klien Baru"
            desc="Beli domain + buat situs atas nama klien."
            icon={PlusCircle}
            href="/reseller/clients/new"
            disabled
            note="Aktif setelah Phase 3 (Purchase on-behalf-of)"
          />
          <QuickAction
            title="Undang Agent"
            desc="Tambahkan agent freelancer ke tim Anda."
            icon={UserPlus}
            href="/reseller/team/invite"
            disabled
            note="Aktif setelah Phase 2 (Invitation flow)"
          />
        </CardContent>
      </Card>

      {/* Getting started checklist */}
      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Checklist onboarding</h3>
          <ul className="space-y-2 text-sm">
            <StepItem done label="Aplikasi disetujui" />
            <StepItem label="Set harga jual (agent + client)" href="/reseller/pricing" />
            <StepItem label="Top-up wallet awal" href="/reseller/wallet" />
            <StepItem label="Undang agent pertama (opsional)" />
            <StepItem label="Daftarkan klien pertama" />
          </ul>
        </CardContent>
      </Card>
    </div>
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

function StepItem({
  done,
  label,
  href,
}: {
  done?: boolean;
  label: string;
  href?: string;
}) {
  const inner = (
    <span className="flex items-center gap-2">
      <span
        className={
          done
            ? "inline-flex size-5 items-center justify-center rounded-full bg-emerald-500 text-xs text-white"
            : "inline-flex size-5 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/40 text-xs text-muted-foreground"
        }
      >
        {done ? "✓" : ""}
      </span>
      <span className={done ? "line-through opacity-60" : ""}>{label}</span>
    </span>
  );
  if (href && !done) {
    return (
      <li>
        <Link
          href={href}
          className="inline-flex items-center gap-2 hover:text-foreground"
        >
          {inner}
          <span className="ml-auto text-xs text-primary">Buka →</span>
        </Link>
      </li>
    );
  }
  return <li>{inner}</li>;
}
