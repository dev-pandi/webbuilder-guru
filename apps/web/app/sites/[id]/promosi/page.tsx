"use client";

// Ruang Promosi — mirror mockup dashboard-guru/promosi.html.
// Wired ke /api/v1/sites/:id/banners (GET, POST) + /api/v1/banners/:id (PATCH, DELETE).
// Local state kartu = source of truth sampai user klik Simpan; diff dikirim
// sebagai body PATCH.

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { api, BANNER_STATUS_LABEL, type Banner } from "@/lib/api";

// Gradient palette untuk fallback ketika banner tidak punya image_url.
const GRADIENTS = [
  "linear-gradient(135deg,#1e4f89,#77a9d9)",
  "linear-gradient(135deg,#8b5e3c,#e3b57a)",
  "linear-gradient(135deg,#4f6577,#8faabd)",
  "linear-gradient(135deg,#3e6d5c,#8ec4a8)",
];

function isoToDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dateToISO(v: string): string | null {
  if (!v) return null;
  return new Date(v + "T00:00:00").toISOString();
}

export default function PromosiPage() {
  const params = useParams<{ id: string }>();
  const sid = params.id;
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const list = await api<Banner[]>(`/api/v1/sites/${sid}/banners`);
      setBanners(list ?? []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid]);

  function updateLocal<K extends keyof Banner>(id: string, key: K, value: Banner[K]) {
    setBanners((prev) => prev.map((b) => (b.id === id ? { ...b, [key]: value } : b)));
  }

  async function save(b: Banner) {
    setBusyId(b.id);
    try {
      const body: Record<string, unknown> = {
        target_url: b.target_url,
        sort_order: b.sort_order,
        teacher_active: b.teacher_active,
      };
      if (b.start_at) body.start_at = b.start_at;
      else body.clear_start = true;
      if (b.end_at) body.end_at = b.end_at;
      else body.clear_end = true;
      await api(`/api/v1/banners/${b.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      toast.success("Banner disimpan");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(b: Banner, next: boolean) {
    updateLocal(b.id, "teacher_active", next);
    setBusyId(b.id);
    try {
      await api(`/api/v1/banners/${b.id}`, {
        method: "PATCH",
        body: JSON.stringify({ teacher_active: next }),
      });
      toast.success(next ? "Banner diaktifkan" : "Banner dinonaktifkan");
      refresh();
    } catch (e) {
      updateLocal(b.id, "teacher_active", !next);
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(b: Banner) {
    if (!confirm(`Hapus banner "${b.internal_title}"?`)) return;
    setBusyId(b.id);
    try {
      await api(`/api/v1/banners/${b.id}`, { method: "DELETE" });
      toast.success("Banner dihapus");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            Ruang Promosi
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Kelola banner promosi yang tampil di Beranda Website Pribadi Guru.
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
        >
          <Plus className="size-4" />
          Tambah Banner
        </button>
      </div>

      <div className="rounded-xl bg-blue-50 px-4 py-3 text-[13px] text-blue-800">
        <strong>Rasio 2:1</strong> — gunakan banner full-image. Banner tampil hanya jika Status Guru aktif dan Status Admin diizinkan.
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="size-4 animate-spin" /> Memuat banner…
        </div>
      )}

      {!loading && banners.length === 0 && !showNew && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-600">Belum ada banner. Klik &quot;Tambah Banner&quot; untuk mulai.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {banners.map((b, idx) => {
          const gradient = GRADIENTS[idx % GRADIENTS.length];
          return (
            <BannerCard
              key={b.id}
              banner={b}
              gradient={gradient}
              busy={busyId === b.id}
              onChange={(next) => setBanners((prev) => prev.map((x) => (x.id === b.id ? next : x)))}
              onSave={() => save(b)}
              onToggle={(v) => toggleActive(b, v)}
              onDelete={() => remove(b)}
            />
          );
        })}
      </div>

      {showNew && (
        <NewBannerDialog
          siteId={sid}
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function BannerCard({
  banner: b,
  gradient,
  busy,
  onChange,
  onSave,
  onToggle,
  onDelete,
}: {
  banner: Banner;
  gradient: string;
  busy: boolean;
  onChange: (next: Banner) => void;
  onSave: () => void;
  onToggle: (v: boolean) => void;
  onDelete: () => void;
}) {
  const bgStyle = useMemo(() => {
    if (b.image_url) {
      return {
        backgroundImage: `url(${b.image_url})`,
        backgroundSize: "cover" as const,
        backgroundPosition: "center" as const,
      };
    }
    return { background: gradient };
  }, [b.image_url, gradient]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div
        className="flex aspect-[2/1] items-end rounded-xl p-4 text-lg font-bold text-white"
        style={bgStyle}
      >
        <span className="rounded-md bg-black/30 px-2 py-1 text-sm">{b.internal_title}</span>
      </div>

      <div className="mt-3 grid gap-3">
        <Field label="URL Tujuan">
          <input
            value={b.target_url}
            onChange={(e) => onChange({ ...b, target_url: e.target.value })}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Tanggal Mulai">
            <input
              type="date"
              value={isoToDate(b.start_at)}
              onChange={(e) => onChange({ ...b, start_at: dateToISO(e.target.value) })}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
            />
          </Field>
          <Field label="Tanggal Selesai">
            <input
              type="date"
              value={isoToDate(b.end_at)}
              onChange={(e) => onChange({ ...b, end_at: dateToISO(e.target.value) })}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
            />
          </Field>
        </div>

        <div className="flex items-center justify-between text-[13px]">
          <strong className="text-slate-700">Urutan</strong>
          <input
            type="number"
            min={0}
            value={b.sort_order}
            onChange={(e) => onChange({ ...b, sort_order: Number(e.target.value) })}
            className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400"
          />
        </div>

        <div className="flex items-center justify-between text-[13px]">
          <strong className="text-slate-700">Status Guru</strong>
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={b.teacher_active}
              onChange={(e) => onToggle(e.target.checked)}
              className="peer sr-only"
            />
            <span className="relative h-6 w-11 rounded-full bg-slate-300 transition-colors peer-checked:bg-emerald-500">
              <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
            </span>
            <span className="text-[12px] font-bold text-slate-700">
              {b.teacher_active ? "Aktif" : "Nonaktif"}
            </span>
          </label>
        </div>

        <div className="flex items-center justify-between text-[13px]">
          <strong className="text-slate-700">Status Admin</strong>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${
              b.admin_enabled
                ? "bg-emerald-100 text-emerald-800"
                : "bg-rose-100 text-rose-800"
            }`}
          >
            {b.admin_enabled ? "Diizinkan" : "Tidak diizinkan"}
          </span>
        </div>

        <div className="flex items-center justify-between text-[12px] text-slate-500">
          <span>Status Efektif</span>
          <span className="font-semibold text-slate-700">
            {BANNER_STATUS_LABEL[b.effective_status]}
          </span>
        </div>

        {!b.admin_enabled && b.admin_disabled_reason && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12px] font-bold text-rose-700">
            {b.admin_disabled_reason}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onSave}
            disabled={busy}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {busy ? "Menyimpan…" : "Simpan"}
          </button>
          <button
            onClick={onDelete}
            disabled={busy}
            className="rounded-lg bg-rose-50 px-3 py-2 text-[12px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
          >
            Hapus
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label className="text-[12px] font-bold text-slate-600">{label}</label>
      {children}
    </div>
  );
}

function NewBannerDialog({
  siteId,
  onClose,
  onCreated,
}: {
  siteId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [internalTitle, setInternalTitle] = useState("");
  const [imageURL, setImageURL] = useState("");
  const [targetURL, setTargetURL] = useState("");
  const [altText, setAltText] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!internalTitle.trim()) return toast.error("Judul wajib diisi");
    if (!imageURL.trim()) return toast.error("URL gambar wajib diisi");
    if (!altText.trim()) return toast.error("Alt text wajib diisi");
    if (!targetURL.startsWith("http")) return toast.error("URL tujuan harus http/https");
    setSaving(true);
    try {
      await api(`/api/v1/sites/${siteId}/banners`, {
        method: "POST",
        body: JSON.stringify({
          internal_title: internalTitle,
          image_url: imageURL,
          target_url: targetURL,
          alt_text: altText,
          sort_order: sortOrder,
          teacher_active: true,
          start_at: startAt ? dateToISO(startAt) : null,
          end_at: endAt ? dateToISO(endAt) : null,
        }),
      });
      toast.success("Banner dibuat");
      onCreated();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Banner Baru</h2>
            <p className="mt-1 text-[13px] text-slate-500">
              Upload gambar dulu ke menu Aset lalu paste URL-nya di sini. Gunakan rasio 2:1.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          <Field label="Judul Internal">
            <input
              value={internalTitle}
              onChange={(e) => setInternalTitle(e.target.value)}
              placeholder="Contoh: Membaca Membuka Dunia"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
            />
          </Field>
          <Field label="URL Gambar (2:1)">
            <input
              value={imageURL}
              onChange={(e) => setImageURL(e.target.value)}
              placeholder="https://…"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
            />
          </Field>
          <Field label="Alt Text">
            <input
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              placeholder="Deskripsi singkat gambar untuk aksesibilitas"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
            />
          </Field>
          <Field label="URL Tujuan">
            <input
              value={targetURL}
              onChange={(e) => setTargetURL(e.target.value)}
              placeholder="https://…"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tanggal Mulai">
              <input
                type="date"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
              />
            </Field>
            <Field label="Tanggal Selesai">
              <input
                type="date"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
              />
            </Field>
          </div>
          <Field label="Urutan Tampil">
            <input
              type="number"
              min={0}
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
            />
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            Batal
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Menyimpan…" : "Buat Banner"}
          </button>
        </div>
      </div>
    </div>
  );
}
