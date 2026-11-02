"use client";

// Form klien — dipakai halaman tambah dan ubah, untuk reseller maupun agent.
//
// Halaman penuh, bukan dialog: Provinsi dan Kota sekarang memakai
// ProvinceSelect/CitySelect yang membuka daftar panjang, dan itu sesak di
// dalam dialog yang tingginya dibatasi.
//
// Kota bergantung pada provinsi (CitySelect mati sampai provinsi dipilih),
// jadi mengganti provinsi mengosongkan kota supaya tidak tertinggal pasangan
// yang tidak cocok.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Save, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CitySelect, CountryBadge, ProvinceSelect } from "@/components/WilayahSelect";

export type ClientFormValues = {
  email: string;
  name: string;
  phone_number: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  nik: string;
};

const EMPTY: ClientFormValues = {
  email: "",
  name: "",
  phone_number: "",
  address: "",
  city: "",
  state: "",
  postal_code: "",
  nik: "",
};

export function ClientForm({
  mode,
  basePath,
  apiPrefix,
  clientID,
  initial,
}: {
  mode: "create" | "edit";
  basePath: string;
  apiPrefix: "reseller" | "agent";
  clientID?: string;
  initial?: Partial<ClientFormValues>;
}) {
  const router = useRouter();
  const [form, setForm] = useState<ClientFormValues>({ ...EMPTY, ...initial });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (initial) setForm((f) => ({ ...f, ...initial }));
    // initial datang dari fetch induk; cukup sinkron saat isinya berubah.
  }, [initial]);

  function set<K extends keyof ClientFormValues>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (mode === "create" && !form.email.includes("@")) {
      setErr("Email tidak valid");
      return;
    }
    if (!form.name.trim()) {
      setErr("Nama wajib diisi");
      return;
    }

    setSaving(true);
    try {
      if (mode === "create") {
        // Endpoint create sama untuk reseller & agent (RequireResellerOrAgent).
        await api("/api/v1/reseller/clients", {
          method: "POST",
          body: JSON.stringify({ ...form, email: form.email.toLowerCase().trim() }),
        });
        toast.success("Klien ditambahkan, email undangan terkirim");
        router.push(basePath);
      } else {
        // Email tidak ikut — backend tidak menerimanya di PATCH.
        const { email: _email, ...patch } = form;
        await api(`/api/v1/${apiPrefix}/clients/${clientID}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
        toast.success("Perubahan tersimpan");
        router.push(`${basePath}/${clientID}`);
      }
      router.refresh();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const backHref = mode === "edit" && clientID ? `${basePath}/${clientID}` : basePath;

  return (
    <form onSubmit={submit} className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ms-2 gap-1.5 text-muted-foreground">
          <Link href={backHref}>
            <ArrowLeft className="size-4" />
            Kembali
          </Link>
        </Button>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          {mode === "create" ? "Tambah Klien" : "Ubah Data Klien"}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {mode === "create"
            ? "Klien akan menerima email undangan untuk mengatur kata sandi. Alamat dipakai saat pendaftaran domain."
            : "Alamat dan NIK dipakai sebagai data kontak saat pendaftaran domain."}
        </p>
      </div>

      {err && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cf-email">Email {mode === "create" && "*"}</Label>
              <Input
                id="cf-email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="klien@example.com"
                disabled={mode === "edit"}
              />
              {mode === "edit" && (
                <p className="text-xs text-muted-foreground">Email tidak bisa diubah.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-name">Nama *</Label>
              <Input
                id="cf-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Bu Ani Wijaya"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cf-phone">Nomor HP</Label>
              <Input
                id="cf-phone"
                value={form.phone_number}
                onChange={(e) => set("phone_number", e.target.value)}
                placeholder="+62812xxxxxxx"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-nik">NIK</Label>
              <Input
                id="cf-nik"
                value={form.nik}
                onChange={(e) => set("nik", e.target.value)}
                placeholder="16 digit NIK"
              />
              <p className="text-xs text-muted-foreground">Wajib untuk domain .id.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cf-address">Alamat</Label>
            <Textarea
              id="cf-address"
              rows={2}
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="Jl. Contoh No. 10, RT 01/RW 02"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Provinsi</Label>
              <ProvinceSelect
                value={form.state}
                onChange={(v) =>
                  // Kota lama belum tentu ada di provinsi baru — kosongkan.
                  setForm((f) => ({ ...f, state: v, city: "" }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Kota/Kabupaten</Label>
              <CitySelect
                province={form.state}
                value={form.city}
                onChange={(v) => set("city", v)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cf-postal">Kode Pos</Label>
              <Input
                id="cf-postal"
                value={form.postal_code}
                onChange={(e) => set("postal_code", e.target.value)}
                placeholder="10110"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Negara</Label>
              <CountryBadge />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {mode === "create" ? "Tambah Klien" : "Simpan Perubahan"}
        </Button>
        <Button type="button" variant="ghost" asChild>
          <Link href={backHref}>Batal</Link>
        </Button>
      </div>
    </form>
  );
}
