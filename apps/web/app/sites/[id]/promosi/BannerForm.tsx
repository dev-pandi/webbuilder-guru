"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { api, type Banner } from "@/lib/api";
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
import { ImagePicker } from "@/components/ImagePicker";

// Convert stored RFC3339 → value untuk <input type="datetime-local"> (butuh
// "YYYY-MM-DDTHH:MM" tanpa timezone). Return "" kalau null/kosong.
function isoToInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Balik ke RFC3339 (datetime-local dianggap local timezone).
function inputToISO(v: string): string | null {
  if (!v) return null;
  return new Date(v).toISOString();
}

export function BannerForm({
  siteId,
  banner,
  open,
  onClose,
  onSaved,
}: {
  siteId: string;
  banner: Banner | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!banner;
  const [internalTitle, setInternalTitle] = useState("");
  const [imageURL, setImageURL] = useState("");
  const [targetURL, setTargetURL] = useState("");
  const [altText, setAltText] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [teacherActive, setTeacherActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setInternalTitle(banner?.internal_title ?? "");
    setImageURL(banner?.image_url ?? "");
    setTargetURL(banner?.target_url ?? "");
    setAltText(banner?.alt_text ?? "");
    setSortOrder(banner?.sort_order ?? 0);
    setStartAt(isoToInput(banner?.start_at ?? null));
    setEndAt(isoToInput(banner?.end_at ?? null));
    setTeacherActive(banner?.teacher_active ?? true);
  }, [banner, open]);

  async function save() {
    if (!internalTitle.trim()) return toast.error("Judul internal wajib diisi");
    if (!imageURL.trim()) return toast.error("Gambar banner wajib diisi");
    if (!targetURL.startsWith("http://") && !targetURL.startsWith("https://")) {
      return toast.error("URL tujuan harus http/https");
    }
    if (!altText.trim()) return toast.error("Alt text wajib diisi untuk aksesibilitas");

    setSaving(true);
    try {
      if (isEdit) {
        const body: Record<string, unknown> = {
          internal_title: internalTitle,
          image_url: imageURL,
          target_url: targetURL,
          alt_text: altText,
          sort_order: sortOrder,
          teacher_active: teacherActive,
        };
        // Kirim clear_start/clear_end kalau field dikosongkan.
        if (startAt) body.start_at = inputToISO(startAt);
        else body.clear_start = true;
        if (endAt) body.end_at = inputToISO(endAt);
        else body.clear_end = true;
        await api(`/api/v1/banners/${banner!.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        toast.success("Banner disimpan");
      } else {
        const body = {
          internal_title: internalTitle,
          image_url: imageURL,
          target_url: targetURL,
          alt_text: altText,
          sort_order: sortOrder,
          teacher_active: teacherActive,
          start_at: startAt ? inputToISO(startAt) : null,
          end_at: endAt ? inputToISO(endAt) : null,
        };
        await api(`/api/v1/sites/${siteId}/banners`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        toast.success("Banner dibuat");
      }
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Banner" : "Banner Baru"}</DialogTitle>
          <DialogDescription>
            Banner tampil di beranda website Anda. Gunakan gambar rasio 2:1
            (contoh 1200×600). Alt text penting untuk aksesibilitas.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <div>
            <Label className="text-xs">Gambar (2:1)</Label>
            <div className="mt-1.5 overflow-hidden rounded-lg border">
              <div className="aspect-[2/1] bg-muted">
                {imageURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageURL} alt="" className="size-full object-cover" />
                ) : null}
              </div>
              <div className="p-2">
                <ImagePicker value={imageURL} onChange={setImageURL} />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="internal_title">Judul Internal</Label>
              <Input
                id="internal_title"
                value={internalTitle}
                onChange={(e) => setInternalTitle(e.target.value)}
                placeholder="Contoh: Promo Buku Pelajaran Bulan Ini"
              />
              <p className="text-[11px] text-muted-foreground">
                Tidak tampil publik — untuk memudahkan Anda mengelola banner.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="target_url">URL Tujuan</Label>
              <Input
                id="target_url"
                type="url"
                value={targetURL}
                onChange={(e) => setTargetURL(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="alt_text">Alt Text</Label>
              <Input
                id="alt_text"
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                placeholder="Deskripsi singkat gambar untuk pembaca layar"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sort_order">Urutan</Label>
                <Input
                  id="sort_order"
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(parseInt(e.target.value || "0", 10))}
                />
                <p className="text-[11px] text-muted-foreground">Kecil dulu tampil.</p>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={teacherActive}
                    onChange={(e) => setTeacherActive(e.target.checked)}
                    className="size-4"
                  />
                  Aktif
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="start_at">Mulai (opsional)</Label>
                <Input
                  id="start_at"
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="end_at">Berakhir (opsional)</Label>
                <Input
                  id="end_at"
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
