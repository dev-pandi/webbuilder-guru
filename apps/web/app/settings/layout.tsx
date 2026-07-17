"use client";

// Settings gate — same guard pattern as dashboard/layout.tsx (auth required,
// bounce to /login on 401). We don't duplicate the dashboard chrome here
// because settings pages already sit under the top-level nav via the header.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft, LogOut } from "lucide-react";
import { api, clearTokens, getAccessToken } from "@/lib/api";
import { Button } from "@/components/ui/button";

type Me = { id: string; email: string; role: string };

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/login");
      return;
    }
    api<Me>("/api/v1/auth/me")
      .then(() => setReady(true))
      .catch(() => {
        clearTokens();
        router.replace("/login");
      });
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
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard">
                <ChevronLeft />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>
            </Button>
            <span className="text-lg font-semibold">Pengaturan</span>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut />
            Keluar
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">{children}</main>
    </div>
  );
}
