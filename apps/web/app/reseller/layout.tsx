"use client";

// Reseller portal layout — auth gate + sidebar nav.
// Role gate: hanya reseller aktif yang boleh — kalau bukan, redirect ke /login
// atau /dashboard tergantung role.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Briefcase,
  ChevronLeft,
  Code2,
  LogOut,
  Receipt,
  Settings,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";
import { api, clearTokens, getAccessToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Me = {
  id: string;
  email: string;
  role: string;
  reseller_display_name: string;
  reseller_status: string;
};

const NAV = [
  { href: "/reseller/dashboard", label: "Dashboard", icon: Briefcase },
  { href: "/reseller/clients", label: "Klien", icon: Users },
  { href: "/reseller/team", label: "Tim (Agent)", icon: UsersRound },
  { href: "/reseller/wallet", label: "Wallet", icon: Wallet },
  { href: "/reseller/pricing", label: "Harga Jual", icon: Code2 },
  { href: "/reseller/invoices", label: "Invoice", icon: Receipt },
  { href: "/reseller/settings", label: "Pengaturan", icon: Settings },
] as const;

export default function ResellerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/login");
      return;
    }
    api<Me>("/api/v1/auth/me")
      .then((u) => {
        // Role gate: hanya reseller aktif yang boleh di sini.
        if (u.role !== "reseller") {
          // Redirect sesuai role
          if (u.role === "admin") router.replace("/admin");
          else if (u.role === "agent") router.replace("/agent/dashboard");
          else router.replace("/dashboard");
          return;
        }
        if (u.reseller_status !== "active") {
          // Backend should block login for non-active, but just in case:
          clearTokens();
          router.replace("/login");
          return;
        }
        setMe(u);
        setReady(true);
      })
      .catch(() => {
        clearTokens();
        router.replace("/login");
      });
  }, [router]);

  if (!ready || !me) {
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
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/">
                <ChevronLeft />
                <span className="hidden sm:inline">Beranda</span>
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-md bg-primary/10">
                <Briefcase className="size-4 text-primary" />
              </div>
              <div>
                <div className="text-sm font-semibold leading-tight">
                  {me.reseller_display_name}
                </div>
                <div className="text-[11px] text-muted-foreground">Reseller Portal</div>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut />
            Keluar
          </Button>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 md:grid-cols-[220px_1fr]">
        <aside className="md:sticky md:top-8 md:self-start">
          <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(item.href + "/");
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
