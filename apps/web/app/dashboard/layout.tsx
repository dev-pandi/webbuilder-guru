"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, clearTokens, getAccessToken } from "@/lib/api";

type Me = { id: string; email: string; name: string; role: string };

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
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Memuat…</div>;
  }

  function logout() {
    clearTokens();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="text-lg font-bold tracking-tight">
            Web<span className="text-brand-600">Builder</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            {me?.role === "admin" && (
              <Link
                href="/admin"
                className="rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-200"
              >
                ⚙ Admin Panel
              </Link>
            )}
            <span className="text-slate-500">{me?.email}</span>
            <button onClick={logout} className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-100">
              Keluar
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
