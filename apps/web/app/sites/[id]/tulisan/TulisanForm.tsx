"use client";

// Editor Tulisan — mirror mockup dashboard-guru/tulisan-form.html.
// Layout 2-kolom putih dengan sidebar guru dark navy (dari SiteLayout).
// Wired ke POST /sites/:id/articles + PATCH /articles/:id.

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  MessageSquareOff,
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
import { ImagePicker } from "@/components/ImagePicker";
import { RichEditor } from "@/components/RichEditor";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function fmtStamp(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

  const initialRubric: GuruRubric =
    article?.rubric ?? (search.get("rubric") as GuruRubric | null) ?? "ceritaku";

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
  const forumForced = rubric === "forum-diskusi";
  const [commentsEnabled, setCommentsEnabled] = useState<boolean>(
    article?.comments_enabled ?? true,
  );
  const [saving, setSaving] = useState<"draft" | "published" | null>(null);

  useEffect(() => {
    if (slugTouched) return;
    setSlug(slugify(title));
  }, [title, slugTouched]);

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
    if (!title.trim()) return toast.error("Judul tulisan wajib diisi");
    if (!slug.trim()) return toast.error("Slug wajib diisi");
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
        const { rubric: _r, ...patchBody } = body;
        void _r;
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
      // Redirect: kalau rubric forum-diskusi kembalikan ke Forum, selainnya ke Tulisan.
      const backTo = rubric === "forum-diskusi" ? "forum" : "tulisan";
      router.push(`/sites/${siteId}/${backTo}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  const backHref = rubric === "forum-diskusi"
    ? `/sites/${siteId}/forum`
    : `/sites/${siteId}/tulisan`;

  return (
    <div className="space-y-5">
      {/* Page head */}
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            {isEdit ? "Edit Tulisan" : "Tulis Artikel Baru"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {rubric === "forum-diskusi"
              ? "Buka ruang diskusi untuk pembaca website Anda."
              : "Buat tulisan untuk salah satu rubrik utama."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50"
          >
            <ArrowLeft className="size-4" />
            Kembali
          </Link>
          <button
            onClick={() => save("draft")}
            disabled={saving !== null}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
          >
            {saving === "draft" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Simpan Draft
          </button>
          <button
            onClick={() => save("published")}
            disabled={saving !== null}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {saving === "published" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {status === "published" ? "Update" : "Publikasikan"}
          </button>
        </div>
      </div>

      {/* Editor shell */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
        {/* Main card */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
            <Field label="Judul Tulisan" className="col-span-full">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Contoh: Hati-hati dengan Spasi"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
              />
            </Field>

            <Field label="Rubrik">
              <select
                value={rubric}
                onChange={(e) => setRubric(e.target.value as GuruRubric)}
                disabled={isEdit}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-500"
              >
                {GURU_RUBRICS.map((r) => (
                  <option key={r} value={r}>
                    {GURU_RUBRIC_LABEL[r]}
                  </option>
                ))}
              </select>
              {isEdit && (
                <p className="text-[11px] text-slate-500">
                  Rubrik tidak dapat diubah setelah tulisan dibuat.
                </p>
              )}
            </Field>

            <Field label="Status Publikasi">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "draft" | "published")}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
              <p className="text-[11px] text-slate-500">
                Status disimpan saat klik Simpan Draft / Publikasikan.
              </p>
            </Field>

            <Field label="URL Slug" className="col-span-full">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <span className="text-slate-500">/{rubric}/</span>
                <input
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                    setSlugTouched(true);
                  }}
                  placeholder="auto-dari-judul"
                  className="flex-1 bg-transparent font-mono text-[13px] outline-none"
                />
              </div>
            </Field>

            <Field label="Ringkasan" className="col-span-full">
              <textarea
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                rows={3}
                placeholder="Ringkasan singkat untuk preview di list tulisan."
                className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
              />
            </Field>

            <Field label="Featured Image" className="col-span-full">
              {coverImageURL ? (
                <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 md:flex-row md:items-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={coverImageURL}
                    alt="Cover"
                    className="h-24 w-40 rounded-lg object-cover"
                  />
                  <div className="flex-1">
                    <ImagePicker value={coverImageURL} onChange={setCoverImageURL} size="sm" />
                    <p className="mt-2 text-[11px] text-slate-500">
                      JPG/PNG/WebP, disarankan rasio 16:9.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-slate-500">
                  <ImageIcon className="mx-auto size-6" />
                  <div className="text-sm font-bold text-slate-700">Unggah gambar utama</div>
                  <p className="text-[12px] text-slate-500">JPG/PNG, disarankan rasio 16:9.</p>
                  <div className="mx-auto w-full max-w-xs">
                    <ImagePicker value={coverImageURL} onChange={setCoverImageURL} size="sm" />
                  </div>
                </div>
              )}
            </Field>

            <Field label="Isi Tulisan" className="col-span-full">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <RichEditor
                  value={bodyMD}
                  onChange={setBodyMD}
                  placeholder="Tulis isi tulisan di sini. Pakai toolbar untuk format teks, atau ketik / untuk shortcut."
                />
              </div>
            </Field>
          </div>
        </section>

        {/* Sidebar stack */}
        <aside className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-[15px] font-bold text-slate-900">Pengaturan Tanggapan</h3>
            </div>
            <div className="p-5">
              <label className="inline-flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={commentsEnabled}
                  disabled={forumForced}
                  onChange={(e) => setCommentsEnabled(e.target.checked)}
                  className="peer sr-only"
                />
                <span className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-emerald-500 peer-disabled:opacity-70">
                  <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
                </span>
                <span className="flex-1">
                  <span className="block text-[13px] font-bold text-slate-800">
                    Aktifkan Tanggapan
                  </span>
                  <span className="mt-1 flex items-start gap-1.5 text-[12px] text-slate-500">
                    {forumForced ? (
                      <>
                        <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                        Forum Diskusi: tanggapan wajib aktif dan tidak dapat dinonaktifkan.
                      </>
                    ) : commentsEnabled ? (
                      <>
                        <MessageSquare className="mt-0.5 size-3.5 shrink-0" />
                        Pembaca dapat mengirim komentar. Setiap komentar tetap perlu persetujuan guru.
                      </>
                    ) : (
                      <>
                        <MessageSquareOff className="mt-0.5 size-3.5 shrink-0" />
                        Form tanggapan disembunyikan dari publik.
                      </>
                    )}
                  </span>
                </span>
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-[15px] font-bold text-slate-900">Publikasi</h3>
            </div>
            <div className="grid gap-4 p-5">
              <Field label="Tanggal Publikasi">
                <input
                  type="text"
                  readOnly
                  value={
                    article?.published_at
                      ? fmtStamp(article.published_at)
                      : status === "published"
                        ? "Segera setelah disimpan"
                        : "Belum dipublikasikan"
                  }
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600 outline-none"
                />
              </Field>
              <div className="rounded-xl bg-blue-50 px-4 py-3 text-[12px] text-blue-800">
                Komentar baru selalu berstatus <strong>Pending</strong> sampai disetujui guru.
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-[15px] font-bold text-slate-900">Metadata</h3>
            </div>
            <div className="grid gap-4 p-5">
              <Field label="Estimasi Waktu Baca (menit)">
                <input
                  type="number"
                  min={0}
                  value={readingTime}
                  onChange={(e) => setReadingTime(parseInt(e.target.value || "0", 10))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                />
                <p className="text-[11px] text-slate-500">0 = disembunyikan.</p>
              </Field>
              <Field label="Tag (pisah dengan koma)">
                <input
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder="pendidikan, kelas, cerita"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                />
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </Field>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <label className="text-[12px] font-bold text-slate-600">{label}</label>
      {children}
    </div>
  );
}
