"use client";

// Editor Materi Pembelajaran — mirror mockup dashboard-guru/materi-form.html.
// Wired ke POST /sites/:id/learning-materials + PATCH /learning-materials/:id.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Image as ImageIcon,
  Loader2,
  Save,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { api, type LearningMaterial } from "@/lib/api";
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
    <div className="space-y-5">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            {isEdit ? "Edit Materi" : "Tambah Materi"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Buat bahan pembelajaran untuk dibagikan melalui website.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/sites/${siteId}/pembelajaran`}
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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
            <Field label="Judul Materi" className="col-span-full">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Contoh: Mengenal Teks Cerpen"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
              />
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
            </Field>

            <Field label="Tanggal">
              <input
                type="text"
                readOnly
                value={
                  material?.published_at
                    ? fmtStamp(material.published_at)
                    : status === "published"
                      ? "Segera setelah disimpan"
                      : "Belum dipublikasikan"
                }
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600 outline-none"
              />
            </Field>

            <Field label="URL Slug" className="col-span-full">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <span className="text-slate-500">/pembelajaran/</span>
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
                placeholder="Ringkasan pendek untuk kartu materi."
                className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
              />
            </Field>

            <Field label="Thumbnail" className="col-span-full">
              {coverImageURL ? (
                <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 md:flex-row md:items-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={coverImageURL}
                    alt="Thumbnail"
                    className="h-24 w-40 rounded-lg object-cover"
                  />
                  <div className="flex-1">
                    <ImagePicker value={coverImageURL} onChange={setCoverImageURL} size="sm" />
                    <p className="mt-2 text-[11px] text-slate-500">JPG/PNG/WebP.</p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-slate-500">
                  <ImageIcon className="mx-auto size-6" />
                  <div className="text-sm font-bold text-slate-700">Unggah gambar materi</div>
                  <p className="text-[12px] text-slate-500">JPG/PNG</p>
                  <div className="mx-auto w-full max-w-xs">
                    <ImagePicker value={coverImageURL} onChange={setCoverImageURL} size="sm" />
                  </div>
                </div>
              )}
            </Field>

            <Field label="Isi Materi" className="col-span-full">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <RichEditor
                  value={bodyMD}
                  onChange={setBodyMD}
                  placeholder="Tulis isi materi di sini."
                />
              </div>
            </Field>
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-[15px] font-bold text-slate-900">Publikasi</h3>
            </div>
            <div className="p-5">
              <div className="rounded-xl bg-blue-50 px-4 py-3 text-[12px] text-blue-800">
                Materi ditampilkan sebagai konten pembelajaran sederhana di website guru.
                Tidak ada tanggapan atau views yang tercatat.
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-[15px] font-bold text-slate-900">Metadata</h3>
            </div>
            <div className="grid gap-4 p-5">
              <Field label="Ringkasan Materi (bawah halaman)">
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={3}
                  placeholder="Ringkasan yang tampil di bagian bawah halaman detail materi."
                  className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                />
              </Field>
              <Field label="Kata Kunci (pisah dengan koma)">
                <input
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder="matematika, kelas 4, geometri"
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
