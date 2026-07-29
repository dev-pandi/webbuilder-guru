"use client";

// Reseller > Tim (Agent) — list agent + invite dialog.
// Pending invites tampil di list yang sama dengan badge "menunggu accept".

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Clock,
  Loader2,
  Mail,
  MailPlus,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Agent = {
  id?: string;
  email: string;
  name?: string;
  status: "active" | "pending_invite";
  created_at: string;
  email_verified_at?: string;
};

export default function ResellerTeamPage() {
  const [items, setItems] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const res = await api<Agent[]>("/api/v1/reseller/agents");
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
            <h1 className="text-2xl font-bold tracking-tight">Tim (Agent)</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Undang freelancer atau sales sebagai agent — mereka dapat kelola
            klien atas nama Anda.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-1.5">
          <UserPlus className="size-4" />
          Undang Agent
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
                <TableHead>Status</TableHead>
                <TableHead>Tanggal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={loading ? "opacity-60" : ""}>
              {loading && items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-14 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-14 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Users className="size-8 opacity-30" />
                      <p className="text-sm font-medium">Belum ada agent</p>
                      <p className="text-xs">
                        Undang agent pertama untuk mulai delegasi setup domain + situs.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((a, i) => (
                  <TableRow key={a.id || `pending-${i}`}>
                    <TableCell>
                      {a.name || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="flex items-center gap-1 font-mono text-xs">
                        <Mail className="size-3 text-muted-foreground" />
                        {a.email}
                      </span>
                    </TableCell>
                    <TableCell>
                      {a.status === "active" ? (
                        <Badge variant="success" className="text-xs">
                          Aktif
                        </Badge>
                      ) : (
                        <Badge variant="warning" className="gap-1 text-xs">
                          <Clock className="size-3" />
                          Menunggu accept
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(a.created_at)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <InviteAgentDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onInvited={() => {
          setDialogOpen(false);
          refresh();
        }}
      />
    </div>
  );
}

function InviteAgentDialog({
  open,
  onClose,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  onInvited: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setEmail("");
      setName("");
      setErr(null);
    }
  }, [open]);

  async function submit() {
    setErr(null);
    if (!email.includes("@")) {
      setErr("Email tidak valid");
      return;
    }
    if (!name.trim()) {
      setErr("Nama wajib diisi");
      return;
    }
    setSaving(true);
    try {
      await api("/api/v1/reseller/agents/invite", {
        method: "POST",
        body: JSON.stringify({ email: email.toLowerCase().trim(), name: name.trim() }),
      });
      toast.success("Undangan terkirim");
      onInvited();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Undang Agent</DialogTitle>
          <DialogDescription>
            Agent akan terima email invitation untuk set password + aktifkan
            akun. Berlaku 7 hari.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="agent-email">Email *</Label>
            <Input
              id="agent-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="freelancer@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agent-name">Nama *</Label>
            <Input
              id="agent-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Budi Setiawan"
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
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <MailPlus className="size-3.5" />}
            Kirim Undangan
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
