"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  LayoutDashboard,
  CheckCircle2,
  ChevronDown,
  Code2,
  Cog,
  Download,
  FileEdit,
  FileText,
  Files,
  Gauge,
  Globe,
  GraduationCap,
  Image as ImageIcon,
  ClipboardList,
  Loader2,
  MessageSquare,
  MessagesSquare,
  Megaphone,
  Newspaper,
  Package,
  Palette,
  Rocket,
  SquarePen,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { api, clearTokens, getAccessToken } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Site = { id: string; name: string; slug: string; status: string };

type TabItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  guru?: boolean;
  // exact=true → active hanya kalau pathname === href (untuk Ringkasan yang
  // root path, tanpa exact akan cocok dengan semua sub-route).
  exact?: boolean;
};
type TabGroup = { key: string; label: string; icon: React.ElementType; items: TabItem[] };

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

  const sid = params.id;
  // Tabs primary — 3 aksi paling sering: Ringkasan + Editor + Halaman.
  // Ringkasan pakai `exact` supaya tidak match saat user di sub-route.
  const primaryTabs: TabItem[] = [
    { href: `/sites/${sid}`, label: "Ringkasan", icon: LayoutDashboard, exact: true },
    { href: `/sites/${sid}/editor`, label: "Editor", icon: SquarePen },
    { href: `/sites/${sid}/pages`, label: "Halaman", icon: Files },
  ];
  // Group dropdown — 4 cluster untuk sisanya. Fitur guru (spec §20) berkumpul
  // di satu grup supaya jelas ini domain "Rumah Digital Guru".
  const groups: TabGroup[] = [
    {
      key: "guru",
      label: "Guru",
      icon: GraduationCap,
      items: [
        { href: `/sites/${sid}/tulisan`, label: "Tulisan", icon: Newspaper, guru: true },
        // Forum Diskusi terpisah dari Tulisan (spec §16, §20) — rubric fixed,
        // tanggapan wajib aktif, UX diskusi berbeda dari tulisan rubrik biasa.
        { href: `/sites/${sid}/forum`, label: "Forum Diskusi", icon: MessagesSquare, guru: true },
        { href: `/sites/${sid}/tanggapan`, label: "Tanggapan", icon: MessageSquare, guru: true },
        { href: `/sites/${sid}/pembelajaran`, label: "Pembelajaran", icon: BookOpen, guru: true },
        { href: `/sites/${sid}/promosi`, label: "Ruang Promosi", icon: Megaphone, guru: true },
      ],
    },
    {
      key: "konten",
      label: "Konten",
      icon: FileEdit,
      items: [
        { href: `/sites/${sid}/products`, label: "Produk", icon: Package },
        { href: `/sites/${sid}/blog`, label: "Blog", icon: FileText },
        { href: `/sites/${sid}/forms`, label: "Formulir", icon: ClipboardList },
      ],
    },
    {
      key: "tampilan",
      label: "Tampilan",
      icon: Palette,
      items: [
        { href: `/sites/${sid}/theme`, label: "Tema", icon: Palette },
        { href: `/sites/${sid}/assets`, label: "Aset", icon: ImageIcon },
        { href: `/sites/${sid}/code`, label: "Kode Kustom", icon: Code2 },
      ],
    },
    {
      key: "pengaturan",
      label: "Pengaturan",
      icon: Cog,
      items: [
        { href: `/sites/${sid}/domains`, label: "Domain", icon: Globe },
        { href: `/sites/${sid}/members`, label: "Kolaborator", icon: Users },
        { href: `/sites/${sid}/analytics`, label: "Analitik", icon: BarChart3 },
        { href: `/sites/${sid}/usage`, label: "Usage", icon: Gauge },
        { href: `/sites/${sid}/export`, label: "Export", icon: Download },
      ],
    },
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
        <nav className="mx-auto flex max-w-6xl items-stretch gap-0.5 px-6">
          {/* Primary tabs — akses cepat tanpa dropdown */}
          {primaryTabs.map((t) => {
            const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
            const Icon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {t.label}
              </Link>
            );
          })}

          {/* Grouped dropdown menus */}
          {groups.map((g) => {
            const activeItem = g.items.find((it) => pathname.startsWith(it.href));
            const isActive = !!activeItem;
            const Icon = g.icon;
            return (
              <DropdownMenu key={g.key}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition focus:outline-none",
                      isActive
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-3.5" />
                    {g.label}
                    {isActive && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        {activeItem!.label}
                      </span>
                    )}
                    {g.key === "guru" && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                          isActive
                            ? "bg-violet-100 text-violet-700"
                            : "bg-violet-500/10 text-violet-600",
                        )}
                      >
                        Guru
                      </span>
                    )}
                    <ChevronDown className="size-3.5 opacity-60" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-52">
                  {g.items.map((it) => {
                    const itemActive = pathname.startsWith(it.href);
                    const ItemIcon = it.icon;
                    return (
                      <DropdownMenuItem key={it.href} asChild>
                        <Link
                          href={it.href}
                          className={cn(
                            "flex w-full cursor-pointer items-center gap-2.5",
                            itemActive && "bg-primary/10 text-primary focus:bg-primary/15",
                          )}
                        >
                          <ItemIcon
                            className={cn(
                              "size-4 shrink-0",
                              itemActive ? "text-primary" : "text-muted-foreground",
                            )}
                          />
                          <span className="flex-1">{it.label}</span>
                          {it.guru && (
                            <span className="rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-600">
                              Guru
                            </span>
                          )}
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}
        </nav>
      </header>
      <main className="px-6 py-6">{children}</main>
    </div>
  );
}
