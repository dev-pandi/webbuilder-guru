"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Globe, Loader2, Search, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ImagePicker } from "@/components/ImagePicker";
import { cn } from "@/lib/utils";

/**
 * Unified per-page settings dialog. Covers what was previously spread across
 * multiple places: title/slug rename, SEO meta, publish lifecycle. Saving the
 * dialog issues one PATCH; the publish/unpublish actions are independent
 * endpoints so they can fire without waiting for SEO edits.
 */
export type PageSettings = {
  id: string;
  slug: string;
  title: string;
  seo?: SEOData | null;
  is_home?: boolean;
  published_at?: string | null;
};

export type SEOData = {
  title?: string;
  description?: string;
  ogImage?: string;
  canonical?: string;
  noindex?: boolean;
};

export function PageSettingsDialog({
  open,
  onOpenChange,
  page,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  page: PageSettings | null;
  onUpdated: (next: PageSettings) => void;
}) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [seo, setSeo] = useState<SEOData>({});
  const [saving, setSaving] = useState(false);
  const [actioning, setActioning] = useState(false);

  // Sync state from the incoming page each time the dialog opens — closing
  // and re-opening should reset any local edits to the persisted truth.
  useEffect(() => {
    if (!open || !page) return;
    setTitle(page.title);
    setSlug(page.slug);
    setSeo(page.seo ?? {});
  }, [open, page]);

  if (!page) return null;

  const dirty =
    title !== page.title ||
    slug !== page.slug ||
    JSON.stringify(seo) !== JSON.stringify(page.seo ?? {});

  async function save() {
    if (!page) return;
    setSaving(true);
    try {
      const updated = await api<PageSettings>(`/api/v1/pages/${page.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title,
          slug,
          seo,
        }),
      });
      onUpdated(updated);
      toast.success("Pengaturan halaman tersimpan");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function unpublish() {
    if (!page) return;
    if (
      !confirm(
        "Hapus halaman ini dari situs publik?\n\n" +
          "Draft tetap tersimpan di editor — Anda bisa terbitkan kembali kapan saja.",
      )
    )
      return;
    setActioning(true);
    try {
      await api(`/api/v1/pages/${page.id}/unpublish`, { method: "POST" });
      const refreshed = await api<PageSettings>(`/api/v1/pages/${page.id}`);
      onUpdated(refreshed);
      toast.success("Halaman ditarik dari publik");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActioning(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogHeader className="border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-lg bg-primary/10">
              <Settings2 className="size-4 text-primary" />
            </div>
            <div>
              <DialogTitle>Pengaturan Halaman</DialogTitle>
              <DialogDescription className="mt-0.5">
                Judul, URL, SEO, dan status publikasi.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-6 overflow-y-auto px-6 py-5">
          {/* --- Info --- */}
          <section className="space-y-3">
            <SectionLabel icon={<Globe className="size-3.5" />}>Info</SectionLabel>
            <div className="space-y-1.5">
              <Label htmlFor="page-title">Judul halaman</Label>
              <Input
                id="page-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Beranda"
              />
              <p className="text-[11px] text-muted-foreground">
                Muncul di tab browser kalau tidak ada SEO title.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="page-slug">Slug URL</Label>
              <div className="flex items-center gap-1 rounded-md border bg-muted/30 px-2">
                <span className="font-mono text-xs text-muted-foreground">/</span>
                <Input
                  id="page-slug"
                  value={slug}
                  onChange={(e) =>
                    setSlug(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, "-")
                        .replace(/-+/g, "-"),
                    )
                  }
                  placeholder="tentang-kami"
                  className="h-8 border-0 bg-transparent font-mono text-sm shadow-none focus-visible:ring-0"
                  disabled={page.is_home}
                />
              </div>
              {page.is_home && (
                <p className="text-[11px] text-muted-foreground">
                  Halaman home — slug tidak bisa diubah.
                </p>
              )}
            </div>
          </section>

          <Separator />

          {/* --- SEO --- */}
          <section className="space-y-3">
            <SectionLabel icon={<Search className="size-3.5" />}>SEO & Sharing</SectionLabel>

            <div className="space-y-1.5">
              <Label htmlFor="seo-title">SEO Title</Label>
              <Input
                id="seo-title"
                value={seo.title ?? ""}
                onChange={(e) => setSeo({ ...seo, title: e.target.value })}
                placeholder={title || "Default ke judul halaman"}
                maxLength={70}
              />
              <CharCounter value={seo.title ?? ""} ideal={60} limit={70} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="seo-desc">Meta Description</Label>
              <Textarea
                id="seo-desc"
                value={seo.description ?? ""}
                onChange={(e) => setSeo({ ...seo, description: e.target.value })}
                placeholder="Ringkasan singkat yang muncul di hasil pencarian Google."
                rows={3}
                maxLength={180}
              />
              <CharCounter value={seo.description ?? ""} ideal={155} limit={180} />
            </div>

            <div className="space-y-1.5">
              <Label>Open Graph Image</Label>
              <ImagePicker
                value={seo.ogImage ?? ""}
                onChange={(v) => setSeo({ ...seo, ogImage: typeof v === "string" ? v : "" })}
              />
              <p className="text-[11px] text-muted-foreground">
                Gambar saat link halaman ini dibagikan ke media sosial. Disarankan 1200×630.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="seo-canonical">Canonical URL (opsional)</Label>
              <Input
                id="seo-canonical"
                type="url"
                value={seo.canonical ?? ""}
                onChange={(e) => setSeo({ ...seo, canonical: e.target.value })}
                placeholder="https://…"
              />
              <p className="text-[11px] text-muted-foreground">
                Kosongkan kecuali halaman ini duplikat konten dari URL lain.
              </p>
            </div>

            <label className="flex cursor-pointer items-start gap-2 rounded-md border bg-muted/30 px-3 py-2.5">
              <input
                type="checkbox"
                checked={seo.noindex ?? false}
                onChange={(e) => setSeo({ ...seo, noindex: e.target.checked })}
                className="mt-0.5 size-4 cursor-pointer accent-primary"
              />
              <div className="flex-1">
                <p className="text-sm font-medium">Sembunyikan dari mesin pencari</p>
                <p className="text-[11px] text-muted-foreground">
                  Tag <code className="rounded bg-muted px-1">noindex</code> ditambahkan ke head.
                </p>
              </div>
            </label>
          </section>

          <Separator />

          {/* --- Publish status / Unpublish --- */}
          <section className="space-y-3">
            <SectionLabel icon={<Globe className="size-3.5" />}>Status Publikasi</SectionLabel>
            <div className="rounded-md border bg-muted/20 px-3 py-3">
              {page.published_at ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-emerald-500" />
                    <p className="text-sm font-medium">Live · dipublikasikan</p>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Terakhir diterbitkan{" "}
                    {new Date(page.published_at).toLocaleString("id-ID", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3 gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={unpublish}
                    disabled={actioning}
                  >
                    {actioning ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                    Tarik dari publik
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-muted-foreground/40" />
                    <p className="text-sm font-medium">Draft · belum terbit</p>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Klik <strong>Terbitkan</strong> di toolbar editor untuk membuat halaman ini
                    terlihat oleh pengunjung.
                  </p>
                </>
              )}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-6 py-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Batal
          </Button>
          <Button onClick={save} disabled={!dirty || saving} className="gap-1.5">
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            {saving ? "Menyimpan…" : "Simpan Pengaturan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
      {icon}
      {children}
    </p>
  );
}

function CharCounter({ value, ideal, limit }: { value: string; ideal: number; limit: number }) {
  const n = value.length;
  const over = n > limit;
  const near = n > ideal && !over;
  return (
    <p
      className={cn(
        "text-[11px]",
        over
          ? "text-destructive"
          : near
          ? "text-amber-600"
          : "text-muted-foreground",
      )}
    >
      {n}/{limit} karakter {near && !over && "(mendekati batas)"} {over && "(terlalu panjang)"}
    </p>
  );
}

// Re-export so editor can render an "Open in new tab" preview link nicely.
export function PreviewLinkPill({
  href,
  label = "Buka pratinjau",
}: {
  href: string;
  label?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs hover:bg-muted"
    >
      <ExternalLink className="size-3" />
      {label}
    </a>
  );
}
