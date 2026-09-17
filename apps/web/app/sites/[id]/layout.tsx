"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Globe2,
  Home,
  ImageIcon,
  LayoutTemplate,
  Loader2,
  LogOut,
  Megaphone,
  Menu,
  MessagesSquare,
  MessageSquare,
  PenLine,
  Rocket,
  Settings,
  ShieldCheck,
  User,
  UserCircle,
} from "lucide-react";
import { toast } from "sonner";
import { api, clearTokens, getAccessToken } from "@/lib/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Site = { id: string; name: string; slug: string; status: string };

type Me = {
  id: string;
  email: string;
  name: string;
  role: string;
};

type NavItem = {
  href: (id: string) => string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
};

// Menu guru per mockup dashboard-guru. Menu di luar list ini di-hide sementara
// (route lama tetap accessible via URL langsung, tidak dihapus).
const NAV_ITEMS: NavItem[] = [
  { href: (id) => `/sites/${id}`, label: "Dashboard", icon: Home, exact: true },
  { href: (id) => `/sites/${id}/tulisan`, label: "Tulisan", icon: PenLine },
  { href: (id) => `/sites/${id}/forum`, label: "Forum Diskusi", icon: MessagesSquare },
  { href: (id) => `/sites/${id}/pembelajaran`, label: "Pembelajaran", icon: BookOpen },
  { href: (id) => `/sites/${id}/tanggapan`, label: "Tanggapan", icon: MessageSquare },
  { href: (id) => `/sites/${id}/promosi`, label: "Ruang Promosi", icon: Megaphone },
  { href: (id) => `/sites/${id}/assets`, label: "Aset", icon: ImageIcon },
  { href: (id) => `/sites/${id}/profil`, label: "Profil", icon: UserCircle },
  { href: (id) => `/sites/${id}/tampilan`, label: "Tampilan Website", icon: LayoutTemplate },
];

const TITLES: Record<string, { title: string; subtitle: string }> = {
  "": { title: "Dashboard", subtitle: "Kelola website pribadi Anda" },
  tulisan: { title: "Tulisan", subtitle: "Kelola artikel dan rubrik" },
  forum: { title: "Forum Diskusi", subtitle: "Kelola topik dan percakapan" },
  pembelajaran: { title: "Pembelajaran", subtitle: "Kelola materi pembelajaran" },
  tanggapan: { title: "Tanggapan", subtitle: "Moderasi komentar pembaca" },
  promosi: { title: "Ruang Promosi", subtitle: "Kelola banner 2:1" },
  assets: { title: "Aset", subtitle: "Kelola gambar & berkas untuk website" },
  profil: { title: "Profil", subtitle: "Kelola identitas profesional" },
  tampilan: { title: "Tampilan Website", subtitle: "Pilih template dan personalisasi" },
};

function pageMeta(pathname: string, sid: string) {
  const rest = pathname.replace(`/sites/${sid}`, "").replace(/^\//, "").split("/")[0] ?? "";
  return TITLES[rest] ?? TITLES[""];
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const [site, setSite] = useState<Site | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

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
    api<Me>("/api/v1/auth/me").then(setMe).catch(() => {});
  }, [params.id, router]);

  // Close drawer on route change.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const sid = params.id;
  const meta = pageMeta(pathname, sid);
  const isPublished = site?.status === "published";

  async function publish() {
    if (!site || publishing || isPublished) return;
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

  function logout() {
    clearTokens();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb]">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[250px] flex-col overflow-y-auto bg-gradient-to-b from-[#13243d] to-[#0d1b2e] px-4 py-6 text-slate-300 transition-transform lg:translate-x-0",
          drawerOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <Link href="/dashboard" className="flex items-center gap-3 px-2 pb-6">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[#ffbc85] to-[#e98555] shadow-lg shadow-orange-500/20">
            <BookOpen className="size-5 text-white" />
          </div>
          <div>
            <div className="text-[15px] font-bold text-white">Dashboard Guru</div>
            <div className="text-[11px] text-slate-400">Website Pribadi Guru</div>
          </div>
        </Link>

        <nav className="grid gap-1.5">
          {NAV_ITEMS.map((item) => {
            const href = item.href(sid);
            const active = item.exact ? pathname === href : pathname.startsWith(href);
            const Icon = item.icon;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                  active
                    ? "border border-white/10 bg-gradient-to-r from-orange-500/30 to-orange-500/10 text-white"
                    : "text-slate-300 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-2 border-t border-white/5 pt-5 text-[12px] leading-relaxed text-slate-400">
          <div className="px-2">
            <div className="font-semibold text-white">{site?.name ?? "Website Anda"}</div>
            <div className="text-slate-500">Kelola konten website pribadi Anda dari satu tempat.</div>
          </div>
          <Link
            href="/dashboard"
            className="flex w-full items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-[13px] font-bold text-slate-200 transition hover:bg-white/5 hover:text-white"
          >
            <ArrowLeft className="size-4" />
            Kembali ke Dashboard
          </Link>
        </div>
      </aside>

      {/* Drawer backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Main */}
      <div className="lg:ml-[250px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center gap-4 border-b border-slate-200 bg-white/90 px-6 backdrop-blur-md">
          <button
            onClick={() => setDrawerOpen((v) => !v)}
            className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700 lg:hidden"
            aria-label="Buka menu"
          >
            <Menu className="size-5" />
          </button>
          <div className="mr-auto">
            <div className="text-[17px] font-bold text-slate-900">{meta.title}</div>
            <div className="text-[12px] text-slate-500">{meta.subtitle}</div>
          </div>
          <button
            onClick={publish}
            disabled={!site || publishing || isPublished}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition",
              isPublished
                ? "cursor-default bg-emerald-50 text-emerald-700"
                : "bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60",
            )}
            title={isPublished ? "Situs sudah dipublikasikan" : undefined}
          >
            {publishing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Mempublikasikan…
              </>
            ) : isPublished ? (
              <>
                <CheckCircle2 className="size-4" />
                Dipublikasikan
              </>
            ) : (
              <>
                <Rocket className="size-4" />
                Publikasikan
              </>
            )}
          </button>
          {me && <UserMenu me={me} onLogout={logout} />}
        </header>
        <main className="mx-auto max-w-[1600px] px-6 py-7">{children}</main>
      </div>
    </div>
  );
}

// UserMenu — sama dengan dashboard header (apps/web/app/dashboard/layout.tsx).
// Trigger compact (avatar + email) → dropdown identitas + quick actions.
function UserMenu({ me, onLogout }: { me: Me; onLogout: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full border border-slate-200 bg-white pr-2 pl-1 py-1 text-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          aria-label="Menu akun"
        >
          <Avatar name={me.name} email={me.email} />
          <span className="hidden max-w-[180px] truncate text-xs font-medium text-slate-600 sm:inline">
            {me.email}
          </span>
          <ChevronDown className="size-3.5 text-slate-500" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <div className="flex items-center gap-3 px-2.5 pb-3 pt-2">
          <Avatar name={me.name} email={me.email} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{me.name || "Pengguna"}</div>
            <div className="truncate text-xs text-muted-foreground">{me.email}</div>
            {me.role === "admin" && (
              <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                <ShieldCheck className="size-2.5" />
                Admin
              </div>
            )}
          </div>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>Akun</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href="/settings/profile">
            <User className="size-4 text-muted-foreground" />
            Profil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings/domains">
            <Globe2 className="size-4 text-muted-foreground" />
            Domain Saya
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard">
            <Home className="size-4 text-muted-foreground" />
            Semua Situs
          </Link>
        </DropdownMenuItem>

        {me.role === "admin" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Admin</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href="/admin">
                <Settings className="size-4 text-muted-foreground" />
                Admin Panel
              </Link>
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onLogout}
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut className="size-4" />
          Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Avatar({
  name,
  email,
  size = "sm",
}: {
  name: string;
  email: string;
  size?: "sm" | "lg";
}) {
  const initials = getInitials(name, email);
  const cls = size === "lg" ? "size-10 text-sm" : "size-7 text-[11px]";
  return (
    <div
      className={
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-orange-600 font-bold text-white " +
        cls
      }
    >
      {initials}
    </div>
  );
}

function getInitials(name: string, email: string): string {
  const source = name.trim() || email;
  const parts = source.split(/[\s._@-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
