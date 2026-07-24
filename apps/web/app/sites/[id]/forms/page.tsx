"use client";

// Kelola form situs (kontak, newsletter, custom) + inbox submissions.
// Sengaja compact: 1 halaman untuk list form + form terpilih inline expand
// menampilkan submissions. Tidak split ke sub-route supaya user tidak
// bolak-balik navigate.

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Plus,
  Loader2,
  Mail,
  Trash2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Send,
  Inbox,
  Copy,
  Check,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type FormField = {
  name: string;
  label: string;
  type: "text" | "email" | "tel" | "textarea" | "url";
  required?: boolean;
  placeholder?: string;
};

type Form = {
  id: string;
  site_id: string;
  name: string;
  kind: "contact" | "newsletter" | "custom";
  fields: FormField[];
  notify_email: string;
  created_at: string;
  updated_at: string;
};

type Submission = {
  id: string;
  form_id: string;
  data: Record<string, unknown>;
  source_ip: string;
  user_agent: string;
  submitted_at: string;
};

const KIND_LABEL: Record<string, string> = {
  contact: "Kontak",
  newsletter: "Newsletter",
  custom: "Kustom",
};

export default function FormsPage() {
  const params = useParams<{ id: string }>();
  const siteID = params.id;

  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedID, setExpandedID] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const list = await api<Form[]>(`/api/v1/sites/${siteID}/forms`);
      setForms(list ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteID]);

  async function onDeleteForm(f: Form) {
    if (!confirm(`Hapus form "${f.name}"? Semua submissions akan ikut terhapus.`)) return;
    try {
      await api(`/api/v1/forms/${f.id}`, { method: "DELETE" });
      toast.success("Form dihapus");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Formulir</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Kumpulkan lead / feedback dari pengunjung. Submissions masuk ke inbox
            di bawah + email ke owner.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="size-4" />
          Buat form
        </Button>
      </div>

      {err && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Memuat…
        </div>
      ) : forms.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <Inbox className="size-10 text-muted-foreground/60" />
            <div>
              <p className="text-sm font-semibold">Belum ada form</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Buat form pertama untuk mulai kumpulkan lead / kontak.
              </p>
            </div>
            <Button onClick={() => setCreateOpen(true)} className="mt-2 gap-2">
              <Plus className="size-4" />
              Buat form pertama
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {forms.map((f) => (
            <FormCard
              key={f.id}
              form={f}
              expanded={expandedID === f.id}
              onToggle={() => setExpandedID(expandedID === f.id ? null : f.id)}
              onDelete={() => onDeleteForm(f)}
            />
          ))}
        </div>
      )}

      {createOpen && (
        <CreateFormDialog
          siteID={siteID}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

function FormCard({
  form,
  expanded,
  onToggle,
  onDelete,
}: {
  form: Form;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [copiedID, setCopiedID] = useState(false);
  async function copyID() {
    await navigator.clipboard.writeText(form.id);
    setCopiedID(true);
    setTimeout(() => setCopiedID(false), 2000);
    toast.success("Form ID disalin");
  }
  return (
    <Card>
      <CardHeader className="cursor-pointer pb-3" onClick={onToggle}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {expanded ? (
              <ChevronDown className="size-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-4 text-muted-foreground" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">{form.name}</CardTitle>
                <Badge variant="secondary" className="text-[10px]">
                  {KIND_LABEL[form.kind] ?? form.kind}
                </Badge>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {form.fields.length} field · Notify: {form.notify_email || "—"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="sm"
              onClick={copyID}
              className="gap-1.5"
              title="Salin form ID (dipakai integrasi renderer / iframe embed)"
            >
              {copiedID ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              <span className="hidden sm:inline">ID</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4 pt-0">
          <FieldsPreview fields={form.fields} />
          <SubmissionsInbox formID={form.id} formFields={form.fields} />
        </CardContent>
      )}
    </Card>
  );
}

function FieldsPreview({ fields }: { fields: FormField[] }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Info className="size-3" />
        Fields
      </div>
      <div className="flex flex-wrap gap-1.5">
        {fields.map((f) => (
          <Badge key={f.name} variant="outline" className="font-mono text-[10px]">
            {f.name}: {f.type}
            {f.required && <span className="ml-1 text-destructive">*</span>}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function SubmissionsInbox({ formID, formFields }: { formID: string; formFields: FormField[] }) {
  const [subs, setSubs] = useState<Submission[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  async function load() {
    setLoading(true);
    try {
      const res = await api<{ items: Submission[]; total: number }>(
        `/api/v1/forms/${formID}/submissions?page=${page}&page_size=20`,
      );
      setSubs(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formID, page]);

  async function onDelete(id: string) {
    if (!confirm("Hapus submission ini?")) return;
    try {
      await api(`/api/v1/form-submissions/${id}`, { method: "DELETE" });
      toast.success("Submission dihapus");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Inbox className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Submissions</span>
        <Badge variant="secondary" className="ml-auto text-xs">
          {total}
        </Badge>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Memuat…
        </div>
      ) : subs.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/20 py-6 text-center text-xs text-muted-foreground">
          Belum ada submission dari visitor.
        </div>
      ) : (
        <ul className="space-y-2">
          {subs.map((s) => (
            <SubmissionRow key={s.id} sub={s} fields={formFields} onDelete={() => onDelete(s.id)} />
          ))}
        </ul>
      )}
      {total > 20 && (
        <div className="mt-3 flex items-center justify-between text-xs">
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Prev
          </Button>
          <span className="text-muted-foreground">
            Page {page} of {Math.ceil(total / 20)}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page * 20 >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </Button>
        </div>
      )}
    </div>
  );
}

function SubmissionRow({
  sub,
  fields,
  onDelete,
}: {
  sub: Submission;
  fields: FormField[];
  onDelete: () => void;
}) {
  const rows = useMemo(() => {
    return fields.map((f) => ({
      label: f.label,
      value: String(sub.data?.[f.name] ?? ""),
    }));
  }, [sub, fields]);

  return (
    <li className="rounded-lg border bg-background p-3 text-sm">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{formatDateTime(sub.submitted_at)}</span>
        <div className="flex items-center gap-2">
          {sub.source_ip && <code className="font-mono text-[10px]">{sub.source_ip}</code>}
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="h-6 gap-1 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>
      <dl className="grid gap-y-1.5 gap-x-4 sm:grid-cols-[120px_1fr]">
        {rows.map((r, i) => (
          <div key={i} className="contents">
            <dt className="truncate text-xs font-medium text-muted-foreground">{r.label}</dt>
            <dd className="whitespace-pre-wrap break-words text-sm">{r.value || "—"}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

function CreateFormDialog({
  siteID,
  onClose,
  onCreated,
}: {
  siteID: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("Form Kontak");
  const [kind, setKind] = useState<"contact" | "newsletter" | "custom">("contact");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) {
      setErr("Nama wajib");
      return;
    }
    setSubmitting(true);
    try {
      // Fields di-auto default backend berdasarkan kind. Kalau custom, user
      // dapat form kosong yang bisa edit fields nanti (future: field editor UI).
      await api(`/api/v1/sites/${siteID}/forms`, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          kind,
          notify_email: notifyEmail.trim() || undefined,
        }),
      });
      toast.success("Form dibuat");
      onCreated();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buat form baru</DialogTitle>
          <DialogDescription>
            Fields default disediakan berdasarkan jenis (kontak = nama+email+pesan,
            newsletter = email). Bisa disesuaikan nanti.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="form-name">Nama form</Label>
            <Input
              id="form-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="mis. Kontak Kami"
              maxLength={128}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Jenis</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["contact", "newsletter", "custom"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={
                    "rounded-lg border py-2 text-xs font-medium transition-colors " +
                    (kind === k
                      ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                      : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground")
                  }
                >
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notify">
              Notify email <span className="text-xs text-muted-foreground">(opsional)</span>
            </Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="notify"
                type="email"
                value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
                placeholder="owner@example.com"
                className="pl-9"
                maxLength={128}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Kalau kosong, submissions cuma tersimpan di inbox (tanpa email).
            </p>
          </div>

          {err && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{err}</span>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting} className="gap-2">
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Membuat…
                </>
              ) : (
                <>
                  <Send className="size-4" />
                  Buat form
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}
