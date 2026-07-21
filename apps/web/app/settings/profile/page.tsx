"use client";

// Profile settings — edit contact/postal fields that will feed the domain
// registry integration later (WHOIS + EPP contact object).
//
// Design notes:
//   - We PATCH only fields that actually changed (dirty tracking against
//     the original `Me` snapshot). Keeps intent clear in audit logs and
//     avoids clobbering fields the user didn't touch.
//   - Email is read-only here — change requires re-verification flow which
//     isn't built yet.

import { useEffect, useState } from "react";
import { Loader2, Save, Mail, User as UserIcon, Phone, MapPin, Building2, Map, Hash, Fingerprint } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Me = {
  id: string;
  email: string;
  name: string;
  role: string;
  email_verified_at?: string | null;
  phone_number: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  nik: string;
};

// The set of fields this form can edit. Kept as a const array so the diff
// logic and JSX render loop stay in sync.
const EDITABLE = ["name", "phone_number", "address", "city", "state", "postal_code", "nik"] as const;
type EditableKey = (typeof EDITABLE)[number];

export default function ProfilePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [form, setForm] = useState<Record<EditableKey, string>>({
    name: "",
    phone_number: "",
    address: "",
    city: "",
    state: "",
    postal_code: "",
    nik: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<Me>("/api/v1/auth/me")
      .then((u) => {
        setMe(u);
        setForm({
          name: u.name ?? "",
          phone_number: u.phone_number ?? "",
          address: u.address ?? "",
          city: u.city ?? "",
          state: u.state ?? "",
          postal_code: u.postal_code ?? "",
          nik: u.nik ?? "",
        });
      })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const dirty = me
    ? EDITABLE.some((k) => form[k] !== ((me as unknown as Record<string, string>)[k] ?? ""))
    : false;

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!me || !dirty) return;
    setSaving(true);
    try {
      // Send only the fields that changed — keeps the PATCH intent narrow.
      const patch: Partial<Record<EditableKey, string>> = {};
      EDITABLE.forEach((k) => {
        if (form[k] !== ((me as unknown as Record<string, string>)[k] ?? "")) {
          patch[k] = form[k];
        }
      });
      const updated = await api<Me>("/api/v1/auth/me", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setMe(updated);
      toast.success("Profil tersimpan");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Memuat profil…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profil Akun</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Data kontak & alamat akan dipakai untuk pendaftaran domain (WHOIS contact) dan invoice.
        </p>
      </div>

      <form onSubmit={onSave}>
        <Card>
          <CardHeader>
            <CardTitle>Data Akun</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <FieldRow icon={Mail} label="Email">
              <Input value={me?.email ?? ""} readOnly disabled className="max-w-md" />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Email tidak bisa diubah dari halaman ini.
              </p>
            </FieldRow>

            <FieldRow icon={UserIcon} label="Nama Lengkap">
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nama sesuai KTP"
                maxLength={128}
                className="max-w-md"
              />
            </FieldRow>

            <FieldRow icon={Phone} label="Nomor HP / WhatsApp">
              <Input
                value={form.phone_number}
                onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))}
                placeholder="+62812xxxxxxx"
                maxLength={32}
                inputMode="tel"
                className="max-w-md"
              />
            </FieldRow>

            <FieldRow icon={Fingerprint} label="NIK (KTP)">
              <Input
                value={form.nik}
                onChange={(e) =>
                  // NIK Indonesia = 16 digit angka. Filter non-digit + cap 16.
                  setForm((f) => ({ ...f, nik: e.target.value.replace(/\D/g, "").slice(0, 16) }))
                }
                placeholder="16 digit KTP"
                maxLength={16}
                inputMode="numeric"
                className="max-w-md tracking-wider font-mono"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Wajib untuk registrasi domain <code>.id</code> (regulasi Kemenkominfo).
                Untuk TLD lain (.com, .net, dst.) boleh dikosongkan.
              </p>
            </FieldRow>
          </CardContent>
        </Card>

        <Card className="mt-5">
          <CardHeader>
            <CardTitle>Alamat</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <FieldRow icon={MapPin} label="Alamat Jalan">
              <Input
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Jl. Contoh No. 123, RT 01/RW 02"
                maxLength={255}
              />
            </FieldRow>

            <div className="grid gap-5 sm:grid-cols-2">
              <FieldRow icon={Building2} label="Kota">
                <Input
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  placeholder="Jakarta Selatan"
                  maxLength={128}
                />
              </FieldRow>

              <FieldRow icon={Map} label="Provinsi">
                <Input
                  value={form.state}
                  onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                  placeholder="DKI Jakarta"
                  maxLength={128}
                />
              </FieldRow>
            </div>

            <FieldRow icon={Hash} label="Kode Pos">
              <Input
                value={form.postal_code}
                onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))}
                placeholder="12345"
                maxLength={16}
                inputMode="numeric"
                className="max-w-[10rem]"
              />
            </FieldRow>
          </CardContent>
        </Card>

        <div className="mt-6 flex items-center justify-end gap-3">
          {dirty && (
            <span className="text-xs text-muted-foreground">
              Ada perubahan yang belum disimpan
            </span>
          )}
          <Button type="submit" disabled={!dirty || saving} className="gap-2">
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Menyimpan…
              </>
            ) : (
              <>
                <Save className="size-4" />
                Simpan
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

// FieldRow — small helper so every field renders with the same icon + label
// alignment. Extracted only because there are 8 near-identical field wrappers.
function FieldRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-sm font-medium">
        <Icon className="size-3.5 text-muted-foreground" />
        {label}
      </Label>
      {children}
    </div>
  );
}
