"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ImagePicker } from "@/components/ImagePicker";

export type BlogPost = {
  id: string;
  site_id: string;
  slug: string;
  title: string;
  excerpt: string;
  content_md: string;
  cover_image_url: string;
  author_name: string;
  status: "draft" | "published";
  published_at: string | null;
};

export function BlogDialog({
  open,
  onOpenChange,
  siteId,
  post,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  siteId: string;
  post: BlogPost | null;
  onSaved: () => void;
}) {
  const isEdit = !!post;
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [contentMD, setContentMD] = useState("");
  const [coverImageURL, setCoverImageURL] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (post) {
      setSlug(post.slug);
      setTitle(post.title);
      setExcerpt(post.excerpt);
      setContentMD(post.content_md);
      setCoverImageURL(post.cover_image_url);
      setAuthorName(post.author_name);
      setStatus(post.status);
    } else {
      setSlug("");
      setTitle("");
      setExcerpt("");
      setContentMD("");
      setCoverImageURL("");
      setAuthorName("");
      setStatus("draft");
    }
  }, [open, post]);

  // Auto-suggest slug from title for new posts
  useEffect(() => {
    if (!isEdit && title && !slug) {
      const auto = title
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
      setSlug(auto);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        slug,
        title,
        excerpt,
        content_md: contentMD,
        cover_image_url: coverImageURL,
        author_name: authorName,
        status,
      };
      if (isEdit) {
        await api(`/api/v1/blog-posts/${post!.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        toast.success("Artikel diperbarui");
      } else {
        await api(`/api/v1/sites/${siteId}/blog-posts`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        toast.success("Artikel dibuat");
      }
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Artikel" : "Artikel Baru"}</DialogTitle>
          <DialogDescription>
            Tulis konten dengan Markdown. Renderer akan otomatis convert ke HTML.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Judul</Label>
            <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="author">Penulis</Label>
              <Input
                id="author"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="Nama penulis"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="excerpt">Ringkasan</Label>
            <Textarea
              id="excerpt"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={2}
              placeholder="Kalimat pendek untuk preview di list artikel."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="content">Isi (Markdown)</Label>
            <Textarea
              id="content"
              value={contentMD}
              onChange={(e) => setContentMD(e.target.value)}
              rows={10}
              className="font-mono text-xs"
              placeholder={"# Judul Bab\n\nParagraf pertama.\n\n- Poin 1\n- Poin 2"}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Gambar Cover</Label>
              <ImagePicker value={coverImageURL} onChange={setCoverImageURL} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft (tidak tampil)</SelectItem>
                  <SelectItem value="published">Published (tampil di website)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Menyimpan…" : isEdit ? "Simpan" : "Buat"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
