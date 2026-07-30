"use client";

// Detail agent — profil + tabs Klien + Domain + Reporting.
// Reporting masih placeholder (butuh accounting model utuh — margin per
// job, settlement out-of-system) — tapi kartu preview sudah tampil supaya
// reseller punya konteks dev roadmap.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Globe2,
  Info,
  Loader2,
  Mail,
  UserCircle,
  Users,
  Wallet,
} from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type AgentDetail = {
  id: string;
  email: string;
  name: string;
  phone_number?: string;
  created_at: string;
  email_verified: boolean;
  email_verified_at?: string;
  clients: number;
  active_domains: number;
  pending_jobs: number;
  expiring_30_days: number;
  expiring_90_days: number;
};

type AgentClient = {
  client_id: string;
  assignment_id: string;
  email: string;
  name: string;
  access_status: string;
  email_verified: boolean;
  created_at: string;
};

type AgentPurchase = {
  job_id: string;
  domain: string;
  status: string;
  kind: string;
  years: number;
  expires_at?: string;
  created_at: string;
  user_id: string;
  payment_url?: string;
};

const STATUS_LABEL: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  active: { label: "Aktif", variant: "success" },
  pending_payment: { label: "Menunggu bayar", variant: "warning" },
  pending_document: { label: "Perlu dokumen", variant: "warning" },
  pending_provisioning: { label: "Provisioning", variant: "warning" },
  pending_approval: { label: "Menunggu approval", variant: "warning" },
  failed: { label: "Gagal", variant: "destructive" },
  expired: { label: "Expired", variant: "destructive" },
  cancelled: { label: "Dibatalkan", variant: "secondary" },
};

export default function AgentDetailPage() {
  const { agent_id } = useParams<{ agent_id: string }>();
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"profile" | "clients" | "domains" | "reporting">("profile");

  useEffect(() => {
    setLoading(true);
    setErr(null);
    api<AgentDetail>(`/api/v1/reseller/agents/${agent_id}`)
      .then(setDetail)
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [agent_id]);

  if (loading && !detail) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Memuat data agent…
      </div>
    );
  }

  if (err && !detail) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0 translate-y-0.5" />
          <span>{err}</span>
        </div>
      </div>
    );
  }

  if (!detail) return null;

  return (
    <div className="space-y-6">
      <BackLink />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <UserCircle className="size-5 text-primary" />
            <h1 className="truncate text-2xl font-bold tracking-tight">
              {detail.name || detail.email}
            </h1>
            {detail.email_verified ? (
              <Badge variant="success" className="gap-1 text-xs">
                <CheckCircle2 className="size-3" />
                Aktif
              </Badge>
            ) : (
              <Badge variant="warning" className="gap-1 text-xs">
                <Clock className="size-3" />
                Belum accept invite
              </Badge>
            )}
          </div>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Mail className="size-3.5" />
            <span className="font-mono text-xs">{detail.email}</span>
          </p>
        </div>
      </div>

      {/* Ringkasan tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile icon={Users} label="Klien" value={String(detail.clients)} />
        <StatTile
          icon={Globe2}
          label="Domain aktif"
          value={String(detail.active_domains)}
          sub={detail.expiring_30_days > 0 ? `${detail.expiring_30_days} expire ≤ 30 hari` : undefined}
        />
        <StatTile icon={Clock} label="Domain proses" value={String(detail.pending_jobs)} />
        <StatTile
          icon={Wallet}
          label="Estimasi omzet"
          value="—"
          sub="Segera hadir"
        />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="w-full justify-start bg-muted/40">
          <TabsTrigger value="profile">Profil</TabsTrigger>
          <TabsTrigger value="clients">
            Klien{" "}
            <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px]">
              {detail.clients}
            </span>
          </TabsTrigger>
          <TabsTrigger value="domains">
            Domain{" "}
            <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px]">
              {detail.active_domains + detail.pending_jobs}
            </span>
          </TabsTrigger>
          <TabsTrigger value="reporting">
            <BarChart3 className="mr-1 size-3.5" />
            Reporting
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <ProfileTab detail={detail} />
        </TabsContent>
        <TabsContent value="clients" className="mt-4">
          <ClientsTab agentID={agent_id} />
        </TabsContent>
        <TabsContent value="domains" className="mt-4">
          <DomainsTab agentID={agent_id} />
        </TabsContent>
        <TabsContent value="reporting" className="mt-4">
          <ReportingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BackLink() {
  return (
    <Button variant="ghost" size="sm" asChild className="gap-1.5">
      <Link href="/reseller/team">
        <ArrowLeft className="size-4" />
        Kembali ke daftar agent
      </Link>
    </Button>
  );
}

// -------- Profile tab (identity + timestamps) --------

function ProfileTab({ detail }: { detail: AgentDetail }) {
  return (
    <Card>
      <CardContent className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2">
        <Field label="Nama" value={detail.name} />
        <Field label="Email" value={detail.email} mono />
        <Field label="Nomor HP" value={detail.phone_number || "—"} mono />
        <Field label="Terdaftar" value={formatDate(detail.created_at)} />
        <Field
          label="Verifikasi email"
          value={
            detail.email_verified && detail.email_verified_at
              ? `${formatDate(detail.email_verified_at)}`
              : "Belum verify"
          }
        />
      </CardContent>
    </Card>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={mono ? "mt-0.5 truncate font-mono text-xs" : "mt-0.5 truncate text-sm"}>
        {value}
      </p>
    </div>
  );
}

// -------- Clients tab --------

function ClientsTab({ agentID }: { agentID: string }) {
  const [items, setItems] = useState<AgentClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    api<AgentClient[]>(`/api/v1/reseller/agents/${agentID}/clients`)
      .then((r) => setItems(r ?? []))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [agentID]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Memuat…
      </div>
    );
  }
  if (err) return <ErrBox msg={err} />;
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-14 text-muted-foreground">
          <Users className="size-8 opacity-30" />
          <p className="text-sm font-medium">Agent belum punya klien</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((c) => (
        <Card key={c.assignment_id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold">{c.name || c.email}</p>
                <Badge
                  variant={c.access_status === "active" ? "success" : "warning"}
                  className="text-[10px]"
                >
                  {c.access_status === "active" ? "Aktif" : "Setup"}
                </Badge>
                {c.email_verified ? (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600">
                    <CheckCircle2 className="size-2.5" />
                    verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600">
                    <Clock className="size-2.5" />
                    belum accept
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                {c.email}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                daftar {formatDate(c.created_at)}
              </p>
            </div>
            <Button size="sm" variant="outline" asChild>
              <Link href={`/reseller/clients/${c.client_id}`}>Detail klien</Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// -------- Domains tab --------

function DomainsTab({ agentID }: { agentID: string }) {
  const [items, setItems] = useState<AgentPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    api<AgentPurchase[]>(`/api/v1/reseller/agents/${agentID}/purchases`)
      .then((r) => setItems(r ?? []))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [agentID]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Memuat…
      </div>
    );
  }
  if (err) return <ErrBox msg={err} />;
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-14 text-muted-foreground">
          <Globe2 className="size-8 opacity-30" />
          <p className="text-sm font-medium">Agent belum daftarkan domain apa pun</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((p) => {
        const st = STATUS_LABEL[p.status] ?? { label: p.status, variant: "secondary" as const };
        const isPending = p.status.startsWith("pending_") || p.status === "failed";
        const detailHref = isPending
          ? `/sites/pending/${p.job_id}`
          : `/reseller/domains/${p.domain}`;
        return (
          <Card key={p.job_id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Globe2 className="size-4 text-primary" />
                  <p className="truncate font-mono text-sm font-semibold">{p.domain}</p>
                  <Badge variant={st.variant} className="text-[10px]">
                    {st.label}
                  </Badge>
                  {p.kind && p.kind !== "register" && (
                    <Badge variant="secondary" className="text-[10px]">
                      {p.kind}
                    </Badge>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  {p.years ? <span>{p.years} tahun</span> : null}
                  {p.expires_at && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="size-3" />
                      expire {formatDate(p.expires_at)}
                    </span>
                  )}
                  <span>dibeli {formatDate(p.created_at)}</span>
                </div>
              </div>
              <Button size="sm" variant="outline" asChild>
                <Link href={detailHref}>{isPending ? "Lanjut proses" : "Kelola"}</Link>
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// -------- Reporting tab (placeholder) --------

function ReportingTab() {
  return (
    <Card className="border-dashed">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <BarChart3 className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold">Reporting Penghasilan Agent</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Segera hadir. Halaman ini akan tampilkan ringkasan pendapatan
              agent per periode berdasarkan harga jual (kulakan) yang Anda set,
              plus breakdown per klien + jenis transaksi (register / renew).
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <PreviewCard
            title="Omzet total"
            desc="Sum agent_price × qty per periode (harian / bulanan / tahunan)."
          />
          <PreviewCard
            title="Margin per transaksi"
            desc="Selisih harga jual client ke agent dan biaya wholesale platform."
          />
          <PreviewCard
            title="Rekap per klien"
            desc="Domain aktif + pending + failed, grouped by klien yang di-manage."
          />
          <PreviewCard
            title="Export CSV / Excel"
            desc="Download rekap untuk settlement out-of-system atau audit."
          />
        </div>

        <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
          <Info className="size-3.5 shrink-0 translate-y-0.5 text-primary" />
          <span>
            Setup harga jual dulu di{" "}
            <Link href="/reseller/pricing" className="underline">
              menu Harga Jual
            </Link>{" "}
            supaya perhitungan omzet akurat begitu fitur ini live.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function PreviewCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
    </div>
  );
}

// -------- shared --------

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
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
        {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function ErrBox({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      <AlertCircle className="size-4 shrink-0 translate-y-0.5" />
      <span>{msg}</span>
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
