"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Settings, LogOut } from "lucide-react";
import { api, clearTokens, getAccessToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
            <Badge variant="secondary" className="hidden sm:inline-flex">
              {me?.email}
            </Badge>
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
