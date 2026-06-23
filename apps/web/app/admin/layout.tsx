"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api, clearTokens, getAccessToken } from "@/lib/api";

type Me = { id: string; email: string; name: string; role: string };

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
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Memuat…</div>;
  }
  if (!me) return null;

  const nav = [
    { href: "/admin", label: "Overview", icon: "📊" },
    { href: "/admin/users", label: "User", icon: "👥" },
    { href: "/admin/sites", label: "Situs", icon: "🌐" },
  ];

  function logout() {
    clearTokens();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-slate-900 text-slate-100 md:flex">
        <div className="border-b border-slate-800 px-5 py-4">
          <Link href="/admin" className="text-lg font-bold tracking-tight">
            Web<span className="text-brand-500">Builder</span>
          </Link>
          <div className="mt-0.5 text-[10px] uppercase tracking-wider text-amber-400">Admin Panel</div>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {nav.map((n) => {
            const active = n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition ${
                  active ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <span>{n.icon}</span>
                <span>{n.label}</span>
              </Link>
            );
          })}
          <div className="my-2 border-t border-slate-800" />
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <span>↩</span>
            <span>Kembali ke Dashboard</span>
          </Link>
        </nav>
        <div className="border-t border-slate-800 p-3 text-xs">
          <div className="text-slate-400">Logged in as</div>
          <div className="truncate font-medium">{me.email}</div>
          <button
            onClick={logout}
            className="mt-2 w-full rounded border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800"
          >
            Keluar
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-x-auto px-8 py-8">{children}</main>
    </div>
  );
}
