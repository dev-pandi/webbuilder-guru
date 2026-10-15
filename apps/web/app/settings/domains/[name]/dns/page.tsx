"use client";

// DNS Editor — CRUD DNS records via proxy ke Cloudflare API. Ownership
// scoped di backend (user cuma bisa edit domain miliknya sendiri).
//
// Type-aware form: pilih type (A/CNAME/MX/dst.) → field content adapt.
// Proxied toggle hanya muncul untuk A/AAAA/CNAME (yang support CF proxy).
//
// TTL: dropdown preset (auto, 1m, 5m, 30m, 1h, 6h, 12h, 1d) supaya user
// tidak bingung dengan input angka detik.

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ChevronLeft,
  Cloud,
  CloudOff,
  Edit2,
  Globe2,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type DNSRecord = {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
  priority?: number | null;
  comment?: string;
  zone_name?: string;
  proxiable?: boolean;
  modified_on?: string;
};

type ListResp = {
  records: DNSRecord[] | null;
  zone_id: string;
};

const DNS_TYPES = ["A", "AAAA", "CNAME", "TXT", "MX", "NS", "SRV", "CAA"] as const;
type DNSType = (typeof DNS_TYPES)[number];

const TTL_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "Auto (dikelola Cloudflare)" },
  { value: 60, label: "1 menit" },
  { value: 300, label: "5 menit" },
  { value: 1800, label: "30 menit" },
  { value: 3600, label: "1 jam" },
  { value: 21600, label: "6 jam" },
  { value: 43200, label: "12 jam" },
  { value: 86400, label: "1 hari" },
];

const CONTENT_HINT: Record<DNSType, string> = {
  A: "IPv4 (contoh: 203.0.113.10)",
  AAAA: "IPv6 (contoh: 2001:db8::1)",
  CNAME: "Hostname target (contoh: example.com)",
  TXT: "Isi bebas (contoh: v=spf1 include:_spf.google.com ~all)",
  MX: "Mail server hostname (contoh: mail.example.com)",
  NS: "Nameserver hostname (contoh: ns1.example.com)",
  SRV: "Format: <priority> <weight> <port> <target>",
  CAA: "Format: <flags> <tag> <value> (contoh: 0 issue \"letsencrypt.org\")",
};

export default function DnsEditorPage() {
  const params = useParams<{ name: string }>();
  const domain = decodeURIComponent(params?.name ?? "").toLowerCase();

  const [records, setRecords] = useState<DNSRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false); // 503 kalau CF belum di-setup

  const [editing, setEditing] = useState<DNSRecord | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Mutate (edit/delete/add) sementara di-disable untuk user — backend
  // DNS CRUD cuma support provider Cloudflare, belum DNSCloud. Untuk
  // konsistensi UX (semua domain user bisa lihat tapi tidak bisa edit),
  // disable semua tombol mutate di sini. Admin masih bisa dari panel
  // admin yang terpisah. Ganti flag kalau backend sudah universal.
  const USER_DNS_MUTATE_ENABLED = false;

  async function refresh() {
    if (!domain) return;
    const isInitial = records.length === 0 && !refreshing;
    if (isInitial) setLoading(true);
    else setRefreshing(true);
    setErr(null);
    try {
      const res = await api<ListResp>(
        `/api/v1/domains/${encodeURIComponent(domain)}/dns`,
      );
      setRecords(res.records ?? []);
      setDisabled(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) {
        setDisabled(true);
      } else {
        setErr((e as Error).message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain]);

  async function onDelete(rec: DNSRecord) {
    if (
      !confirm(
        `Hapus record ${rec.type} "${rec.name}" → ${rec.content}?\n\nAksi ini tidak bisa di-undo.`,
      )
    )
      return;
    try {
      await api(
        `/api/v1/domains/${encodeURIComponent(domain)}/dns/${rec.id}`,
        { method: "DELETE" },
      );
      toast.success("Record dihapus");
      setRecords((rs) => rs.filter((r) => r.id !== rec.id));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // Sort: root (`@` atau nama domain sendiri) dulu, lalu www, lalu alphabetical.
  const sorted = useMemo(() => {
    const rank = (name: string) => {
      const n = name.toLowerCase();
      if (n === domain || n === "@") return 0;
      if (n === `www.${domain}` || n === "www") return 1;
      return 2;
    };
    return [...records].sort((a, b) => {
      const dr = rank(a.name) - rank(b.name);
      if (dr !== 0) return dr;
      const dt = a.type.localeCompare(b.type);
      if (dt !== 0) return dt;
      return a.name.localeCompare(b.name);
    });
  }, [records, domain]);

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-3 gap-1.5">
          <Link href={`/settings/domains/${encodeURIComponent(domain)}`}>
            <ChevronLeft className="size-4" />
            {domain}
          </Link>
        </Button>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-bold tracking-tight">
          <Globe2 className="size-6 text-primary" />
          Kelola DNS
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tambah, edit, dan hapus DNS record untuk <code>{domain}</code> lewat
          Cloudflare.
        </p>
      </div>

      {disabled ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="rounded-full bg-muted p-4">
              <Cloud className="size-8 text-muted-foreground" />
            </div>
            <p className="font-medium">DNS editor belum tersedia</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Fitur ini butuh setup Cloudflare oleh admin. Sementara itu, ubah
              nameservers dari halaman domain untuk kelola DNS di tempat lain.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {err && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0 translate-y-0.5" />
              <span>{err}</span>
            </div>
          )}

          {!USER_DNS_MUTATE_ENABLED && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <AlertCircle className="size-4 shrink-0 translate-y-0.5" />
              <div>
                <strong className="block">Mode baca saja</strong>
                <p className="mt-0.5 text-xs">
                  Edit, tambah, dan hapus record DNS belum tersedia untuk user
                  — fitur sedang dalam penyesuaian supaya kompatibel dengan
                  semua provider DNS. Butuh perubahan? Hubungi admin.
                </p>
              </div>
            </div>
          )}

          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
              <div>
                <p className="text-sm font-semibold">
                  {records.length} record
                  {refreshing && (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" />
                      memperbarui…
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Perubahan langsung aktif — TTL menentukan berapa lama cache
                  DNS lama masih beredar.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refresh}
                  disabled={loading || refreshing}
                  className="gap-1.5"
                >
                  <RefreshCw
                    className={cn(
                      "size-3.5",
                      (loading || refreshing) && "animate-spin",
                    )}
                  />
                  Refresh
                </Button>
                <Button
                  size="sm"
                  onClick={() => setAddOpen(true)}
                  className="gap-1.5"
                  disabled={!USER_DNS_MUTATE_ENABLED}
                  title={
                    USER_DNS_MUTATE_ENABLED
                      ? undefined
                      : "Fitur tambah DNS belum tersedia — hubungi admin untuk perubahan DNS"
                  }
                >
                  <Plus className="size-3.5" />
                  Tambah Record
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-[80px]">Type</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Content</TableHead>
                    <TableHead className="w-[100px]">TTL</TableHead>
                    <TableHead className="w-[100px]">Proxy</TableHead>
                    <TableHead className="w-[100px] text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className={loading ? "opacity-60" : ""}>
                  {loading && records.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="py-14 text-center text-muted-foreground"
                      >
                        <Loader2 className="mx-auto size-5 animate-spin" />
                      </TableCell>
                    </TableRow>
                  ) : sorted.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-16">
                        <div className="flex flex-col items-center gap-2 text-center">
                          <p className="font-medium">Belum ada record</p>
                          <p className="text-sm text-muted-foreground">
                            Klik <strong>Tambah Record</strong> untuk mulai
                            konfigurasi DNS.
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    sorted.map((rec) => (
                      <TableRow key={rec.id} className="group">
                        <TableCell>
                          <Badge variant="secondary" className="font-mono text-[10px]">
                            {rec.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[220px] font-mono text-xs">
                          <span className="block truncate" title={rec.name}>
                            {shortName(rec.name, domain)}
                          </span>
                          {rec.comment && (
                            <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                              {rec.comment}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[300px] font-mono text-xs">
                          <span className="block truncate" title={rec.content}>
                            {rec.type === "MX" && rec.priority != null
                              ? `${rec.priority} ${rec.content}`
                              : rec.content}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {ttlLabel(rec.ttl)}
                        </TableCell>
                        <TableCell>
                          {rec.proxiable ? (
                            rec.proxied ? (
                              <Badge className="gap-1 bg-orange-500 text-white hover:bg-orange-600">
                                <Cloud className="size-3" />
                                On
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="gap-1">
                                <CloudOff className="size-3" />
                                Off
                              </Badge>
                            )
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditing(rec)}
                              title={
                                USER_DNS_MUTATE_ENABLED
                                  ? "Edit"
                                  : "Fitur edit DNS belum tersedia — hubungi admin"
                              }
                              disabled={!USER_DNS_MUTATE_ENABLED}
                            >
                              <Edit2 className="size-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => onDelete(rec)}
                              title={
                                USER_DNS_MUTATE_ENABLED
                                  ? "Hapus"
                                  : "Fitur hapus DNS belum tersedia — hubungi admin"
                              }
                              disabled={!USER_DNS_MUTATE_ENABLED}
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Tips</CardTitle>
              <CardDescription className="text-xs">
                Panduan singkat untuk kasus umum
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <div className="flex gap-2">
                <span className="font-mono font-semibold text-foreground">A</span>
                <span>Arahkan domain/subdomain ke alamat IPv4. Contoh: <code>@ → 203.0.113.10</code>.</span>
              </div>
              <div className="flex gap-2">
                <span className="font-mono font-semibold text-foreground">CNAME</span>
                <span>Alias ke hostname lain. Contoh: <code>www → {domain}</code>.</span>
              </div>
              <div className="flex gap-2">
                <span className="font-mono font-semibold text-foreground">MX</span>
                <span>Untuk email masuk. Wajib priority (angka lebih kecil = prioritas lebih tinggi).</span>
              </div>
              <div className="flex gap-2">
                <span className="font-mono font-semibold text-foreground">TXT</span>
                <span>Verifikasi (Google/Meta), SPF, DKIM, DMARC — isi bebas.</span>
              </div>
              <div className="flex gap-2">
                <Cloud className="size-3.5 shrink-0 text-orange-500" />
                <span>Icon <strong>Proxy On</strong> = traffic lewat Cloudflare (SSL + CDN + DDoS protection). Matikan untuk record yang butuh IP asli.</span>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <DnsRecordDialog
        open={addOpen || editing !== null}
        onClose={() => {
          setAddOpen(false);
          setEditing(null);
        }}
        domain={domain}
        record={editing}
        onSaved={() => {
          setAddOpen(false);
          setEditing(null);
          refresh();
        }}
      />
    </div>
  );
}

// ---------------- Add/Edit Dialog ----------------

type FormState = {
  type: DNSType;
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
  priority: string; // string untuk input control; parse ke int saat submit
  comment: string;
};

function initialForm(rec: DNSRecord | null, domain: string): FormState {
  if (!rec) {
    return {
      type: "A",
      name: "@",
      content: "",
      ttl: 1,
      proxied: true,
      priority: "10",
      comment: "",
    };
  }
  return {
    type: (rec.type as DNSType) ?? "A",
    name: shortName(rec.name, domain),
    content: rec.content,
    ttl: rec.ttl,
    proxied: rec.proxied,
    priority: rec.priority != null ? String(rec.priority) : "10",
    comment: rec.comment ?? "",
  };
}

function DnsRecordDialog({
  open,
  onClose,
  domain,
  record,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  domain: string;
  record: DNSRecord | null;
  onSaved: () => void;
}) {
  const isEdit = record !== null;
  const [form, setForm] = useState<FormState>(() => initialForm(record, domain));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset form kalau record berubah (misal user klik edit record lain tanpa
  // tutup dialog dulu).
  useEffect(() => {
    if (open) {
      setForm(initialForm(record, domain));
      setErr(null);
    }
  }, [open, record, domain]);

  if (!open) return null;

  const supportsProxy = form.type === "A" || form.type === "AAAA" || form.type === "CNAME";
  const requiresPriority = form.type === "MX";

  async function submit() {
    setErr(null);
    // Basic client-side validation.
    if (!form.name.trim()) {
      setErr("Name wajib diisi");
      return;
    }
    if (!form.content.trim()) {
      setErr("Content wajib diisi");
      return;
    }
    if (requiresPriority && !/^\d+$/.test(form.priority.trim())) {
      setErr("Priority harus angka");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        type: form.type,
        name: form.name.trim(),
        content: form.content.trim(),
        ttl: form.ttl,
        proxied: supportsProxy ? form.proxied : false,
        comment: form.comment.trim() || undefined,
      };
      if (requiresPriority) {
        body.priority = parseInt(form.priority.trim(), 10);
      }
      if (isEdit && record) {
        await api(
          `/api/v1/domains/${encodeURIComponent(domain)}/dns/${record.id}`,
          { method: "PATCH", body: JSON.stringify(body) },
        );
        toast.success("Record diperbarui");
      } else {
        await api(`/api/v1/domains/${encodeURIComponent(domain)}/dns`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        toast.success("Record ditambahkan");
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit DNS Record" : "Tambah DNS Record"}</DialogTitle>
          <DialogDescription>
            Perubahan langsung aktif di Cloudflare. Root domain gunakan{" "}
            <code>@</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1 space-y-1.5">
              <Label>Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    type: v as DNSType,
                    proxied: v === "A" || v === "AAAA" || v === "CNAME" ? f.proxied : false,
                  }))
                }
                disabled={isEdit /* CF tidak izin ganti type via PATCH */}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DNS_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="@ untuk root, atau 'www' / 'mail'"
                className="font-mono text-sm"
              />
            </div>
          </div>

          {requiresPriority && (
            <div className="space-y-1.5">
              <Label>Priority (MX)</Label>
              <Input
                type="number"
                min={0}
                max={65535}
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                className="font-mono text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Angka lebih kecil = prioritas lebih tinggi. Umumnya <code>10</code>.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Content</Label>
            <Input
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              placeholder={CONTENT_HINT[form.type]}
              className="font-mono text-sm"
            />
            <p className="text-[11px] text-muted-foreground">{CONTENT_HINT[form.type]}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>TTL</Label>
              <Select
                value={String(form.ttl)}
                onValueChange={(v) => setForm((f) => ({ ...f, ttl: parseInt(v, 10) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TTL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {supportsProxy ? (
              <div className="space-y-1.5">
                <Label>Cloudflare Proxy</Label>
                <label className="flex cursor-pointer items-start gap-2 rounded-md border bg-muted/30 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={form.proxied}
                    onChange={(e) => setForm((f) => ({ ...f, proxied: e.target.checked }))}
                    className="mt-0.5 size-4 cursor-pointer accent-primary"
                  />
                  <div className="flex-1 text-xs">
                    <p className="font-medium text-foreground">
                      {form.proxied ? "Proxied (SSL + CDN)" : "DNS Only"}
                    </p>
                    <p className="text-muted-foreground">
                      {form.proxied
                        ? "Traffic lewat edge Cloudflare."
                        : "Resolve langsung ke IP asli."}
                    </p>
                  </div>
                </label>
              </div>
            ) : (
              <div />
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Comment (opsional)</Label>
            <Input
              value={form.comment}
              onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
              placeholder="Catatan singkat untuk tim (maks 100 karakter)"
              maxLength={100}
            />
          </div>

          {err && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {err}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button onClick={submit} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            {isEdit ? "Simpan" : "Tambah"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Helpers ----------------

// Cloudflare selalu return FQDN di field name (mis. "www.example.com" atau
// "example.com" untuk root). Kita display versi pendek supaya kolom tidak
// terlalu lebar.
function shortName(name: string, domain: string): string {
  if (!name) return "@";
  if (name.toLowerCase() === domain.toLowerCase()) return "@";
  const suffix = "." + domain.toLowerCase();
  if (name.toLowerCase().endsWith(suffix)) {
    return name.slice(0, name.length - suffix.length);
  }
  return name;
}

function ttlLabel(ttl: number): string {
  if (ttl === 1) return "Auto";
  const preset = TTL_OPTIONS.find((o) => o.value === ttl);
  if (preset) return preset.label;
  if (ttl < 3600) return `${Math.round(ttl / 60)} mnt`;
  if (ttl < 86400) return `${Math.round(ttl / 3600)} jam`;
  return `${Math.round(ttl / 86400)} hari`;
}
