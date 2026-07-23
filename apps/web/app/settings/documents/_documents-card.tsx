"use client";

// DocumentsCard — list library dokumen user + form upload. Self-contained:
// tidak bergantung ke form Profil (state + submit terpisah).
//
// Flow:
//   1. Load list + categories saat mount.
//   2. User bisa expand form upload → pilih kategori + file → POST.
//   3. Setelah sukses, list refresh + toast.
//
// Web builder TIDAK simpan file — semua passthrough ke registrar via
// /api/v1/documents (transparent proxy). Dokumen dipakai saat purchase domain
// yang butuh verifikasi identitas (KTP/NPWP).

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Upload,
  X,
  ExternalLink,
  Files,
} from "lucide-react";
import { toast } from "sonner";
import { api, getAccessToken } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIMES = ["image/png", "image/jpeg", "image/jpg", "application/pdf"];

type Document = {
  id: number;
  name: string;
  category_id: number;
  category_name?: string;
  doc_url: string;
  external_user_id?: string;
  created_at: string;
};

type Category = {
  id: number;
  name: string;
  parent_id?: number;
};

export function DocumentsCard() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [disabled, setDisabled] = useState(false); // registrar disabled → 503

  useEffect(() => {
    Promise.allSettled([
      api<Category[]>("/api/v1/documents/categories"),
      api<{ items: Document[] }>("/api/v1/documents?all=true"),
    ])
      .then(([cats, list]) => {
        if (cats.status === "fulfilled") {
          setCategories(cats.value ?? []);
        }
        if (list.status === "fulfilled") {
          setDocs(list.value?.items ?? []);
        } else if (list.status === "rejected") {
          // 503 registrar_disabled → sembunyikan form upload, tunjukkan hint.
          const msg = (list.reason as Error)?.message?.toLowerCase() ?? "";
          if (msg.includes("registrar")) setDisabled(true);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function refresh() {
    setRefreshing(true);
    try {
      const list = await api<{ items: Document[] }>("/api/v1/documents?all=true");
      setDocs(list?.items ?? []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  if (disabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Files className="size-4 text-muted-foreground" />
            Dokumen Verifikasi
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Fitur registrar belum dikonfigurasi. Hubungi admin untuk aktifkan.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Files className="size-4 text-muted-foreground" />
              Dokumen Verifikasi
              {docs.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {docs.length}
                </Badge>
              )}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              KTP/NPWP untuk registrasi domain yang butuh verifikasi identitas
              (mis. <code>.id</code>). File dikirim langsung ke registrar &mdash;
              tidak disimpan di server kami.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={refresh}
              disabled={refreshing || loading}
              className="gap-1.5"
              title="Refresh dari registrar"
            >
              <RefreshCw className={refreshing ? "size-3.5 animate-spin" : "size-3.5"} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              size="sm"
              onClick={() => setUploadOpen((v) => !v)}
              className="gap-1.5"
              disabled={loading}
            >
              {uploadOpen ? (
                <>
                  <X className="size-3.5" />
                  Tutup
                </>
              ) : (
                <>
                  <Plus className="size-3.5" />
                  Upload
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {uploadOpen && (
          <UploadForm
            categories={categories}
            onUploaded={(doc) => {
              setDocs((prev) => [doc, ...prev]);
              setUploadOpen(false);
              toast.success("Dokumen berhasil di-upload");
            }}
          />
        )}

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Memuat dokumen…
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/20 py-10 text-center">
            <FileText className="size-8 text-muted-foreground/60" />
            <div>
              <p className="text-sm font-medium">Belum ada dokumen</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Klik <strong>Upload</strong> untuk tambah KTP/NPWP.
              </p>
            </div>
          </div>
        ) : (
          <ul className="divide-y">
            {docs.map((d) => (
              <DocumentRow key={d.id} doc={d} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function DocumentRow({ doc }: { doc: Document }) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <FileText className="size-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{doc.name || "Tanpa nama"}</span>
          {doc.category_name && (
            <Badge variant="secondary" className="text-[10px]">
              {doc.category_name}
            </Badge>
          )}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          Di-upload {formatDate(doc.created_at)}
        </div>
      </div>
      {doc.doc_url && (
        <Button variant="ghost" size="sm" asChild className="gap-1.5">
          <Link href={doc.doc_url} target="_blank" rel="noopener noreferrer">
            Lihat
            <ExternalLink className="size-3" />
          </Link>
        </Button>
      )}
    </li>
  );
}

function UploadForm({
  categories,
  onUploaded,
}: {
  categories: Category[];
  onUploaded: (doc: Document) => void;
}) {
  const [categoryID, setCategoryID] = useState<number>(categories[0]?.id ?? 0);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Sync default kategori setelah categories fetched (kalau mount dengan
  // categoryID=0 karena list belum ada).
  useEffect(() => {
    if (categoryID === 0 && categories.length > 0) {
      setCategoryID(categories[0].id);
    }
  }, [categories, categoryID]);

  const displayName = useMemo(() => {
    if (name.trim()) return name.trim();
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
      setErr("Pilih kategori dokumen");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category_id", String(categoryID));
      if (displayName) fd.append("name", displayName);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE ?? "http://api.localhost"}/api/v1/documents`,
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
      className="space-y-3 rounded-lg border bg-muted/20 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="doc-category" className="text-xs">
            Kategori
          </Label>
          <select
            id="doc-category"
            value={categoryID}
            onChange={(e) => setCategoryID(Number(e.target.value))}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            disabled={categories.length === 0}
          >
            {categories.length === 0 ? (
              <option value={0}>Tidak ada kategori</option>
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
            maxLength={128}
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
