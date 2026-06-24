"use client";

import Link from "next/link";
import { useState } from "react";
import { Mail, AlertCircle, Loader2, ArrowRight, Globe2, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await api<{ ok: boolean; message: string }>("/api/v1/auth/password/forgot", {
        method: "POST",
        body: JSON.stringify({ email }),
        auth: false,
      });
      setSent(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 -right-40 h-[600px] w-[600px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-[600px] w-[600px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/20">
            <Globe2 className="size-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Lupa password?</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Masukkan email Anda. Kami akan kirim link reset.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border bg-card shadow-xl shadow-black/5 p-7">
          {sent ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="size-6 text-emerald-600" />
              </div>
              <p className="text-sm text-muted-foreground">
                Jika email <span className="font-medium text-foreground">{email}</span> terdaftar,
                link reset password sudah dikirim. Cek inbox (dan folder spam) Anda.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link href="/login">Kembali ke login</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="nama@email.com"
                    className="pl-9 h-10"
                  />
                </div>
              </div>

              {err && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{err}</span>
                </div>
              )}

              <Button type="submit" className="mt-1 w-full h-10 gap-2 font-medium shadow-sm" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Mengirim…
                  </>
                ) : (
                  <>
                    Kirim link reset
                    <ArrowRight className="size-4" />
                  </>
                )}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                <Link href="/login" className="font-medium underline underline-offset-4 hover:text-primary">
                  Kembali ke login
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
