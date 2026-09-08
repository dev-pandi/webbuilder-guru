"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquare,
  MessageSquareOff,
  Newspaper,
  Save,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import {
  api,
  GURU_RUBRICS,
  GURU_RUBRIC_LABEL,
  type Article,
  type GuruRubric,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export function TulisanForm({
  siteId,
  article,
}: {
  siteId: string;
  article: Article | null;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const isEdit = !!article;

  const initialRubric: GuruRubric = article?.rubric
    ?? (search.get("rubric") as GuruRubric | null)
    ?? "ceritaku";

  const [rubric, setRubric] = useState<GuruRubric>(initialRubric);
  const [title, setTitle] = useState(article?.title ?? "");
  const [slug, setSlug] = useState(article?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [excerpt, setExcerpt] = useState(article?.excerpt ?? "");
  const [bodyMD, setBodyMD] = useState(article?.body_md ?? "");
  const [coverImageURL, setCoverImageURL] = useState(article?.cover_image_url ?? "");
  const [tagsText, setTagsText] = useState((article?.tags ?? []).join(", "));
  const [status, setStatus] = useState<"draft" | "published">(article?.status ?? "draft");
  const [readingTime, setReadingTime] = useState<number>(article?.reading_time_min ?? 0);
  // Forum-diskusi: paksa comments_enabled=true (spec §16).
  const forumForced = rubric === "forum-diskusi";
  const [commentsEnabled, setCommentsEnabled] = useState<boolean>(
    article?.comments_enabled ?? true,
  );
  const [saving, setSaving] = useState<"draft" | "published" | null>(null);

  // Auto-derive slug from title in CREATE mode until user manually edits it.
  useEffect(() => {
    if (slugTouched) return;
    setSlug(slugify(title));
  }, [title, slugTouched]);

  // Ketika rubric switch ke forum-diskusi, paksa comments_enabled true.
  useEffect(() => {
    if (forumForced) setCommentsEnabled(true);
  }, [forumForced]);

  const tags = useMemo(
    () =>
      tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    [tagsText],
  );

  async function save(targetStatus: "draft" | "published") {
    if (!title.trim()) {
      toast.error("Judul tulisan wajib diisi");
      return;
    }
    if (!slug.trim()) {
      toast.error("Slug wajib diisi");
      return;
    }
    setSaving(targetStatus);
    try {
      const body = {
        rubric,
        title,
        slug,
        excerpt,
        body_md: bodyMD,
        cover_image_url: coverImageURL,
        tags,
        status: targetStatus,
        comments_enabled: commentsEnabled,
        reading_time_min: readingTime,
      };
      if (isEdit) {
        // PATCH body — rubric tidak dikirim karena immutable (unique constraint
        // rubric+slug, ganti rubric artinya migrasi manual).
        const { rubric: _rubric, ...patchBody } = body;
        void _rubric;
        await api(`/api/v1/articles/${article!.id}`, {
          method: "PATCH",
          body: JSON.stringify(patchBody),
        });
        toast.success(
          targetStatus === "published" ? "Tulisan dipublikasikan" : "Perubahan disimpan",
        );
      } else {
        await api(`/api/v1/sites/${siteId}/articles`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        toast.success(
          targetStatus === "published"
            ? "Tulisan dibuat & dipublikasikan"
            : "Draft tersimpan",
        );
      }
      setStatus(targetStatus);
      router.push(`/sites/${siteId}/tulisan${!isEdit ? `?rubric=${rubric}` : ""}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Sticky toolbar */}
      <div className="sticky top-0 z-10 -mx-6 -mt-6 border-b bg-background/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/sites/${siteId}/tulisan`}>
                <ArrowLeft />
                Kembali
              </Link>
            </Button>
            <div className="hidden h-5 w-px bg-border sm:block" />
            <div className="hidden items-center gap-2 sm:flex">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-500/10">
                <Newspaper className="size-4 text-violet-600" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-none">
                  {isEdit ? "Edit Tulisan" : "Tulisan Baru"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isEdit ? title || "Tanpa judul" : "Buat draft atau langsung publish"}
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
            <Button
              variant="outline"
              onClick={() => save("draft")}
              disabled={saving !== null}
              className="gap-2"
            >
              {saving === "draft" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Simpan Draft
            </Button>
            <Button
              onClick={() => save("published")}
              disabled={saving !== null}
              className="gap-2 shadow-sm"
            >
              {saving === "published" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {status === "published" ? "Update" : "Publikasikan"}
            </Button>
          </div>
        </div>
      </div>

      <GuruFeatureNotice
        title="Tulisan"
        description="Pilih rubrik terlebih dahulu. Slug tulisan unik dalam satu rubrik. Forum Diskusi selalu memiliki tanggapan aktif."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Judul tulisan…"
            className="h-auto border-0 bg-transparent px-0 text-3xl font-bold tracking-tight shadow-none focus-visible:ring-0"
          />

          <div className="flex items-center gap-2 text-sm">
            <Label htmlFor="slug" className="shrink-0 text-muted-foreground">
              URL slug
            </Label>
            <span className="font-mono text-muted-foreground">/{rubric}/</span>
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
            placeholder="Tulis isi tulisan di sini. Pakai toolbar untuk format teks, atau ketik / untuk shortcut."
          />
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Rubrik</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select
                value={rubric}
                onValueChange={(v) => setRubric(v as GuruRubric)}
                disabled={isEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GURU_RUBRICS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {GURU_RUBRIC_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isEdit && (
                <p className="text-[11px] text-muted-foreground">
                  Rubrik tidak dapat diubah setelah tulisan dibuat.
                </p>
              )}
            </CardContent>
          </Card>

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
              <CardTitle className="text-sm">Tanggapan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  id="comments_enabled"
                  type="checkbox"
                  checked={commentsEnabled}
                  disabled={forumForced}
                  onChange={(e) => setCommentsEnabled(e.target.checked)}
                  className="size-4"
                />
                <Label
                  htmlFor="comments_enabled"
                  className="text-sm font-normal"
                >
                  Aktifkan tanggapan pada tulisan ini
                </Label>
              </div>
              <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                {forumForced ? (
                  <>
                    <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                    Forum Diskusi: tanggapan wajib aktif dan tidak dapat dinonaktifkan.
                  </>
                ) : commentsEnabled ? (
                  <>
                    <MessageSquare className="mt-0.5 size-3.5 shrink-0" />
                    Pengunjung dapat menulis tanggapan. Semua tanggapan masuk moderasi terlebih dulu.
                  </>
                ) : (
                  <>
                    <MessageSquareOff className="mt-0.5 size-3.5 shrink-0" />
                    Form tanggapan, jumlah tanggapan, dan daftar tanggapan disembunyikan dari publik.
                  </>
                )}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="excerpt" className="text-xs">
                  Excerpt
                </Label>
                <Textarea
                  id="excerpt"
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                  rows={3}
                  placeholder="Ringkasan singkat untuk preview di list tulisan."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reading_time" className="text-xs">
                  Estimasi waktu baca (menit)
                </Label>
                <Input
                  id="reading_time"
                  type="number"
                  min={0}
                  value={readingTime}
                  onChange={(e) => setReadingTime(parseInt(e.target.value || "0", 10))}
                  className="max-w-[100px]"
                />
                <p className="text-[11px] text-muted-foreground">0 = disembunyikan</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tags" className="text-xs">
                  Tags
                </Label>
                <Input
                  id="tags"
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder="pendidikan, kelas, cerita"
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

          {article?.published_at && (
            <Card>
              <CardContent className="py-3 text-xs text-muted-foreground">
                Dipublikasikan{" "}
                {new Date(article.published_at).toLocaleString("id-ID", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
