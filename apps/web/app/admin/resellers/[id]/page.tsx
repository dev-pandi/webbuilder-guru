"use client";

// Admin: Detail reseller lengkap dengan tab. Load basic detail on mount,
// data per-tab lazy-load saat tab dibuka (kurangi initial payload).

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Briefcase,
  Building2,
  CheckCircle2,
  Clock,
  Globe2,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Shield,
  ShieldOff,
  UserCircle,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Reseller = {
  id: string;
  email: string;
  name: string;
  reseller_display_name: string;
  reseller_status: "pending_approval" | "active" | "suspended" | "";
  reseller_tier: string;
  phone_number: string;
  city: string;
  state?: string;
  address?: string;
  postal_code?: string;
  nik?: string;
  created_at: string;
  email_verified_at?: string;
  counts?: {
    clients: number;
    agents: number;
    active_domains: number;
    pending_domains: number;
  };
};

type ClientRow = {
  assignment: {
    id: string;
    manager_id: string;
    client_id: string;
    manager_role: string;
    access_status: string;
    created_at: string;
  };
  email: string;
  name: string;
  email_verified: boolean;
  created_at: string;
};

type AgentRow = {
  id: string;
  email: string;
  name: string;
  created_at: string;
  email_verified_at?: string;
};

type Domain = {
  id: string;
  domain: string;
  user_id: string;
  purchased_by?: string;
  kind: string;
  status: string;
  years: number;
  expires_at?: string;
  created_at: string;
};

const STATUS_LABEL: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "success" | "warning" }
> = {
  pending_approval: { label: "Menunggu Approval", variant: "warning" },
  active: { label: "Aktif", variant: "success" },
  suspended: { label: "Suspended", variant: "destructive" },
};

export default function AdminResellerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [reseller, setReseller] = useState<Reseller | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState("overview");
  const [acting, setActing] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await api<Reseller>(`/api/v1/admin/resellers/${id}`);
      setReseller(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function doAction(action: "approve" | "suspend") {
    if (!reseller) return;
    if (
      action === "suspend" &&
      !confirm("Yakin suspend reseller ini? Mereka tidak akan bisa login sampai di-approve ulang.")
    )
      return;
    setActing(true);
    try {
      await api(`/api/v1/admin/resellers/${id}/${action}`, { method: "POST" });
      toast.success(action === "approve" ? "Reseller di-approve" : "Reseller di-suspend");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActing(false);
    }
  }

  if (loading && !reseller) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Memuat detail reseller…
      </div>
    );
  }

  if (err && !reseller) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/admin/resellers")} className="gap-1.5">
          <ArrowLeft className="size-4" />
          Kembali
        </Button>
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0 translate-y-0.5" />
          <span>{err}</span>
        </div>
      </div>
    );
  }

  if (!reseller) return null;

  const info = STATUS_LABEL[reseller.reseller_status] ?? {
    label: reseller.reseller_status || "-",
    variant: "secondary" as const,
  };
  const isPending = reseller.reseller_status === "pending_approval";
  const isActive = reseller.reseller_status === "active";
  const isSuspended = reseller.reseller_status === "suspended";

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="gap-1.5">
          <Link href="/admin/resellers">
            <ArrowLeft className="size-4" />
            Daftar Reseller
          </Link>
        </Button>
      </div>

      {/* Header card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Briefcase className="size-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  {reseller.reseller_display_name || reseller.name}
                </h1>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Mail className="size-3.5" />
                    {reseller.email}
                  </span>
                  {reseller.phone_number && (
                    <span className="flex items-center gap-1">
                      <Phone className="size-3.5" />
                      {reseller.phone_number}
                    </span>
                  )}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant={info.variant} className="text-xs">
                    {info.label}
                  </Badge>
                  {reseller.reseller_tier && (
                    <Badge variant="secondary" className="text-[10px]">
                      Tier: {reseller.reseller_tier}
                    </Badge>
                  )}
                  {reseller.email_verified_at ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
                      <CheckCircle2 className="size-3" />
                      Email verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] text-amber-600">
                      <Clock className="size-3" />
                      Email belum verified
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {isPending && (
                <Button onClick={() => doAction("approve")} disabled={acting} className="gap-1.5">
                  {acting ? <Loader2 className="size-3.5 animate-spin" /> : <Shield className="size-3.5" />}
                  Approve
                </Button>
              )}
              {isActive && (
                <Button
                  variant="outline"
                  onClick={() => doAction("suspend")}
                  disabled={acting}
                  className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  {acting ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldOff className="size-3.5" />}
                  Suspend
                </Button>
              )}
              {isSuspended && (
                <Button variant="outline" onClick={() => doAction("approve")} disabled={acting} className="gap-1.5">
                  {acting ? <Loader2 className="size-3.5 animate-spin" /> : <Shield className="size-3.5" />}
                  Aktifkan lagi
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stat tiles */}
      {reseller.counts && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile icon={Users} label="Total Klien" value={String(reseller.counts.clients)} />
          <StatTile icon={UserCircle} label="Total Agent" value={String(reseller.counts.agents)} />
          <StatTile icon={Globe2} label="Domain Aktif" value={String(reseller.counts.active_domains)} />
          <StatTile
            icon={Clock}
            label="Domain Pending"
            value={String(reseller.counts.pending_domains)}
            highlight={reseller.counts.pending_domains > 0}
          />
        </div>
      )}

      {/* Tabbed content */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start bg-muted/40">
          <TabsTrigger value="overview">Detail</TabsTrigger>
          <TabsTrigger value="clients">
            Klien
            {reseller.counts && reseller.counts.clients > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 text-[10px] text-primary">
                {reseller.counts.clients}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="agents">
            Agent
            {reseller.counts && reseller.counts.agents > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 text-[10px] text-primary">
                {reseller.counts.agents}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="domains">
            Domain
            {reseller.counts && reseller.counts.active_domains > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 text-[10px] text-primary">
                {reseller.counts.active_domains}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="activity">Aktivitas</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab reseller={reseller} />
        </TabsContent>
        <TabsContent value="clients" className="mt-4">
          {tab === "clients" && <ClientsTab id={id} />}
        </TabsContent>
        <TabsContent value="agents" className="mt-4">
          {tab === "agents" && <AgentsTab id={id} />}
        </TabsContent>
        <TabsContent value="domains" className="mt-4">
          {tab === "domains" && <DomainsTab id={id} />}
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          {tab === "activity" && <ActivityTab id={id} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-amber-500/40" : undefined}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={highlight ? "rounded-lg bg-amber-500/10 p-2 text-amber-600" : "rounded-lg bg-muted p-2 text-muted-foreground"}>
            <Icon className="size-4" />
          </div>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
        <p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

function OverviewTab({ reseller }: { reseller: Reseller }) {
  return (
    <Card>
      <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
        <Section title="PIC & Kontak">
          <Row label="Nama PIC" value={reseller.name} />
          <Row label="Email" value={reseller.email} mono />
          <Row label="Telepon" value={reseller.phone_number || "—"} mono />
        </Section>
        <Section title="Alamat">
          <Row label="Alamat" value={reseller.address || "—"} />
          <Row label="Kota" value={reseller.city || "—"} />
          <Row label="Provinsi" value={reseller.state || "—"} />
          <Row label="Kode Pos" value={reseller.postal_code || "—"} mono />
        </Section>
        <Section title="Bisnis">
          <Row label="Nama Bisnis" value={reseller.reseller_display_name || "—"} />
          <Row label="Tier" value={reseller.reseller_tier || "belum di-set"} />
          <Row
            label="NIK"
            value={
              reseller.nik
                ? `${reseller.nik.slice(0, 6)}••••••${reseller.nik.slice(-4)}`
                : "—"
            }
            mono
          />
        </Section>
        <Section title="Timeline">
          <Row label="Aplikasi masuk" value={formatDateTime(reseller.created_at)} />
          <Row
            label="Email verified"
            value={reseller.email_verified_at ? formatDateTime(reseller.email_verified_at) : "belum"}
          />
        </Section>
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Building2 className="size-3" />
        {title}
      </h3>
      <dl className="space-y-1.5">{children}</dl>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[100px_1fr] items-baseline gap-2 text-sm">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? "truncate font-mono text-xs" : "text-sm"}>{value}</dd>
    </div>
  );
}

function ClientsTab({ id }: { id: string }) {
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<ClientRow[]>(`/api/v1/admin/resellers/${id}/clients`)
      .then((r) => setRows(r ?? []))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <ListSection loading={loading} err={err} empty={rows.length === 0} emptyLabel="Belum ada klien di-assign">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead>Nama</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Managed by</TableHead>
            <TableHead>Status Akses</TableHead>
            <TableHead>Aktivasi</TableHead>
            <TableHead>Tanggal</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c) => (
            <TableRow key={c.assignment.id}>
              <TableCell className="font-medium">{c.name}</TableCell>
              <TableCell className="font-mono text-xs">{c.email}</TableCell>
              <TableCell>
                <Badge variant="secondary" className="text-[10px]">
                  {c.assignment.manager_role}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge
                  variant={c.assignment.access_status === "active" ? "success" : "warning"}
                  className="text-xs"
                >
                  {c.assignment.access_status}
                </Badge>
              </TableCell>
              <TableCell>
                {c.email_verified ? (
                  <span className="text-xs text-emerald-600">Aktif</span>
                ) : (
                  <span className="text-xs text-amber-600">Belum accept</span>
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatDate(c.assignment.created_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ListSection>
  );
}

function AgentsTab({ id }: { id: string }) {
  const [rows, setRows] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<AgentRow[]>(`/api/v1/admin/resellers/${id}/agents`)
      .then((r) => setRows(r ?? []))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <ListSection loading={loading} err={err} empty={rows.length === 0} emptyLabel="Reseller belum invite agent apapun">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead>Nama</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Status Aktivasi</TableHead>
            <TableHead>Tanggal Invite</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="font-medium">{a.name}</TableCell>
              <TableCell className="font-mono text-xs">{a.email}</TableCell>
              <TableCell>
                {a.email_verified_at ? (
                  <Badge variant="success" className="text-xs">
                    Aktif
                  </Badge>
                ) : (
                  <Badge variant="warning" className="text-xs">
                    Menunggu accept
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatDate(a.created_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ListSection>
  );
}

function DomainsTab({ id }: { id: string }) {
  const [rows, setRows] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<Domain[]>(`/api/v1/admin/resellers/${id}/domains`)
      .then((r) => setRows(r ?? []))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <ListSection loading={loading} err={err} empty={rows.length === 0} emptyLabel="Belum ada domain di-purchase">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead>Domain</TableHead>
            <TableHead>Jenis</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Tahun</TableHead>
            <TableHead>Expire</TableHead>
            <TableHead>Tanggal</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="font-mono font-medium">{d.domain}</TableCell>
              <TableCell>
                <Badge variant="secondary" className="text-[10px]">
                  {d.kind}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    d.status === "active"
                      ? "success"
                      : d.status === "failed" || d.status === "expired"
                        ? "destructive"
                        : "warning"
                  }
                  className="text-xs"
                >
                  {d.status}
                </Badge>
              </TableCell>
              <TableCell className="text-xs">{d.years} thn</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {d.expires_at ? formatDate(d.expires_at) : "—"}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatDate(d.created_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ListSection>
  );
}

type AuditEntry = {
  id: string;
  event: string;
  actor_email?: string;
  target_type?: string;
  target_id?: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

function ActivityTab({ id }: { id: string }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // Aktivitas = audit_log dengan actor_id ATAU target_id = reseller ini.
    // Backend belum expose OR filter, jadi fetch dua kali + merge di client.
    Promise.all([
      api<{ items: AuditEntry[] }>(`/api/v1/admin/audit-log?actor_id=${id}&page_size=100`),
      api<{ items: AuditEntry[] }>(`/api/v1/admin/audit-log?target_id=${id}&page_size=100`),
    ])
      .then(([a, b]) => {
        const map = new Map<string, AuditEntry>();
        (a.items ?? []).forEach((e) => map.set(e.id, e));
        (b.items ?? []).forEach((e) => map.set(e.id, e));
        const merged = Array.from(map.values()).sort((x, y) =>
          y.created_at.localeCompare(x.created_at),
        );
        setEntries(merged);
      })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <ListSection loading={loading} err={err} empty={entries.length === 0} emptyLabel="Belum ada aktivitas ter-audit">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="w-40">Waktu</TableHead>
            <TableHead>Event</TableHead>
            <TableHead>Aktor</TableHead>
            <TableHead>Metadata</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                {formatDateTime(e.created_at)}
              </TableCell>
              <TableCell>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {e.event}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {e.actor_email || "system"}
              </TableCell>
              <TableCell>
                {Object.keys(e.metadata || {}).length > 0 ? (
                  <details>
                    <summary className="cursor-pointer text-xs text-primary hover:underline">
                      lihat
                    </summary>
                    <pre className="mt-2 overflow-x-auto rounded-md bg-muted/40 p-2 text-[10px]">
                      {JSON.stringify(e.metadata, null, 2)}
                    </pre>
                  </details>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ListSection>
  );
}

function ListSection({
  loading,
  err,
  empty,
  emptyLabel,
  children,
}: {
  loading: boolean;
  err: string | null;
  empty: boolean;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        {loading ? (
          <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Memuat…
          </div>
        ) : err ? (
          <div className="flex items-start gap-2 p-4 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0 translate-y-0.5" />
            <span>{err}</span>
          </div>
        ) : empty ? (
          <div className="flex flex-col items-center gap-2 py-14 text-sm text-muted-foreground">
            <MapPin className="size-8 opacity-30" />
            {emptyLabel}
          </div>
        ) : (
          children
        )}
      </div>
    </Card>
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
