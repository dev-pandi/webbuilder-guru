"use client";

// Settings gate — auth check + sidebar nav (Profil, Domain). Header punya
// tombol back ke Dashboard + Logout; sidebar sticky di desktop, horizontal
// scroll di mobile.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft, LogOut, User, Globe2, Files, Receipt } from "lucide-react";
import { api, clearTokens, getAccessToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Me = { id: string; email: string; role: string };

const NAV = [
  { href: "/settings/profile", label: "Profil", icon: User },
  { href: "/settings/domains", label: "Domain", icon: Globe2 },
  { href: "/settings/invoices", label: "Invoice", icon: Receipt },
  { href: "/settings/documents", label: "Dokumen", icon: Files },
] as const;

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
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
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
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
      <div className="mx-auto grid max-w-5xl gap-6 px-6 py-8 md:grid-cols-[200px_1fr]">
        <aside className="md:sticky md:top-8 md:self-start">
          <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            {NAV.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
