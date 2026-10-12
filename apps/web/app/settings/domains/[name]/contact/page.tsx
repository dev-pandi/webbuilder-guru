"use client";

// /settings/domains/[name]/contact — form update WHOIS contact untuk domain
// existing. PATCH /api/v1/domains/:name/contact (EPP replace-all: semua field
// wajib supaya registry tidak wipe field yang tidak di-kirim).
//
// Flow:
//   1. Mount → GET /api/v1/auth/me (prefill dari profil user sebagai baseline)
//   2. User edit form → klik "Simpan"
//   3. PATCH → dapat message "DB + EPP registry synced" / "DB only" / dsb.
//   4. Show success banner + link balik ke /settings/domains/[name]

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Save,
  UserCog,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Me = {
  id: string;
  name: string;
  email: string;
  phone_number?: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
};

type UpdateResp = {
  domain: string;
  contact_id: number;
  nic_handle: string;
  name: string;
  email: string;
  phone: string;
  message: string;
};

type ContactForm = {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
};

// EMAIL_RE — mirror auth.ValidEmail backend.
const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

// EPP PostalInfo type="int" (RFC 5733 §2.6) wajib ASCII — em-dash/aksen/emoji
// akan ditolak PANDI dengan "Transaction rolled back". Blokir di client.
function isASCIIPrintable(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || c > 0x7e) return false;
  }
  return true;
}

function countDigits(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 48 && c <= 57) n++;
  }
  return n;
}

function formErrors(f: ContactForm): Partial<Record<keyof ContactForm, string>> {
  const e: Partial<Record<keyof ContactForm, string>> = {};
  if (f.name && !isASCIIPrintable(f.name)) {
    e.name = "Nama hanya boleh karakter ASCII (tanpa aksen atau emoji)";
  }
  if (f.email && !EMAIL_RE.test(f.email.trim())) {
    e.email = "Format email tidak valid";
  }
  if (f.phone) {
    const d = countDigits(f.phone);
    if (d < 7 || d > 15) e.phone = "Nomor HP harus 7-15 digit (contoh: +62 812 3456 7890)";
  }
  if (f.address && !isASCIIPrintable(f.address)) {
    e.address = "Alamat hanya boleh karakter ASCII";
  }
  if (f.city && !isASCIIPrintable(f.city)) {
    e.city = "Nama kota hanya boleh karakter ASCII";
  }
  if (f.state && !isASCIIPrintable(f.state)) {
    e.state = "Nama provinsi hanya boleh karakter ASCII (mis. em-dash '—')";
  }
  if (f.postal_code) {
    const d = countDigits(f.postal_code);
    const allowed = /^[0-9\s\-]+$/.test(f.postal_code);
    if (!allowed || d < 4 || d > 10) e.postal_code = "Kode pos harus 4-10 digit angka";
  }
  return e;
}

export default function ContactUpdatePage() {
  const router = useRouter();
  const params = useParams<{ name: string }>();
  const domain = decodeURIComponent(params.name);

  const [form, setForm] = useState<ContactForm>({
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    postal_code: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<UpdateResp | null>(null);
  const errors = formErrors(form);
  const hasErrors = Object.keys(errors).length > 0;

  // Prefill dari profil user — bukan dari registry (kalau butuh WHOIS current,
  // fetch terpisah). Baseline profile lebih user-friendly untuk tipikal flow
  // "pindah alamat: update profil dulu, lalu propagate ke domain WHOIS".
  useEffect(() => {
    (async () => {
      try {
        const me = await api<Me>("/api/v1/auth/me");
        setForm({
          name: me.name || "",
          email: me.email || "",
          phone: me.phone_number || "",
          address: me.address || "",
          city: me.city || "",
          state: me.state || "",
          postal_code: me.postal_code || "",
        });
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setResult(null);

    // Client-side validation (mirror backend requirements).
    const required: Array<keyof ContactForm> = [
      "name",
      "email",
      "phone",
      "address",
      "city",
      "postal_code",
    ];
    const missing = required.filter((k) => !form[k].trim());
    if (missing.length > 0) {
      setErr("Field wajib kosong: " + missing.join(", "));
      return;
    }
    if (hasErrors) {
      setErr("Perbaiki field yang bertanda merah sebelum menyimpan");
      return;
    }

    setSaving(true);
    try {
      const res = await api<UpdateResp>(
        `/api/v1/domains/${encodeURIComponent(domain)}/contact`,
        {
          method: "PATCH",
          body: JSON.stringify(form),
        },
      );
      setResult(res);
      toast.success("Kontak WHOIS berhasil di-update");
    } catch (e) {
      if (e instanceof ApiError) {
        setErr(e.message);
      } else {
        setErr((e as Error).message);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat profil…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="gap-1.5">
          <Link href={`/settings/domains/${encodeURIComponent(domain)}`}>
            <ArrowLeft className="size-4" /> Kembali ke domain
          </Link>
        </Button>
      </div>

      <div>
        <div className="mb-1 flex items-center gap-2">
          <UserCog className="size-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Update kontak WHOIS</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Data akan tersimpan di registry PANDI untuk domain{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{domain}</code>
          . Semua field wajib — EPP tidak support partial update.
        </p>
      </div>

      {result ? (
        <SuccessBanner result={result} domain={domain} onBack={() => router.push(`/settings/domains/${encodeURIComponent(domain)}`)} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Detail kontak</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="name">
                    Nama lengkap <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    aria-invalid={!!errors.name}
                  />
                  {errors.name && <p className="text-[11px] text-destructive">{errors.name}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">
                    Email <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                    aria-invalid={!!errors.email}
                  />
                  {errors.email && <p className="text-[11px] text-destructive">{errors.email}</p>}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone">
                  Telepon <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+6281234567890"
                  required
                  aria-invalid={!!errors.phone}
                />
                {errors.phone ? (
                  <p className="text-[11px] text-destructive">{errors.phone}</p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Format E.164 direkomendasikan (mis. <code>+6281234567890</code>).
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="address">
                  Alamat <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="address"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  required
                  aria-invalid={!!errors.address}
                />
                {errors.address && <p className="text-[11px] text-destructive">{errors.address}</p>}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="city">
                    Kota <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="city"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    required
                    aria-invalid={!!errors.city}
                  />
                  {errors.city && <p className="text-[11px] text-destructive">{errors.city}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="state">Provinsi</Label>
                  <Input
                    id="state"
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                    aria-invalid={!!errors.state}
                  />
                  {errors.state && <p className="text-[11px] text-destructive">{errors.state}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="postal_code">
                    Kode pos <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="postal_code"
                    value={form.postal_code}
                    onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
                    required
                    aria-invalid={!!errors.postal_code}
                  />
                  {errors.postal_code && (
                    <p className="text-[11px] text-destructive">{errors.postal_code}</p>
                  )}
                </div>
              </div>

              {err && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  <AlertCircle className="size-4 shrink-0 translate-y-0.5" />
                  <span>{err}</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-2">
                <p className="text-[11px] text-muted-foreground">
                  Perubahan langsung propagate ke WHOIS PANDI (butuh 1–5 menit
                  untuk terlihat publik).
                </p>
                <Button type="submit" disabled={saving || hasErrors} className="gap-2">
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SuccessBanner({
  result,
  domain,
  onBack,
}: {
  result: UpdateResp;
  domain: string;
  onBack: () => void;
}) {
  // 3 varian message dari backend — decide banner tone.
  const drift = result.message.toLowerCase().includes("drift") || result.message.toLowerCase().includes("db only");
  return (
    <Card className={drift ? "border-amber-500/30" : "border-emerald-500/30"}>
      <CardContent className="space-y-3 p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className={drift ? "size-5 shrink-0 text-amber-600" : "size-5 shrink-0 text-emerald-600"} />
          <div className="flex-1">
            <h3 className="text-sm font-semibold">
              {drift ? "Tersimpan di DB (registry drift)" : "Berhasil di-update"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">{result.message}</p>
          </div>
        </div>
        <div className="rounded-md bg-muted/40 p-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Domain</span>
            <code className="font-mono">{domain}</code>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Nic Handle</span>
            <code className="font-mono">{result.nic_handle}</code>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Nama</span>
            <span>{result.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span>{result.email}</span>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={onBack} size="sm" className="gap-1.5">
            Kembali ke domain
            <ArrowLeft className="size-3.5 rotate-180" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
