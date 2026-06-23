"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, clearTokens, getAccessToken } from "@/lib/api";

type Site = { id: string; name: string; slug: string; status: string };

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const [site, setSite] = useState<Site | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/login");
      return;
    }
    api<Site>(`/api/v1/sites/${params.id}`)
      .then(setSite)
      .catch(() => {
        clearTokens();
        router.replace("/login");
      });
  }, [params.id, router]);

  const tabs = [
    { href: `/sites/${params.id}/editor`, label: "Editor" },
    { href: `/sites/${params.id}/pages`, label: "Halaman" },
    { href: `/sites/${params.id}/theme`, label: "Tema" },
    { href: `/sites/${params.id}/assets`, label: "Aset" },
    { href: `/sites/${params.id}/domains`, label: "Domain" },
    { href: `/sites/${params.id}/export`, label: "Export" },
  ];

  async function publish() {
    if (!site) return;
    try {
      const updated = await api<Site>(`/api/v1/sites/${site.id}/publish`, { method: "POST" });
      setSite(updated);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-slate-500 hover:underline">← Dashboard</Link>
            {site && (
              <>
                <span className="text-slate-300">/</span>
                <span className="font-semibold">{site.name}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {site.status}
                </span>
              </>
            )}
          </div>
          <button
            onClick={publish}
            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Publikasikan
          </button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 px-6">
          {tabs.map((t) => {
            const active = pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`border-b-2 px-3 py-2 text-sm ${
                  active ? "border-brand-600 text-brand-600" : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6">{children}</main>
    </div>
  );
}
