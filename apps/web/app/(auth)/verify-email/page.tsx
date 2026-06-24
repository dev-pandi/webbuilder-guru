"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AlertCircle, Loader2, Globe2, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

function VerifyInner() {
  const search = useSearchParams();
  const token = search.get("token") ?? "";
  const [state, setState] = useState<"loading" | "ok" | "err">("loading");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setState("err");
      setMsg("Token tidak ditemukan di URL.");
      return;
    }
    (async () => {
      try {
        await api<{ ok: boolean }>("/api/v1/auth/email/verify", {
          method: "POST",
          body: JSON.stringify({ token }),
          auth: false,
        });
        setState("ok");
      } catch (e) {
        setState("err");
        setMsg((e as Error).message);
      }
    })();
  }, [token]);

  if (state === "loading") {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
        <p className="text-sm">Memverifikasi email…</p>
      </div>
    );
  }

  if (state === "ok") {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle2 className="size-6 text-emerald-600" />
        </div>
        <p className="text-sm text-muted-foreground">
          Email Anda berhasil diverifikasi.
        </p>
        <Button asChild className="w-full">
          <Link href="/dashboard">Buka dashboard</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertCircle className="size-6 text-destructive" />
      </div>
      <p className="text-sm text-muted-foreground">{msg || "Verifikasi gagal."}</p>
      <Button asChild variant="outline" className="w-full">
        <Link href="/login">Kembali ke login</Link>
      </Button>
    </div>
  );
}

export default function VerifyEmailPage() {
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
          <h1 className="text-2xl font-bold tracking-tight">Verifikasi email</h1>
        </div>

        <div className="rounded-2xl border bg-card shadow-xl shadow-black/5 p-7">
          <Suspense fallback={<Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />}>
            <VerifyInner />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
