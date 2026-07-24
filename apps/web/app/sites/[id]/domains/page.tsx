"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Globe2,
  Info,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Plus,
  AlertCircle,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Domain = {
  id: string;
  hostname: string;
  status: "pending" | "verified" | "failed";
  ssl_status: string;
  verified_at?: string | null;
};

const STATUS_CONFIG = {
  verified: {
    label: "Verified",
    icon: CheckCircle2,
    class: "bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:text-emerald-400",
  },
  pending: {
    label: "Pending",
    icon: Clock,
    class: "bg-amber-500/10 text-amber-700 border-amber-200 dark:text-amber-400",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    class: "bg-red-500/10 text-red-700 border-red-200 dark:text-red-400",
  },
};

export default function DomainsPage() {
  const params = useParams<{ id: string }>();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [hostname, setHostname] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      setDomains(await api<Domain[]>(`/api/v1/sites/${params.id}/domains`));
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [params.id]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);
    setAdding(true);
    try {
      await api(`/api/v1/sites/${params.id}/domains`, {
        method: "POST",
        body: JSON.stringify({ hostname }),
      });
      toast.success(`Domain ${hostname} berhasil ditambahkan.`);
      setHostname("");
      refresh();
    } catch (e) {
      setFormErr((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function verify(id: string, name: string) {
    setActionLoading(id + "verify");
    try {
      await api(`/api/v1/domains/${id}/verify`, { method: "POST" });
      toast.success(`${name} berhasil diverifikasi.`);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Hapus domain ${name}?`)) return;
    setActionLoading(id + "delete");
    try {
      await api(`/api/v1/domains/${id}`, { method: "DELETE" });
      toast.success(`${name} dihapus.`);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/10">
            <Globe2 className="size-4 text-blue-600" />
          </div>
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Domain Kustom
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Domain</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Setiap situs punya <strong>1 domain</strong>. Kalau Anda beli via wizard, domain
          otomatis ter-attach. Alternatif: hubungkan domain milik Anda sendiri di sini.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Left: info + table */}
        <div className="space-y-4">
          {/* How-to banner */}
          <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-sm dark:border-blue-900 dark:bg-blue-950/40">
            <Info className="size-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
            <div className="text-blue-900 dark:text-blue-100">
              <p className="font-semibold">Cara menambahkan domain kustom</p>
              <ol className="mt-2 ml-4 list-decimal space-y-1 text-blue-800/80 dark:text-blue-200/80">
                <li>
                  Tambahkan hostname di panel kanan (mis.{" "}
                  <code className="rounded bg-blue-100 px-1 font-mono text-xs dark:bg-blue-900">
                    tokoanda.id
                  </code>
                  ).
                </li>
                <li>Di registrar DNS Anda, arahkan A record ke IP server platform.</li>
                <li>
                  Klik <strong>Verifikasi</strong> — SSL diurus otomatis oleh Caddy saat domain
                  pertama diakses.
                </li>
              </ol>
            </div>
          </div>

          {/* Error */}
          {err && (
            <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span><span className="font-medium">Gagal memuat:</span> {err}</span>
            </div>
          )}

          {/* Domain table */}
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b bg-muted/30 px-5 py-3">
              <p className="text-sm font-semibold">Domain Terdaftar</p>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {domains.length} domain
              </span>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20 hover:bg-muted/20">
                  <TableHead className="pl-5 font-semibold text-foreground">Hostname</TableHead>
                  <TableHead className="font-semibold text-foreground">Status</TableHead>
                  <TableHead className="font-semibold text-foreground">SSL</TableHead>
                  <TableHead className="pr-5 text-right font-semibold text-foreground">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading
                  ? Array.from({ length: 2 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell className="pl-5">
                          <div className="h-4 w-40 rounded bg-muted animate-pulse" />
                        </TableCell>
                        <TableCell><div className="h-5 w-20 rounded-full bg-muted animate-pulse" /></TableCell>
                        <TableCell><div className="h-4 w-16 rounded bg-muted animate-pulse" /></TableCell>
                        <TableCell className="pr-5"><div className="h-8 w-24 rounded bg-muted animate-pulse ml-auto" /></TableCell>
                      </TableRow>
                    ))
                  : domains.map((d) => {
                      const cfg = STATUS_CONFIG[d.status] ?? STATUS_CONFIG.pending;
                      const Icon = cfg.icon;
                      const isActing = actionLoading?.startsWith(d.id) ?? false;
                      const sslOk = d.ssl_status === "active" || d.ssl_status === "issued";

                      return (
                        <TableRow key={d.id} className={`transition-colors ${isActing ? "opacity-60" : ""}`}>
                          {/* Hostname */}
                          <TableCell className="pl-5 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-medium">{d.hostname}</span>
                              {d.status === "verified" && (
                                <a
                                  href={`https://${d.hostname}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <ExternalLink className="size-3" />
                                </a>
                              )}
                            </div>
                          </TableCell>

                          {/* Status badge */}
                          <TableCell>
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.class}`}>
                              <Icon className="size-3" />
                              {cfg.label}
                            </span>
                          </TableCell>

                          {/* SSL */}
                          <TableCell>
                            <span className={`inline-flex items-center gap-1 text-xs font-medium ${sslOk ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                              {sslOk
                                ? <><ShieldCheck className="size-3.5" /> Aktif</>
                                : <><ShieldOff className="size-3.5" /> {d.ssl_status}</>
                              }
                            </span>
                          </TableCell>

                          {/* Actions */}
                          <TableCell className="pr-5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {isActing ? (
                                <Loader2 className="size-4 animate-spin text-muted-foreground" />
                              ) : (
                                <>
                                  {d.status !== "verified" && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 gap-1.5 text-xs text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-500/10"
                                      onClick={() => verify(d.id, d.hostname)}
                                    >
                                      <CheckCircle2 className="size-3.5" />
                                      Verifikasi
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    onClick={() => remove(d.id, d.hostname)}
                                  >
                                    <Trash2 className="size-3.5" />
                                    Hapus
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}

                {/* Empty */}
                {!loading && domains.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-14 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Globe2 className="size-8 opacity-30" />
                        <p className="text-sm font-medium">Belum ada domain</p>
                        <p className="text-xs">Tambahkan domain pertama di panel sebelah kanan</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Right: add form — hidden kalau slot 1-domain sudah terisi. */}
        <div className="rounded-xl border bg-card shadow-sm p-5 space-y-4 h-fit">
          {domains.length >= 1 ? (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Info className="size-4 text-muted-foreground" />
                <p className="text-sm font-semibold">Slot domain terisi</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Situs ini sudah punya domain aktif. Batas <strong>1 domain per
                situs</strong> — hapus domain lama dulu kalau mau ganti ke yang baru.
              </p>
            </div>
          ) : (
            <>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <Plus className="size-4 text-muted-foreground" />
                  <p className="text-sm font-semibold">Tambah Domain</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Masukkan hostname tanpa <code className="font-mono">https://</code>
                </p>
              </div>

              <form onSubmit={add} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="hostname" className="text-sm font-medium">
                    Hostname
                  </Label>
                  <Input
                    id="hostname"
                    required
                    value={hostname}
                    onChange={(e) => setHostname(e.target.value.toLowerCase())}
                    placeholder="tokoanda.id"
                    className="h-10 font-mono bg-muted/40 border-transparent focus:border-input focus:bg-background transition-colors"
                  />
                </div>

                {formErr && (
                  <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <AlertCircle className="size-3.5 shrink-0" />
                    {formErr}
                  </div>
                )}

                <Button type="submit" disabled={adding} className="w-full gap-2 shadow-sm">
                  {adding ? (
                    <><Loader2 className="size-4 animate-spin" /> Menambahkan…</>
                  ) : (
                    <><Plus className="size-4" /> Tambah Domain</>
                  )}
                </Button>
              </form>

              <div className="rounded-lg bg-muted/40 px-3 py-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Tips DNS</p>
                <p>Arahkan A record domain Anda ke IP server platform.</p>
                <p>Propagasi DNS bisa memakan waktu hingga 24 jam.</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
