"use client";

// Agent > Klien — list klien + create dialog. Backend endpoint /agent/clients
// return hanya klien yang di-manage agent ini (bukan seluruh klien reseller).

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Globe2,
  Loader2,
  Mail,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Client = {
  client_id: string;
  assignment_id: string;
  email: string;
  name: string;
  access_status: "setup" | "active" | "revoked";
  email_verified: boolean;
  created_at: string;
};

export default function AgentClientsPage() {
  const [items, setItems] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const res = await api<Client[]>("/api/v1/agent/clients");
      setItems(res ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Users className="size-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Klien saya</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Klien yang Anda daftarkan. Reseller induk melihat daftar ini juga.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-1.5">
          <UserPlus className="size-4" />
          Tambah Klien
        </Button>
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
                <TableHead>Nama</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status Akses</TableHead>
                <TableHead>Aktivasi</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead className="w-0">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={loading ? "opacity-60" : ""}>
              {loading && items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-14 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-14 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Users className="size-8 opacity-30" />
                      <p className="text-sm font-medium">Belum ada klien</p>
                      <p className="text-xs">
                        Tambahkan klien pertama untuk mulai kelola situs mereka.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((c) => (
                  <TableRow key={c.assignment_id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-sm">
                      <span className="flex items-center gap-1 font-mono text-xs">
                        <Mail className="size-3 text-muted-foreground" />
                        {c.email}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={c.access_status === "setup" ? "warning" : "success"}
                        className="text-xs"
                      >
                        {c.access_status === "setup" ? "Setup" : "Aktif"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {c.email_verified ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                          <CheckCircle2 className="size-3" />
                          Aktif
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                          <Clock className="size-3" />
                          Belum accept
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(c.created_at)}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" asChild className="gap-1 whitespace-nowrap">
                        <Link href={`/sites/new-with-domain?for_client=${c.client_id}`}>
                          <Globe2 className="size-3" />
                          Beli Domain
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <CreateClientDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={() => {
          setDialogOpen(false);
          refresh();
        }}
      />
    </div>
  );
}

function CreateClientDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    email: "",
    name: "",
    phone_number: "",
    address: "",
    city: "",
    state: "",
    postal_code: "",
    nik: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setForm({
        email: "",
        name: "",
        phone_number: "",
        address: "",
        city: "",
        state: "",
        postal_code: "",
        nik: "",
      });
      setErr(null);
    }
  }, [open]);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    setErr(null);
    if (!form.email.includes("@")) {
      setErr("Email tidak valid");
      return;
    }
    if (!form.name.trim()) {
      setErr("Nama wajib diisi");
      return;
    }
    setSaving(true);
    try {
      // Endpoint sama untuk reseller & agent (RequireResellerOrAgent).
      await api("/api/v1/reseller/clients", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          email: form.email.toLowerCase().trim(),
        }),
      });
      toast.success("Klien ditambahkan, email invite terkirim");
      onCreated();
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
          <DialogTitle>Tambah Klien Baru</DialogTitle>
          <DialogDescription>
            Klien akan terima email invite untuk set password. Info alamat
            dipakai nanti kalau register domain (Phase 3).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-email">Email *</Label>
              <Input
                id="c-email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="klien@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-name">Nama *</Label>
              <Input
                id="c-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Bu Ani Wijaya"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-phone">Nomor HP</Label>
              <Input
                id="c-phone"
                type="tel"
                value={form.phone_number}
                onChange={(e) => set("phone_number", e.target.value)}
                placeholder="+62812xxxxxxx"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-city">Kota</Label>
              <Input
                id="c-city"
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                placeholder="Jakarta"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="c-address">Alamat</Label>
            <Textarea
              id="c-address"
              rows={2}
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="Jl. Contoh No. 10..."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="c-state">
              Provinsi{" "}
              <span className="text-[10px] font-normal text-muted-foreground">
                — wajib untuk register domain
              </span>
            </Label>
            <Input
              id="c-state"
              value={form.state}
              onChange={(e) => set("state", e.target.value)}
              placeholder="DKI Jakarta"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-postal">Kode Pos</Label>
              <Input
                id="c-postal"
                value={form.postal_code}
                onChange={(e) => set("postal_code", e.target.value)}
                placeholder="10110"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-nik">
                NIK (KTP){" "}
                <span className="text-[10px] font-normal text-muted-foreground">
                  — wajib untuk .id
                </span>
              </Label>
              <Input
                id="c-nik"
                value={form.nik}
                onChange={(e) => set("nik", e.target.value.replace(/\D/g, "").slice(0, 16))}
                placeholder="16 digit NIK"
                inputMode="numeric"
                maxLength={16}
                className="font-mono"
              />
            </div>
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
            Tambah Klien
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
