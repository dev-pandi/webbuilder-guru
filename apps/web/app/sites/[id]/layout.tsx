"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Rocket } from "lucide-react";
import { toast } from "sonner";
import { api, clearTokens, getAccessToken } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Site = { id: string; name: string; slug: string; status: string };

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const [site, setSite] = useState<Site | null>(null);
  const [publishing, setPublishing] = useState(false);

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

  // Menu guru (spec §20) di-mark dengan `guru: true` supaya tampil pill kecil
  // "Guru" di sidebar. Semua site tetap bisa akses menu ini — fitur backend
  // sudah tenant-safe. Renderer akan menampilkan konten sesuai template.
  const tabs = [
    { href: `/sites/${params.id}/editor`, label: "Editor" },
    { href: `/sites/${params.id}/pages`, label: "Halaman" },
    { href: `/sites/${params.id}/tulisan`, label: "Tulisan", guru: true },
    { href: `/sites/${params.id}/tanggapan`, label: "Tanggapan", guru: true },
    { href: `/sites/${params.id}/pembelajaran`, label: "Pembelajaran", guru: true },
    { href: `/sites/${params.id}/promosi`, label: "Ruang Promosi", guru: true },
    { href: `/sites/${params.id}/products`, label: "Produk" },
    { href: `/sites/${params.id}/blog`, label: "Blog" },
    { href: `/sites/${params.id}/forms`, label: "Formulir" },
    { href: `/sites/${params.id}/theme`, label: "Tema" },
    { href: `/sites/${params.id}/assets`, label: "Aset" },
    { href: `/sites/${params.id}/domains`, label: "Domain" },
    { href: `/sites/${params.id}/analytics`, label: "Analitik" },
    { href: `/sites/${params.id}/code`, label: "Kode Kustom" },
    { href: `/sites/${params.id}/members`, label: "Kolaborator" },
    { href: `/sites/${params.id}/usage`, label: "Usage" },
    { href: `/sites/${params.id}/export`, label: "Export" },
  ];

  async function publish() {
    if (!site || publishing || site.status === "published") return;
    setPublishing(true);
    try {
      const updated = await api<Site>(`/api/v1/sites/${site.id}/publish`, { method: "POST" });
      setSite(updated);
      toast.success("Situs berhasil dipublikasikan");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPublishing(false);
    }
  }

  const isPublished = site?.status === "published";

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard">
                <ArrowLeft />
                Dashboard
              </Link>
            </Button>
            {site && (
              <>
                <span className="text-muted-foreground">/</span>
                <span className="font-semibold">{site.name}</span>
                <Badge variant={site.status === "published" ? "success" : "secondary"}>
                  {site.status}
                </Badge>
              </>
            )}
          </div>
          <Button
            onClick={publish}
            disabled={!site || publishing || isPublished}
            className={cn(
              !isPublished && "bg-emerald-600 text-white hover:bg-emerald-700",
              isPublished && "cursor-default bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10",
            )}
            title={isPublished ? "Situs sudah dipublikasikan" : undefined}
          >
            {publishing ? (
              <>
                <Loader2 className="animate-spin" />
                Mempublikasikan…
              </>
            ) : isPublished ? (
              <>
                <CheckCircle2 />
                Dipublikasikan
              </>
            ) : (
              <>
                <Rocket />
                Publikasikan
              </>
            )}
          </Button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-6">
          {tabs.map((t) => {
            const active = pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                {t.guru && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                      active
                        ? "bg-violet-100 text-violet-700"
                        : "bg-violet-500/10 text-violet-600",
                    )}
                  >
                    Guru
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="px-6 py-6">{children}</main>
    </div>
  );
}
