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

export type Product = {
  id: string;
  site_id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  stock: number | null;
  image_url: string;
  category: string;
  status: "active" | "draft" | "archived";
};

export function ProductDialog({
  open,
  onOpenChange,
  siteId,
  product,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  siteId: string;
  product: Product | null;
  onSaved: () => void;
}) {
  const isEdit = !!product;
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState(0);
  const [currency, setCurrency] = useState("IDR");
  const [unlimited, setUnlimited] = useState(true);
  const [stock, setStock] = useState(0);
  const [imageURL, setImageURL] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<"active" | "draft" | "archived">("active");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (product) {
      setSlug(product.slug);
      setName(product.name);
      setDescription(product.description);
      setPrice(product.price);
      setCurrency(product.currency);
      setUnlimited(product.stock == null);
      setStock(product.stock ?? 0);
      setImageURL(product.image_url);
      setCategory(product.category);
      setStatus(product.status);
    } else {
      setSlug("");
      setName("");
      setDescription("");
      setPrice(0);
      setCurrency("IDR");
      setUnlimited(true);
      setStock(0);
      setImageURL("");
      setCategory("");
      setStatus("active");
    }
  }, [open, product]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        slug,
        name,
        description,
        price,
        currency,
        ...(unlimited ? { clear_stock: true } : { stock }),
        image_url: imageURL,
        category,
        status,
      };
      if (isEdit) {
        await api(`/api/v1/products/${product!.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        toast.success("Produk diperbarui");
      } else {
        await api(`/api/v1/sites/${siteId}/products`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        toast.success("Produk dibuat");
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Produk" : "Produk Baru"}</DialogTitle>
          <DialogDescription>
            Harga disimpan sebagai integer (smallest unit). Untuk Rp 15.000 isi 15000.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nama</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                className="font-mono"
                placeholder="keripik-singkong"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desc">Deskripsi</Label>
            <Textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="price">Harga</Label>
              <Input
                id="price"
                type="number"
                min={0}
                required
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="currency">Mata Uang</Label>
              <Input
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category">Kategori</Label>
              <Input
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="opsional"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Stok</Label>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={unlimited}
                    onChange={(e) => setUnlimited(e.target.checked)}
                  />
                  Tak terbatas
                </label>
                {!unlimited && (
                  <Input
                    type="number"
                    min={0}
                    value={stock}
                    onChange={(e) => setStock(Number(e.target.value))}
                    className="ml-2"
                  />
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Aktif (tampil di website)</SelectItem>
                  <SelectItem value="draft">Draft (tidak tampil)</SelectItem>
                  <SelectItem value="archived">Arsip</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Gambar Utama</Label>
            <ImagePicker value={imageURL} onChange={setImageURL} />
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
