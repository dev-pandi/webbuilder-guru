"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock,
  Loader2,
  Save,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { api, type LearningMaterial } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImagePicker } from "@/components/ImagePicker";
import { RichEditor } from "@/components/RichEditor";
import { GuruFeatureNotice } from "@/components/GuruFeatureNotice";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function MateriForm({
  siteId,
  material,
}: {
  siteId: string;
  material: LearningMaterial | null;
}) {
  const router = useRouter();
  const isEdit = !!material;

  const [title, setTitle] = useState(material?.title ?? "");
  const [slug, setSlug] = useState(material?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [excerpt, setExcerpt] = useState(material?.excerpt ?? "");
  const [bodyMD, setBodyMD] = useState(material?.body_md ?? "");
  const [coverImageURL, setCoverImageURL] = useState(material?.cover_image_url ?? "");
  const [tagsText, setTagsText] = useState((material?.tags ?? []).join(", "));
  const [summary, setSummary] = useState(material?.summary ?? "");
  const [status, setStatus] = useState<"draft" | "published">(material?.status ?? "draft");
  const [saving, setSaving] = useState<"draft" | "published" | null>(null);

  useEffect(() => {
    if (slugTouched) return;
    setSlug(slugify(title));
  }, [title, slugTouched]);

  const tags = useMemo(
    () =>
      tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    [tagsText],
  );

  async function save(targetStatus: "draft" | "published") {
    if (!title.trim()) return toast.error("Judul materi wajib diisi");
    if (!slug.trim()) return toast.error("Slug wajib diisi");
    setSaving(targetStatus);
    try {
      const body = {
        title,
        slug,
        excerpt,
        body_md: bodyMD,
        cover_image_url: coverImageURL,
        tags,
        summary,
        status: targetStatus,
      };
      if (isEdit) {
        await api(`/api/v1/learning-materials/${material!.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        toast.success(
          targetStatus === "published" ? "Materi dipublikasikan" : "Perubahan disimpan",
        );
      } else {
        await api(`/api/v1/sites/${siteId}/learning-materials`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        toast.success(
          targetStatus === "published"
            ? "Materi dibuat & dipublikasikan"
            : "Draft tersimpan",
        );
      }
      setStatus(targetStatus);
      router.push(`/sites/${siteId}/pembelajaran`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 -mx-6 -mt-6 border-b bg-background/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/sites/${siteId}/pembelajaran`}>
                <ArrowLeft />
                Kembali
              </Link>
            </Button>
            <div className="hidden h-5 w-px bg-border sm:block" />
            <div className="hidden items-center gap-2 sm:flex">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-500/10">
                <BookOpen className="size-4 text-violet-600" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-none">
                  {isEdit ? "Edit Materi" : "Materi Baru"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isEdit ? title || "Tanpa judul" : "Buat draft atau publikasikan"}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant={status === "published" ? "success" : "secondary"} className="gap-1">
              {status === "published" ? (
                <CheckCircle2 className="size-3" />
              ) : (
                <Clock className="size-3" />
              )}
              {status === "published" ? "Published" : "Draft"}
            </Badge>
            <Button variant="outline" onClick={() => save("draft")} disabled={saving !== null} className="gap-2">
              {saving === "draft" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Simpan Draft
            </Button>
            <Button onClick={() => save("published")} disabled={saving !== null} className="gap-2 shadow-sm">
              {saving === "published" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {status === "published" ? "Update" : "Publikasikan"}
            </Button>
          </div>
        </div>
      </div>

      <GuruFeatureNotice
        title="Pembelajaran"
        description="Materi tidak memiliki tanggapan atau views. Fokus pada isi dan ringkasan supaya mudah diikuti pembaca."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Judul materi…"
            className="h-auto border-0 bg-transparent px-0 text-3xl font-bold tracking-tight shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center gap-2 text-sm">
            <Label htmlFor="slug" className="shrink-0 text-muted-foreground">
              URL slug
            </Label>
            <span className="font-mono text-muted-foreground">/pembelajaran/</span>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                setSlugTouched(true);
              }}
              placeholder="auto-dari-judul"
              className="h-8 max-w-md font-mono text-sm"
            />
          </div>

          <RichEditor
            value={bodyMD}
            onChange={setBodyMD}
            placeholder="Tulis isi materi di sini."
          />
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Cover Image</CardTitle>
            </CardHeader>
            <CardContent>
              <ImagePicker value={coverImageURL} onChange={setCoverImageURL} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="excerpt" className="text-xs">Deskripsi Singkat</Label>
                <Textarea
                  id="excerpt"
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                  rows={3}
                  placeholder="Ringkasan pendek untuk kartu materi."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="summary" className="text-xs">Ringkasan Materi</Label>
                <Textarea
                  id="summary"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={3}
                  placeholder="Ringkasan yang tampil di bagian bawah halaman detail materi."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tags" className="text-xs">Kata Kunci</Label>
                <Input
                  id="tags"
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder="matematika, kelas 4, geometri"
                />
                {tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {tags.map((t) => (
                      <Badge key={t} variant="secondary" className="text-[10px]">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
