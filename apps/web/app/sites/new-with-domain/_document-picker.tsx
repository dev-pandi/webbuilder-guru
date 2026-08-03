"use client";

// DocumentPicker — muncul di Step 2 (Konfirmasi) kalau zone.require_document
// aktif dan tidak di-bypass NIK. User bisa:
//   1. Pilih dokumen existing dari library (sudah upload sebelumnya)
//   2. Upload dokumen baru (disimpan di storage internal)
//
// Phase 2 self-sufficient: /api/v1/documents/v2/* — dokumen tersimpan di
// web builder assets storage (bukan proxy registrar).

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, getAccessToken } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Document, DocumentCategory } from "./_types";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIMES = ["image/png", "image/jpeg", "image/jpg", "application/pdf"];

export function DocumentPicker({
  selectedIds,
  onChange,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [categories, setCategories] = useState<DocumentCategory[]>([]);
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);

  useEffect(() => {
    // Load categories + existing library documents in parallel.
    Promise.allSettled([
      api<DocumentCategory[]>("/api/v1/documents/v2/categories"),
      api<{ items: Document[] }>("/api/v1/documents/v2"),
    ])
      .then(([cats, list]) => {
        if (cats.status === "fulfilled") setCategories(cats.value ?? []);
        if (list.status === "fulfilled") setDocs(list.value?.items ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  async function refreshDocs() {
    try {
      const list = await api<{ items: Document[] }>("/api/v1/documents/v2");
      setDocs(list?.items ?? []);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  return (
    <div className="rounded-xl border bg-gradient-to-br from-blue-50 to-blue-50/30 p-4 dark:from-blue-950/30 dark:to-blue-950/10 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-700 dark:text-blue-300">
            <FileText className="size-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">Dokumen KTP/NPWP</div>
            <p className="text-xs text-muted-foreground">
              Lampirkan sekarang untuk skip step upload setelah bayar. Opsional
              — bisa juga upload nanti.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setUploadOpen((v) => !v)}
          className="gap-1.5"
        >
          {uploadOpen ? (
            <>
              <X className="size-3.5" />
              Tutup
            </>
          ) : (
            <>
              <Plus className="size-3.5" />
              Upload baru
            </>
          )}
        </Button>
      </div>

      {uploadOpen && (
        <div className="mt-3">
          <UploadForm
            categories={categories}
            onUploaded={(doc) => {
              setDocs((prev) => [doc, ...prev]);
              onChange([...selectedIds, doc.id]);
              setUploadOpen(false);
              toast.success("Dokumen di-upload + otomatis dipilih");
            }}
          />
        </div>
      )}

      <div className="mt-4">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Memuat library dokumen…
          </div>
        ) : docs.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Belum ada dokumen di library. Upload di atas untuk mulai.
          </p>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Library dokumen ({docs.length})
              </span>
              <button
                type="button"
                onClick={refreshDocs}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className="size-3" />
                Refresh
              </button>
            </div>
            <ul className="space-y-1.5">
              {docs.map((d) => {
                const active = selectedIds.includes(d.id);
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => toggle(d.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border bg-background px-3 py-2.5 text-left transition-colors",
                        active
                          ? "border-primary ring-1 ring-primary"
                          : "border-border hover:border-primary/50",
                      )}
                    >
                      <div
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background",
                        )}
                      >
                        {active && <Check className="size-3" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium">{d.name}</span>
                          {d.category_name && (
                            <Badge variant="secondary" className="text-[10px]">
                              {d.category_name}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {formatDate(d.created_at)}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-xs text-primary">
          <Check className="size-3.5" />
          <span>
            {selectedIds.length} dokumen dipilih — akan otomatis di-attach saat
            pembelian.
          </span>
        </div>
      )}
    </div>
  );
}

function UploadForm({
  categories,
  onUploaded,
}: {
  categories: DocumentCategory[];
  onUploaded: (doc: Document) => void;
}) {
  const [categoryID, setCategoryID] = useState<number>(categories[0]?.id ?? 0);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Sync default kategori kalau baru load.
  useEffect(() => {
    if (categoryID === 0 && categories.length > 0) setCategoryID(categories[0].id);
  }, [categories, categoryID]);

  const suggestedName = useMemo(() => {
    if (name.trim()) return name;
    if (!file) return "";
    return file.name.replace(/\.[^.]+$/, "");
  }, [name, file]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!file) {
      setErr("Pilih file dulu");
      return;
    }
    if (file.size > MAX_BYTES) {
      setErr("File terlalu besar (maks 8 MiB)");
      return;
    }
    if (!ALLOWED_MIMES.includes(file.type)) {
      setErr("Format tidak didukung — hanya PNG, JPG, atau PDF");
      return;
    }
    if (!categoryID) {
      setErr("Pilih kategori");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category_id", String(categoryID));
      // suggestedName tidak dipakai backend V2 (nama dari file.name saja).
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE ?? "http://api.localhost"}/api/v1/documents/v2`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
          body: fd,
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.error) {
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      onUploaded(body.data as Document);
      setFile(null);
      setName("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-lg border bg-background p-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="doc-cat" className="text-xs">
            Kategori
          </Label>
          <select
            id="doc-cat"
            value={categoryID}
            onChange={(e) => setCategoryID(Number(e.target.value))}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            disabled={categories.length === 0}
          >
            {categories.length === 0 ? (
              <option value={0}>—</option>
            ) : (
              categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))
            )}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="doc-name" className="text-xs">
            Nama <span className="text-muted-foreground">(opsional)</span>
          </Label>
          <Input
            id="doc-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={file ? file.name.replace(/\.[^.]+$/, "") : "mis. KTP Budi"}
            className="h-9"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="doc-file" className="text-xs">
          File (PNG/JPG/PDF, maks 8 MiB)
        </Label>
        <input
          ref={fileRef}
          id="doc-file"
          type="file"
          accept={ALLOWED_MIMES.join(",")}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full rounded-md border bg-background px-3 py-1.5 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1 file:text-primary-foreground hover:file:bg-primary/90"
        />
        {file && (
          <p className="text-[11px] text-muted-foreground">
            {file.name} · {(file.size / 1024).toFixed(1)} KB
          </p>
        )}
      </div>

      {err && (
        <p className="text-xs text-destructive">{err}</p>
      )}

      <div className="flex justify-end">
        <Button
          type="submit"
          size="sm"
          disabled={submitting || !file || !categoryID}
          className="gap-2"
        >
          {submitting ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Mengirim…
            </>
          ) : (
            <>
              <Upload className="size-3.5" />
              Upload
            </>
          )}
        </Button>
      </div>
    </form>
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
