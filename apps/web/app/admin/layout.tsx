"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, Users, Globe2, ArrowLeft, LogOut } from "lucide-react";
import { api, clearTokens, getAccessToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Me = { id: string; email: string; name: string; role: string };

const nav = [
  { href: "/admin", label: "Overview", icon: BarChart3 },
  { href: "/admin/users", label: "User", icon: Users },
  { href: "/admin/sites", label: "Situs", icon: Globe2 },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
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
        if (u.role !== "admin") {
          router.replace("/dashboard");
          return;
        }
        setMe(u);
      })
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
  if (!me) return null;

  function logout() {
    clearTokens();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-slate-950 text-slate-100 md:flex">
        <div className="border-b border-slate-800 px-5 py-4">
          <Link href="/admin" className="text-lg font-bold tracking-tight">
            Web<span className="text-primary">Builder</span>
          </Link>
          <Badge variant="warning" className="mt-1">
            Admin Panel
          </Badge>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {nav.map((n) => {
            const active = n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition",
                  active
                    ? "bg-slate-800 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white",
                )}
              >
                <n.icon className="size-4" />
                <span>{n.label}</span>
              </Link>
            );
          })}
          <Separator className="my-2 bg-slate-800" />
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <ArrowLeft className="size-4" />
            Kembali ke Dashboard
          </Link>
        </nav>
        <div className="border-t border-slate-800 p-3 text-xs">
          <div className="text-slate-400">Logged in as</div>
          <div className="truncate font-medium">{me.email}</div>
          <Button
            variant="outline"
            size="sm"
            onClick={logout}
            className="mt-2 w-full border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <LogOut />
            Keluar
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-x-auto px-8 py-8">{children}</main>
    </div>
  );
}
