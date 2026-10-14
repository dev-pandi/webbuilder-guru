"use client";

// Daftar Reseller — landing sign-up untuk B2B partner (agency/reseller).
//
// Flow:
//   1. Form isi info bisnis + PIC + kontak
//   2. Submit → POST /auth/reseller/apply — bikin user role='reseller'
//      dengan status='pending_approval'
//   3. Success screen: "Menunggu approval admin, cek email untuk update"
//   4. Admin approve via /admin/resellers → user bisa login
//
// TIDAK auto-issue JWT setelah submit — semantic "belum boleh masuk sistem".

import Link from "next/link";
import { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  Building2,
  CheckCircle2,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Phone,
  User,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CitySelect, ProvinceSelect } from "@/components/WilayahSelect";

type FormState = {
  email: string;
  password: string;
  name: string;
  reseller_display_name: string;
  phone_number: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  nik: string;
};

const EMPTY_FORM: FormState = {
  email: "",
  password: "",
  name: "",
  reseller_display_name: "",
  phone_number: "",
  address: "",
  city: "",
  state: "",
  postal_code: "",
  nik: "",
};

export default function DaftarResellerPage() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await api<{ message: string; reseller_id: string; reseller_status: string }>(
        "/api/v1/auth/reseller/apply",
        {
          method: "POST",
          body: JSON.stringify(form),
          auth: false,
        },
      );
      setSubmitted(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-emerald-500/10">
            <CheckCircle2 className="size-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Aplikasi Diterima</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Terima kasih sudah daftar sebagai reseller <strong>{form.reseller_display_name}</strong>.
            Admin akan review aplikasi Anda dan mengirim email begitu disetujui.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            SLA review: 1–2 hari kerja. Cek folder spam kalau email tidak masuk.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button asChild variant="default">
              <Link href="/login">Kembali ke Login</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/">Ke halaman utama</Link>
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen items-start justify-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 -right-40 h-[600px] w-[600px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-[600px] w-[600px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="w-full max-w-2xl">
        <div className="text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/10">
            <Briefcase className="size-6 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Daftar sebagai Reseller</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Untuk agency, freelancer, atau bisnis yang ingin jual layanan web-builder ke banyak klien.
            <br />
            Punya akun personal?{" "}
            <Link href="/register" className="font-medium text-primary underline underline-offset-4">
              Daftar akun biasa
            </Link>
            .
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="mt-8 space-y-6 rounded-2xl border bg-card p-6 shadow-sm"
        >
          {/* Info bisnis */}
          <fieldset className="space-y-4">
            <legend className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <Building2 className="size-3.5" />
              Info Bisnis
            </legend>

            <div className="space-y-1.5">
              <Label htmlFor="reseller_display_name">Nama Bisnis / Brand *</Label>
              <Input
                id="reseller_display_name"
                required
                value={form.reseller_display_name}
                onChange={(e) => set("reseller_display_name", e.target.value)}
                placeholder="PT Ceria Digital"
              />
              <p className="text-[11px] text-muted-foreground">
                Muncul di email undangan ke klien Anda.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nama PIC (Contact Person) *</Label>
                <Input
                  id="name"
                  required
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Budi Setiawan"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone_number">Nomor HP *</Label>
                <Input
                  id="phone_number"
                  required
                  type="tel"
                  value={form.phone_number}
                  onChange={(e) => set("phone_number", e.target.value)}
                  placeholder="+62812xxxxxxx"
                />
              </div>
            </div>
          </fieldset>

          {/* Kredensial login */}
          <fieldset className="space-y-4">
            <legend className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <User className="size-3.5" />
              Kredensial Login
            </legend>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email Bisnis *</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    required
                    type="email"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value.toLowerCase())}
                    placeholder="hello@ceria.id"
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password *</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    required
                    type="password"
                    minLength={8}
                    value={form.password}
                    onChange={(e) => set("password", e.target.value)}
                    placeholder="Minimum 8 karakter"
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
          </fieldset>

          {/* Alamat */}
          <fieldset className="space-y-4">
            <legend className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <MapPin className="size-3.5" />
              Alamat Bisnis
            </legend>

            <div className="space-y-1.5">
              <Label htmlFor="address">Alamat lengkap *</Label>
              <Textarea
                id="address"
                required
                rows={2}
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                placeholder="Jl. Contoh No. 10, RT 03/RW 05, Kelurahan..."
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Provinsi *</Label>
                {/* Ganti provinsi → reset city (list kota filter by provinsi). */}
                <ProvinceSelect
                  value={form.state}
                  onChange={(v) => {
                    set("state", v);
                    set("city", "");
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Kota / Kabupaten *</Label>
                <CitySelect
                  province={form.state}
                  value={form.city}
                  onChange={(v) => set("city", v)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="postal_code">Kode Pos *</Label>
                <Input
                  id="postal_code"
                  required
                  value={form.postal_code}
                  onChange={(e) => set("postal_code", e.target.value)}
                  placeholder="10110"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nik">NIK KTP (opsional)</Label>
              <Input
                id="nik"
                value={form.nik}
                onChange={(e) => set("nik", e.target.value)}
                placeholder="Wajib kalau nanti mau register domain .id atas nama sendiri"
                maxLength={16}
                inputMode="numeric"
              />
            </div>
          </fieldset>

          {err && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0 translate-y-0.5" />
              <span>{err}</span>
            </div>
          )}

          <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
            <p className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Aplikasi akan di-review admin. Anda TIDAK bisa langsung login sampai
                di-approve. Kami akan email begitu status berubah aktif.
              </span>
            </p>
          </div>

          <Button type="submit" disabled={loading} className="w-full gap-1.5">
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Mengirim...
              </>
            ) : (
              <>
                Kirim Aplikasi
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Sudah punya akun reseller?{" "}
            <Link href="/login" className="font-medium text-primary underline underline-offset-4">
              Login di sini
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
