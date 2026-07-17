"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Settings, LogOut, Mail, Loader2 } from "lucide-react";
import { api, clearTokens, getAccessToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Me = {
  id: string;
  email: string;
  name: string;
  role: string;
  email_verified_at?: string | null;
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/login");
      return;
    }
    api<Me>("/api/v1/auth/me")
      .then(setMe)
      .catch(() => {
        clearTokens();
        router.replace("/login");
      })
      .finally(() => setReady(true));
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Memuat…
      </div>
    );
  }

  function logout() {
    clearTokens();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {me && !me.email_verified_at && <VerifyBanner />}
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="text-lg font-bold tracking-tight">
            Web<span className="text-primary">Builder</span>
          </Link>
          <div className="flex items-center gap-3">
            {me?.role === "admin" && (
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin">
                  <Settings />
                  <span className="hidden sm:inline">Admin Panel</span>
                </Link>
              </Button>
            )}
            <Link
              href="/settings/profile"
              className="hidden sm:inline-flex"
              title="Kelola profil akun"
            >
              <Badge
                variant="secondary"
                className="cursor-pointer transition-colors hover:bg-muted"
              >
                {me?.email}
              </Badge>
            </Link>
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut />
              Keluar
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}

function VerifyBanner() {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "err">("idle");
  const [msg, setMsg] = useState("");

  async function resend() {
    setState("sending");
    try {
      await api<{ ok: boolean }>("/api/v1/auth/email/resend", { method: "POST", body: "{}" });
      setState("sent");
    } catch (e) {
      setMsg((e as Error).message);
      setState("err");
    }
  }

  return (
    <div className="border-b border-amber-500/30 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-2 text-sm">
        <div className="flex items-center gap-2">
          <Mail className="size-4 shrink-0" />
          <span>
            Email Anda belum diverifikasi. Cek inbox untuk link verifikasi.
          </span>
        </div>
        <div>
          {state === "idle" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={resend}
              className="h-7 text-amber-900 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900/30"
            >
              Kirim ulang
            </Button>
          )}
          {state === "sending" && (
            <span className="flex items-center gap-1.5 text-xs">
              <Loader2 className="size-3 animate-spin" />
              Mengirim…
            </span>
          )}
          {state === "sent" && <span className="text-xs">Link sudah dikirim ulang.</span>}
          {state === "err" && <span className="text-xs">Gagal: {msg}</span>}
        </div>
      </div>
    </div>
  );
}
