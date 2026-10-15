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
  initialParentId,
}: {
  siteId: string;
  material: LearningMaterial | null;
  // Pre-fill parent dari query string `?parent=` saat user klik "+ Sub" dari list.
  // Hanya efektif untuk create (material=null) — pada edit, nilai dari material
  // selalu menang.
  initialParentId?: string;
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
  // Resolve parent awal: material (edit) > initialParentId (dari query ?parent=) > "" (new topik utama).
  const initialParent = material?.parent_id ?? initialParentId ?? "";
  const [parentId, setParentId] = useState<string>(initialParent);
  // Mode selector — "parent" (topik utama) vs "child" (sub-materi).
  // Derived initial: ada parentId → child, else → parent.
  const [mode, setMode] = useState<"parent" | "child">(
    initialParent ? "child" : "parent",
  );
  const [sortOrder, setSortOrder] = useState<number>(material?.sort_order ?? 0);
  const [emoji, setEmoji] = useState<string>(material?.emoji ?? "");
  const [parents, setParents] = useState<LearningMaterial[]>([]);
  const [siblings, setSiblings] = useState<LearningMaterial[]>([]);
  const [saving, setSaving] = useState<"draft" | "published" | null>(null);

  // Load daftar materi top-level untuk dropdown "Materi Induk". Filter diri
  // sendiri supaya materi tidak bisa jadi parent dirinya sendiri.
  useEffect(() => {
    api<LearningMaterial[]>(`/api/v1/sites/${siteId}/learning-materials/parents`)
      .then((rows) => {
        const filtered = isEdit && material
          ? rows.filter((r) => r.id !== material.id)
          : rows;
        setParents(filtered);
      })
      .catch(() => setParents([]));
  }, [siteId, isEdit, material]);

  // Load siblings untuk live preview mini-tree + hint "urut di antara X & Y".
  // Fetch flat list, filter by current scope (same parent group).
  useEffect(() => {
    api<{ items: LearningMaterial[] }>(
      `/api/v1/sites/${siteId}/learning-materials?page_size=200`,
    )
      .then((res) => {
        const scopeParent = mode === "child" ? parentId : null;
        const sibs = res.items
          .filter(
            (m) =>
              (m.parent_id ?? null) === scopeParent &&
              (!isEdit || !material || m.id !== material.id),
          )
          .sort((a, b) => {
            if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
            return a.created_at.localeCompare(b.created_at);
          });
        setSiblings(sibs);
      })
      .catch(() => setSiblings([]));
  }, [siteId, mode, parentId, isEdit, material]);

  // Derived: parent object dari mode + parentId (untuk preview + header context).
  const activeParent = mode === "child" ? parents.find((p) => p.id === parentId) : null;
  const effectiveParentId = mode === "child" ? parentId : "";

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

  // Dirty tracking + autosave — pattern sama dengan TulisanForm/BlogForm.
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() =>
    JSON.stringify({
      title: material?.title ?? "",
      slug: material?.slug ?? "",
      excerpt: material?.excerpt ?? "",
      bodyMD: material?.body_md ?? "",
      coverImageURL: material?.cover_image_url ?? "",
      tagsText: (material?.tags ?? []).join(", "),
      summary: material?.summary ?? "",
      parentId: material?.parent_id ?? "",
      sortOrder: material?.sort_order ?? 0,
      emoji: material?.emoji ?? "",
      mode: material?.parent_id ? "child" : "parent",
    }),
  );
  const currentSnapshot = useMemo(
    () =>
      JSON.stringify({
        title,
        slug,
        excerpt,
        bodyMD,
        coverImageURL,
        tagsText,
        summary,
        parentId: effectiveParentId,
        sortOrder,
        emoji: mode === "parent" ? emoji : "",
        mode,
      }),
    [title, slug, excerpt, bodyMD, coverImageURL, tagsText, summary, effectiveParentId, sortOrder, emoji, mode],
  );
  const dirty = currentSnapshot !== savedSnapshot;
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<number | null>(null);
  const autoSavedAgo = useAutoSavedAgo(lastAutoSavedAt, dirty);

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
      if (!opts?.silent) toast.error("Judul materi wajib diisi");
      return;
    }
    if (!slug.trim()) {
      if (!opts?.silent) toast.error("Slug wajib diisi");
      return;
    }
    setSaving(targetStatus);
    try {
      // parent_id: "" (dropdown "Tanpa induk") → kirim null supaya backend
      // clear parent (UpdateInput.ParentIDSet=true + nil). UUID → kirim string.
      const body = {
        title,
        slug,
        excerpt,
        body_md: bodyMD,
        cover_image_url: coverImageURL,
        tags,
        summary,
        status: targetStatus,
        parent_id: effectiveParentId || null,
        sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
        // Emoji hanya relevan untuk topik utama (parent). Sub-materi disimpan
        // kosong supaya tidak confusing kalau nanti dipromosikan jadi parent.
        emoji: mode === "parent" ? emoji : "",
      };
      if (isEdit) {
        await api(`/api/v1/learning-materials/${material!.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        if (!opts?.silent) {
          toast.success(
            targetStatus === "published" ? "Materi dipublikasikan" : "Perubahan disimpan",
          );
        }
      } else {
        await api(`/api/v1/sites/${siteId}/learning-materials`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        if (!opts?.silent) {
          toast.success(
            targetStatus === "published"
              ? "Materi dibuat & dipublikasikan"
              : "Draft tersimpan",
          );
        }
      }
      setStatus(targetStatus);
      setSavedSnapshot(currentSnapshot);
      setLastAutoSavedAt(Date.now());
      if (!opts?.silent) {
        router.push(`/sites/${siteId}/pembelajaran`);
      }
    } catch (e) {
      if (!opts?.silent) toast.error((e as Error).message);
      else console.warn("autosave failed:", (e as Error).message);
    } finally {
      setSaving(null);
    }
  }

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

  return (
    <div className="space-y-5">
      {/* Breadcrumb kontekstual — kasih orientation jelas tanpa harus baca form */}
      <nav className="flex items-center gap-1.5 text-[13px] text-slate-500">
        <Link href={`/sites/${siteId}/pembelajaran`} className="hover:text-slate-700">
          Pembelajaran
        </Link>
        {activeParent && (
          <>
            <span className="text-slate-300">›</span>
            <span className="inline-flex items-center gap-1 font-medium text-slate-700">
              {activeParent.emoji && <span>{activeParent.emoji}</span>}
              {activeParent.title}
            </span>
          </>
        )}
        <span className="text-slate-300">›</span>
        <span className="font-medium text-slate-900">
          {isEdit ? "Edit" : "Baru"}
        </span>
      </nav>

      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            {isEdit
              ? mode === "child"
                ? "Edit Sub-materi"
                : "Edit Topik Utama"
              : mode === "child"
                ? "Tambah Sub-materi"
                : "Tambah Topik Utama"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {mode === "child" && activeParent
              ? `Materi ini akan muncul sebagai bagian dari topik "${activeParent.title}" di sidebar website.`
              : mode === "child"
                ? "Pilih topik induk di panel kanan untuk menentukan di mana materi ini tampil."
                : "Topik utama tampil sebagai header di sidebar, bisa punya sub-materi di bawahnya."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirty ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-200"
              title={isEdit ? "Autosave 3 detik setelah berhenti mengetik" : "Klik Simpan Draft untuk menyimpan"}
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
            href={`/sites/${siteId}/pembelajaran`}
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
              <h3 className="text-[15px] font-bold text-slate-900">Lokasi di sidebar</h3>
            </div>
            <div className="grid gap-4 p-5">
              {/* SATU dropdown — pertanyaan konkret: "mau diletakkan di mana?" */}
              <Field label="Letakkan di bawah">
                <select
                  value={parentId}
                  onChange={(e) => {
                    const v = e.target.value;
                    setParentId(v);
                    setMode(v === "" ? "parent" : "child");
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                >
                  <option value="">
                    — Tidak di bawah apapun (jadi topik utama) —
                  </option>
                  {parents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.emoji ? `${p.emoji} ` : ""}
                      {p.title}
                    </option>
                  ))}
                </select>
                <p className="pt-1 text-[11px] text-slate-500">
                  {mode === "parent"
                    ? "Materi akan muncul sebagai topik utama di sidebar."
                    : activeParent
                      ? `Materi akan muncul di bawah "${activeParent.title}" di sidebar.`
                      : ""}
                </p>
              </Field>

              {/* Live preview — compact, hanya text-based */}
              <PreviewHint
                mode={mode}
                activeParent={activeParent}
                siblings={siblings}
                newTitle={title || "(materi ini)"}
                newEmoji={emoji}
                sortOrder={sortOrder}
                selfId={isEdit ? material?.id : undefined}
              />

              {/* Emoji — hanya untuk topik utama */}
              {mode === "parent" && (
                <Field label="Ikon di sidebar (opsional)">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-2xl">
                      {emoji || "📘"}
                    </div>
                    <input
                      type="text"
                      value={emoji}
                      onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
                      placeholder="📘 🎯 🖼"
                      maxLength={4}
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                    />
                  </div>
                </Field>
              )}

              {/* Pengaturan lanjutan — collapsed accordion untuk sort_order.
                  Mayoritas user pakai ↑↓ di halaman list untuk reorder,
                  jadi field ini jarang disentuh. Sembunyikan default. */}
              <details className="rounded-lg border border-slate-200 bg-slate-50">
                <summary className="cursor-pointer px-3 py-2 text-[12px] font-bold text-slate-600 hover:text-slate-900">
                  Pengaturan lanjutan
                </summary>
                <div className="border-t border-slate-200 p-3">
                  <Field label="Posisi urutan (angka)">
                    <input
                      type="number"
                      value={sortOrder}
                      onChange={(e) =>
                        setSortOrder(parseInt(e.target.value, 10) || 0)
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400"
                    />
                    <p className="pt-1 text-[11px] text-slate-500">
                      Biasanya tidak perlu diubah manual — pakai tombol ↑↓ di
                      halaman daftar materi untuk reorder.
                    </p>
                  </Field>
                </div>
              </details>
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

// PreviewHint — compact mini-tree showing where materi will appear in the
// website sidebar. Shows 2-3 sibling context + current item highlighted.
function PreviewHint({
  mode,
  activeParent,
  siblings,
  newTitle,
  newEmoji,
  sortOrder,
  selfId,
}: {
  mode: "parent" | "child";
  activeParent: LearningMaterial | null | undefined;
  siblings: LearningMaterial[];
  newTitle: string;
  newEmoji: string;
  sortOrder: number;
  selfId?: string;
}) {
  type Item = { key: string; title: string; emoji?: string; isSelf?: boolean };
  const self: Item = {
    key: selfId ?? "__new__",
    title: newTitle,
    emoji: mode === "parent" ? newEmoji : undefined,
    isSelf: true,
  };
  const items: Item[] = siblings.map((s) => ({
    key: s.id,
    title: s.title,
    emoji: mode === "parent" ? s.emoji : undefined,
  }));
  // Insert self at correct position by sort_order.
  let insertAt = items.length;
  for (let i = 0; i < siblings.length; i++) {
    if (sortOrder < siblings[i].sort_order) {
      insertAt = i;
      break;
    }
  }
  items.splice(insertAt, 0, self);
  // Trim to 3 neighbors around self (prev + self + next). Kalau ujung, geser.
  const selfIdx = items.findIndex((it) => it.isSelf);
  let start = Math.max(0, selfIdx - 1);
  let end = Math.min(items.length, start + 3);
  if (end - start < 3) start = Math.max(0, end - 3);
  const visible = items.slice(start, end);
  const hasBefore = start > 0;
  const hasAfter = end < items.length;

  return (
    <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3.5">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Preview di sidebar website
      </div>
      {mode === "child" && activeParent && (
        <div className="mb-1 flex items-center gap-1.5 text-[13px] font-bold text-slate-900">
          {activeParent.emoji && <span>{activeParent.emoji}</span>}
          <span className="truncate">{activeParent.title}</span>
        </div>
      )}
      <ul
        className={
          "flex flex-col gap-0.5 text-[12.5px] " +
          (mode === "child"
            ? "ml-2 border-l-2 border-slate-200 pl-3"
            : "")
        }
      >
        {hasBefore && (
          <li className="px-2 py-0.5 text-slate-400">⋮</li>
        )}
        {visible.map((item) => (
          <li
            key={item.key}
            className={
              "flex items-center gap-1.5 rounded-md px-2 py-1 " +
              (item.isSelf
                ? "bg-blue-100 font-bold text-blue-900 ring-1 ring-blue-300"
                : mode === "parent"
                  ? "font-semibold text-slate-600"
                  : "text-slate-500")
            }
          >
            {item.emoji && <span>{item.emoji}</span>}
            <span className="truncate">{item.title}</span>
            {item.isSelf && (
              <span className="ml-auto text-[9px] font-bold uppercase text-blue-700">
                ini
              </span>
            )}
          </li>
        ))}
        {hasAfter && (
          <li className="px-2 py-0.5 text-slate-400">⋮</li>
        )}
      </ul>
    </div>
  );
}
