"use client";

// Editor Tulisan — mirror mockup dashboard-guru/tulisan-form.html.
// Layout 2-kolom putih dengan sidebar guru dark navy (dari SiteLayout).
// Wired ke POST /sites/:id/articles + PATCH /articles/:id.

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  MessageSquareOff,
  Plus,
  Save,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  api,
  GURU_RUBRICS,
  GURU_RUBRIC_LABEL,
  type Article,
  type GuruRubric,
  type LiteraQuiz,
  type LiteraQuizQuestion,
} from "@/lib/api";
import { ImagePicker } from "@/components/ImagePicker";
import { RichEditor } from "@/components/RichEditor";
import { useAutoSavedAgo } from "@/lib/useAutoSavedAgo";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function emptyQuestion(): LiteraQuizQuestion {
  return { question: "", options: ["", "", "", ""], correctOption: "" };
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

  // Litera NFT publishing state
  const literaQuizInitial: LiteraQuiz | null = (() => {
    const raw = article?.litera_quiz_json;
    if (!raw || typeof raw !== "object") return null;
    if ("questions" in raw && Array.isArray(raw.questions) && raw.questions.length > 0) {
      return raw as LiteraQuiz;
    }
    return null;
  })();
  const [literaEnabled, setLiteraEnabled] = useState<boolean>(
    article?.litera_enabled ?? false,
  );
  const [literaUnlockableURL, setLiteraUnlockableURL] = useState<string>(
    article?.litera_unlockable_url ?? "",
  );
  const [literaUnlockableDesc, setLiteraUnlockableDesc] = useState<string>(
    article?.litera_unlockable_description ?? "",
  );
  const [literaQuizEnabled, setLiteraQuizEnabled] = useState<boolean>(
    !!literaQuizInitial,
  );
  const [literaQuiz, setLiteraQuiz] = useState<LiteraQuiz>(() =>
    literaQuizInitial ?? {
      passingScore: 60,
      questions: [emptyQuestion()],
    },
  );

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

  // Dirty tracking — snapshot state saat load / save-success, bandingkan
  // dengan current state. Dipakai untuk:
  //   - Warning saat close tab (beforeunload)
  //   - Visual indicator di header (dot amber)
  // Snapshot pakai JSON.stringify — cukup untuk shallow-shape state kita.
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() =>
    JSON.stringify({
      rubric: initialRubric,
      title: article?.title ?? "",
      slug: article?.slug ?? "",
      excerpt: article?.excerpt ?? "",
      bodyMD: article?.body_md ?? "",
      coverImageURL: article?.cover_image_url ?? "",
      tagsText: (article?.tags ?? []).join(", "),
      commentsEnabled: article?.comments_enabled ?? true,
      readingTime: article?.reading_time_min ?? 0,
      literaEnabled: article?.litera_enabled ?? false,
      literaUnlockableURL: article?.litera_unlockable_url ?? "",
      literaUnlockableDesc: article?.litera_unlockable_description ?? "",
      literaQuiz: literaQuizInitial ? JSON.stringify(literaQuizInitial) : "",
    }),
  );
  const currentSnapshot = useMemo(
    () =>
      JSON.stringify({
        rubric,
        title,
        slug,
        excerpt,
        bodyMD,
        coverImageURL,
        tagsText,
        commentsEnabled,
        readingTime,
        literaEnabled,
        literaUnlockableURL,
        literaUnlockableDesc,
        literaQuiz: literaQuizEnabled ? JSON.stringify(literaQuiz) : "",
      }),
    [
      rubric, title, slug, excerpt, bodyMD, coverImageURL, tagsText,
      commentsEnabled, readingTime,
      literaEnabled, literaUnlockableURL, literaUnlockableDesc,
      literaQuizEnabled, literaQuiz,
    ],
  );
  const dirty = currentSnapshot !== savedSnapshot;

  // Warn saat user tutup tab / navigate away dengan unsaved changes.
  // Modern browser cuma tampilkan pesan default (bukan custom string) tapi
  // event handler tetap harus set returnValue supaya dialog muncul.
  useEffect(() => {
    if (!dirty) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  async function save(
    targetStatus: "draft" | "published",
    opts?: { silent?: boolean },
  ) {
    if (!title.trim()) {
      if (!opts?.silent) toast.error("Judul tulisan wajib diisi");
      return;
    }
    if (!slug.trim()) {
      if (!opts?.silent) toast.error("Slug wajib diisi");
      return;
    }
    // Litera validator — hanya aktif saat publish + toggle on. Draft bebas.
    if (!opts?.silent && targetStatus === "published" && literaEnabled) {
      const missing: string[] = [];
      if (!excerpt.trim()) missing.push("Ringkasan");
      if (!coverImageURL.trim()) missing.push("Gambar cover");
      if (missing.length > 0) {
        toast.error(
          `Litera butuh: ${missing.join(", ")}. Isi dulu atau nonaktifkan Litera.`,
        );
        return;
      }
      if (literaQuizEnabled) {
        if (literaQuiz.questions.length === 0 || literaQuiz.questions.length > 3) {
          toast.error("Kuis Litera harus punya 1-3 pertanyaan.");
          return;
        }
        for (let i = 0; i < literaQuiz.questions.length; i++) {
          const q = literaQuiz.questions[i];
          if (!q.question.trim()) {
            toast.error(`Pertanyaan ${i + 1} belum diisi.`);
            return;
          }
          if (q.options.some((o) => !o.trim())) {
            toast.error(`Pertanyaan ${i + 1}: semua 4 opsi wajib diisi.`);
            return;
          }
          if (!q.correctOption) {
            toast.error(`Pertanyaan ${i + 1}: pilih jawaban benar (A/B/C/D).`);
            return;
          }
        }
      }
    }
    setSaving(targetStatus);
    try {
      // Build Litera payload: quiz hanya include kalau toggle on + ada pertanyaan.
      const literaQuizPayload = literaQuizEnabled && literaQuiz.questions.length > 0
        ? literaQuiz
        : {};
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
        litera_enabled: literaEnabled,
        litera_unlockable_url: literaUnlockableURL,
        litera_unlockable_description: literaUnlockableDesc,
        litera_quiz_json: literaQuizPayload,
      };
      if (isEdit) {
        const { rubric: _r, ...patchBody } = body;
        void _r;
        await api(`/api/v1/articles/${article!.id}`, {
          method: "PATCH",
          body: JSON.stringify(patchBody),
        });
        if (!opts?.silent) {
          toast.success(
            targetStatus === "published" ? "Tulisan dipublikasikan" : "Perubahan disimpan",
          );
        }
      } else {
        await api(`/api/v1/sites/${siteId}/articles`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        if (!opts?.silent) {
          toast.success(
            targetStatus === "published"
              ? "Tulisan dibuat & dipublikasikan"
              : "Draft tersimpan",
          );
        }
      }
      setStatus(targetStatus);
      // Reset snapshot supaya dirty=false setelah save sukses — hindari
      // beforeunload prompt saat router.push memicu navigasi.
      setSavedSnapshot(currentSnapshot);
      setLastAutoSavedAt(Date.now());
      // Redirect hanya di manual save (silent=false). Autosave silent → stay
      // di form supaya guru bisa lanjut edit.
      if (!opts?.silent) {
        const backTo = rubric === "forum-diskusi" ? "forum" : "tulisan";
        router.push(`/sites/${siteId}/${backTo}`);
      }
    } catch (e) {
      if (!opts?.silent) toast.error((e as Error).message);
      else console.warn("autosave failed:", (e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  // Timestamp save terakhir yang sukses (manual atau auto). Dipakai untuk
  // hint "Tersimpan otomatis 10 detik lalu" di sebelah tombol simpan.
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<number | null>(null);
  const autoSavedAgo = useAutoSavedAgo(lastAutoSavedAt, dirty);

  // Autosave — kick in HANYA saat:
  //   - Edit mode (create butuh explicit save, tidak mau auto-POST duplikat)
  //   - Dirty (ada perubahan)
  //   - Required fields terisi (title, slug non-empty)
  //   - Tidak sedang saving (manual atau auto)
  // Debounce 3 detik (align dengan editor autosave). Silent — no toast.
  // Preserve status current (draft/published) — autosave tidak boleh
  // "auto-publish" atau "auto-unpublish".
  useEffect(() => {
    if (!isEdit) return;
    if (!dirty) return;
    if (saving) return;
    if (!title.trim() || !slug.trim()) return;
    const handle = window.setTimeout(() => {
      void save(status, { silent: true });
    }, 3000);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSnapshot, dirty, saving, isEdit, status]);

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
        <div className="flex flex-wrap items-center gap-2">
          {dirty ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-200"
              title={
                isEdit
                  ? "Perubahan akan otomatis tersimpan 3 detik setelah berhenti mengetik"
                  : "Klik Simpan Draft untuk menyimpan"
              }
            >
              <span className="size-1.5 animate-pulse rounded-full bg-amber-500" />
              Belum disimpan
            </span>
          ) : autoSavedAgo ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200"
              title="Tersimpan otomatis"
            >
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Tersimpan · {autoSavedAgo}
            </span>
          ) : null}
          <Link
            href={backHref}
            onClick={(e) => {
              if (dirty && !window.confirm("Ada perubahan belum disimpan. Yakin ingin keluar?")) {
                e.preventDefault();
              }
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50"
          >
            <ArrowLeft className="size-4" />
            Kembali
          </Link>
          <button
            onClick={() => save("draft")}
            disabled={saving !== null || !dirty}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
            title={!dirty ? "Tidak ada perubahan untuk disimpan" : undefined}
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
              <p className="text-[11px] text-slate-500">
                {isEdit
                  ? "Rubrik tidak dapat diubah setelah tulisan dibuat."
                  : "Pilih salah satu rubrik utama untuk tulisan ini."}
              </p>
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

          {/* ===== LITERA NFT PANEL ===== */}
          <section className={`rounded-2xl border bg-white shadow-sm ${
            literaEnabled ? "border-indigo-200" : "border-slate-200"
          }`}>
            <div className={`flex items-center justify-between gap-3 border-b px-5 py-4 ${
              literaEnabled ? "border-indigo-200 bg-gradient-to-r from-indigo-50 to-fuchsia-50" : "border-slate-200"
            }`}>
              <div className="flex items-center gap-2">
                <Sparkles className={`size-4 ${literaEnabled ? "text-indigo-600" : "text-slate-400"}`} />
                <h3 className="text-[15px] font-bold text-slate-900">Terbitkan di Blockchain</h3>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={literaEnabled}
                  onChange={(e) => setLiteraEnabled(e.target.checked)}
                  className="peer sr-only"
                />
                <span className="h-5 w-9 rounded-full bg-slate-300 transition peer-checked:bg-indigo-600" />
                <span className="absolute left-0.5 top-0.5 size-4 rounded-full bg-white transition peer-checked:translate-x-4" />
              </label>
            </div>
            <div className="grid gap-4 p-5">
              <div className="rounded-xl bg-indigo-50/50 px-4 py-3 text-[12px] text-indigo-900">
                <p className="font-semibold">Jadikan Koleksi Digital Litera</p>
                <p className="mt-1 text-[11px] leading-relaxed text-indigo-800/80">
                  Artikel akan terdaftar sebagai NFT di jaringan Polygon.
                  Pembaca dapat mengoleksi (klaim gratis), mengakses materi
                  eksklusif, atau mengerjakan kuis refleksi.
                </p>
              </div>

              {/* Status chip — tampilkan intent_id atau error */}
              {article?.litera_registered_at && article.litera_intent_id && (
                <div className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-[12px] text-emerald-900">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">Terdaftar di Litera</div>
                    <div className="truncate text-[10px] font-mono text-emerald-700">
                      intent: {article.litera_intent_id}
                    </div>
                    <a
                      href={`https://literaa.xyz/creator?articleUrl=${encodeURIComponent(
                        `https://${window.location.host}/${rubric}/${slug}`,
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:underline"
                    >
                      Buka di Literaa <ExternalLink className="size-3" />
                    </a>
                  </div>
                </div>
              )}
              {article?.litera_register_error && !article.litera_intent_id && (
                <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-[12px] text-rose-900">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-rose-600" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">Gagal daftar</div>
                    <p className="mt-0.5 line-clamp-3 text-[11px] text-rose-800">
                      {article.litera_register_error}
                    </p>
                    <p className="mt-1 text-[10px] text-rose-700">
                      Admin platform akan melakukan retry otomatis.
                    </p>
                  </div>
                </div>
              )}

              {literaEnabled && (
                <>
                  <div className="rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2.5 text-[11px] text-amber-900">
                    <div className="flex items-start gap-1.5">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                      <div>
                        Butuh: <strong>Ringkasan</strong>, <strong>Gambar cover</strong>.
                        Kuis & materi eksklusif opsional.
                      </div>
                    </div>
                  </div>

                  {/* Unlockable Content */}
                  <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                    <div className="text-[12px] font-bold text-slate-700">
                      Materi Eksklusif (opsional)
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Konten terkunci NFT. Pembaca harus klaim koleksi untuk akses.
                      Contoh: PDF modul, link Google Drive, video pengayaan.
                    </p>
                    <input
                      type="url"
                      value={literaUnlockableURL}
                      onChange={(e) => setLiteraUnlockableURL(e.target.value)}
                      placeholder="https://drive.google.com/..."
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
                    />
                    <input
                      value={literaUnlockableDesc}
                      onChange={(e) => setLiteraUnlockableDesc(e.target.value)}
                      placeholder="Deskripsi singkat"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
                    />
                  </div>

                  {/* Quiz Builder */}
                  <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[12px] font-bold text-slate-700">
                          Kuis Refleksi (opsional)
                        </div>
                        <p className="text-[11px] text-slate-500">
                          1-3 pertanyaan pilihan ganda sebelum pembaca klaim NFT.
                        </p>
                      </div>
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input
                          type="checkbox"
                          checked={literaQuizEnabled}
                          onChange={(e) => setLiteraQuizEnabled(e.target.checked)}
                          className="peer sr-only"
                        />
                        <span className="h-5 w-9 rounded-full bg-slate-300 transition peer-checked:bg-indigo-600" />
                        <span className="absolute left-0.5 top-0.5 size-4 rounded-full bg-white transition peer-checked:translate-x-4" />
                      </label>
                    </div>

                    {literaQuizEnabled && (
                      <>
                        <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                          <label className="text-[11px] font-bold text-slate-600">
                            Nilai lulus (%)
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={literaQuiz.passingScore}
                            onChange={(e) =>
                              setLiteraQuiz({
                                ...literaQuiz,
                                passingScore: parseInt(e.target.value || "0", 10),
                              })
                            }
                            className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
                          />
                        </div>

                        {literaQuiz.questions.map((q, qi) => (
                          <div
                            key={qi}
                            className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3"
                          >
                            <div className="flex items-center justify-between">
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase text-slate-500">
                                Pertanyaan {qi + 1}
                              </span>
                              {literaQuiz.questions.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = {
                                      ...literaQuiz,
                                      questions: literaQuiz.questions.filter((_, i) => i !== qi),
                                    };
                                    setLiteraQuiz(next);
                                  }}
                                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
                                >
                                  <Trash2 className="size-3" /> Hapus
                                </button>
                              )}
                            </div>
                            <textarea
                              value={q.question}
                              onChange={(e) => {
                                const next = { ...literaQuiz };
                                next.questions = [...next.questions];
                                next.questions[qi] = { ...q, question: e.target.value };
                                setLiteraQuiz(next);
                              }}
                              placeholder="Tulis pertanyaan..."
                              rows={2}
                              className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
                            />
                            {q.options.map((opt, oi) => {
                              const letter = ["A", "B", "C", "D"][oi];
                              const isCorrect = q.correctOption === letter;
                              return (
                                <div key={oi} className="flex items-center gap-2">
                                  <label
                                    className={`grid size-7 cursor-pointer place-items-center rounded-full border-2 text-[11px] font-bold transition ${
                                      isCorrect
                                        ? "border-emerald-500 bg-emerald-500 text-white"
                                        : "border-slate-300 bg-white text-slate-500 hover:border-indigo-400"
                                    }`}
                                    title={isCorrect ? "Jawaban benar" : "Klik untuk tandai sebagai jawaban benar"}
                                  >
                                    <input
                                      type="radio"
                                      name={`correct-${qi}`}
                                      className="sr-only"
                                      checked={isCorrect}
                                      onChange={() => {
                                        const next = { ...literaQuiz };
                                        next.questions = [...next.questions];
                                        next.questions[qi] = {
                                          ...q,
                                          correctOption: letter as "A" | "B" | "C" | "D",
                                        };
                                        setLiteraQuiz(next);
                                      }}
                                    />
                                    {letter}
                                  </label>
                                  <input
                                    value={opt}
                                    onChange={(e) => {
                                      const next = { ...literaQuiz };
                                      next.questions = [...next.questions];
                                      const options = [...q.options];
                                      options[oi] = e.target.value;
                                      next.questions[qi] = { ...q, options };
                                      setLiteraQuiz(next);
                                    }}
                                    placeholder={`Opsi ${letter}`}
                                    className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        ))}

                        {literaQuiz.questions.length < 3 && (
                          <button
                            type="button"
                            onClick={() => {
                              setLiteraQuiz({
                                ...literaQuiz,
                                questions: [...literaQuiz.questions, emptyQuestion()],
                              });
                            }}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-indigo-300 bg-white px-3 py-2 text-[12px] font-bold text-indigo-700 hover:bg-indigo-50"
                          >
                            <Plus className="size-3.5" /> Tambah Pertanyaan
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
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
