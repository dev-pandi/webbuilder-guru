"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  BarChart3,
  Globe2,
  CheckCircle2,
  Clock,
  Archive,
  AlertCircle,
  Loader2,
  ArrowRight,
  ChevronLeft,
  Sparkles,
  FileText,
  HardDrive,
  ExternalLink,
} from "lucide-react";
import { api } from "@/lib/api";
import { fmtBytes, pct } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

type Site = {
  id: string;
  slug: string;
  name: string;
  status: "draft" | "published" | "archived";
  quota_max_pages: number;
  quota_max_storage_bytes: number;
  updated_at: string;
};

type SiteUsage = {
  pages: { used: number; max: number };
  storage_bytes: { used: number; max: number };
};

type Template = {
  slug: string;
  category: string;
  variant: string;
  name: string;
  description: string;
  theme: {
    colors?: { primary?: string; secondary?: string; bg?: string; fg?: string };
    font?: { heading?: string; body?: string };
    radius?: string;
  };
};

type Category = { key: string; label: string; description: string; emoji: string };
type Variant = { key: string; name: string; description: string };
type Meta = { categories: Category[]; variants: Variant[] };

const MAX_SITES = 5;

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; class: string }> = {
  published: {
    label: "Published",
    icon: CheckCircle2,
    class: "bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:text-emerald-400",
  },
  draft: {
    label: "Draft",
    icon: Clock,
    class: "bg-muted text-muted-foreground border-border",
  },
  archived: {
    label: "Archived",
    icon: Archive,
    class: "bg-muted text-muted-foreground border-border",
  },
};

export default function DashboardPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [usageMap, setUsageMap] = useState<Record<string, SiteUsage>>({});
  const [templates, setTemplates] = useState<Template[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loadingSites, setLoadingSites] = useState(true);

  async function refresh() {
    setLoadingSites(true);
    try {
      const list = await api<Site[]>("/api/v1/sites");
      setSites(list);
      const entries = await Promise.all(
        list.map(async (s) => {
          try {
            const u = await api<SiteUsage>(`/api/v1/sites/${s.id}/usage`);
            return [s.id, u] as const;
          } catch {
            return null;
          }
        }),
      );
      const m: Record<string, SiteUsage> = {};
      for (const e of entries) if (e) m[e[0]] = e[1];
      setUsageMap(m);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoadingSites(false);
    }
  }

  useEffect(() => {
    refresh();
    api<Template[]>("/api/v1/templates", { auth: false }).then(setTemplates).catch(() => {});
    api<Meta>("/api/v1/template-meta", { auth: false }).then(setMeta).catch(() => {});
  }, []);

  const canCreate = sites.length < MAX_SITES;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
              <Globe2 className="size-4 text-primary" />
            </div>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Dashboard
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Situs Saya</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {loadingSites ? "Memuat…" : `${sites.length} dari ${MAX_SITES} situs digunakan`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm shadow-sm sm:flex">
            <div className="flex gap-1">
              {Array.from({ length: MAX_SITES }).map((_, i) => (
                <div
                  key={i}
                  className={`h-2 w-2 rounded-full transition-colors ${
                    i < sites.length ? "bg-primary" : "bg-muted-foreground/20"
                  }`}
                />
              ))}
            </div>
            <span className="text-muted-foreground">
              <span className="font-semibold text-foreground">{MAX_SITES - sites.length}</span> slot tersisa
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={!canCreate}
              className="gap-2"
              asChild
            >
              <Link href="/sites/new-with-domain">
                <Globe2 className="size-4" />
                <span className="hidden sm:inline">Beli Domain + Buat</span>
                <span className="sm:hidden">Beli Domain</span>
              </Link>
            </Button>
            <Button
              onClick={() => setShowModal(true)}
              disabled={!canCreate}
              className="gap-2 shadow-sm"
            >
              <Plus className="size-4" />
              Buat Situs Baru
            </Button>
          </div>
        </div>
      </div>

      {err && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span><span className="font-medium">Gagal memuat:</span> {err}</span>
        </div>
      )}

      {/* Site grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loadingSites &&
          sites.length === 0 &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-5 space-y-4 animate-pulse">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="h-4 w-32 rounded bg-muted" />
                  <div className="h-3 w-20 rounded bg-muted" />
                </div>
                <div className="h-5 w-16 rounded-full bg-muted" />
              </div>
              <div className="space-y-2">
                <div className="h-2 w-full rounded bg-muted" />
                <div className="h-2 w-full rounded bg-muted" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="h-8 rounded-md bg-muted" />
                <div className="h-8 rounded-md bg-muted" />
                <div className="h-8 rounded-md bg-muted" />
              </div>
            </div>
          ))}

        {!loadingSites && sites.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
              <Sparkles className="size-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-sm font-semibold">Belum ada situs</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Buat situs pertama Anda dalam hitungan menit
            </p>
            <Button onClick={() => setShowModal(true)} className="mt-5 gap-2 shadow-sm">
              <Plus className="size-4" />
              Buat Situs Pertama
            </Button>
          </div>
        )}

        {sites.map((s) => {
          const cfg = STATUS_CONFIG[s.status] ?? STATUS_CONFIG.draft;
          const Icon = cfg.icon;
          const updated = new Date(s.updated_at).toLocaleDateString("id-ID", {
            day: "numeric",
            month: "short",
            year: "numeric",
          });
          return (
            <div
              key={s.id}
              className="group relative flex flex-col rounded-xl border bg-card shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 overflow-hidden"
            >
              {s.status === "published" && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-emerald-500" />
              )}

              <div className="p-5 flex-1 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold leading-tight">{s.name}</p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      <span className="text-muted-foreground/50">/</span>{s.slug}
                    </p>
                  </div>
                  <Badge className={`shrink-0 gap-1 text-xs ${cfg.class}`}>
                    <Icon className="size-3" />
                    {cfg.label}
                  </Badge>
                </div>

                <SiteUsageMini usage={usageMap[s.id]} />

                <p className="text-[11px] text-muted-foreground">Diperbarui {updated}</p>
              </div>

              <div className="border-t bg-muted/20 px-3 py-2.5 grid grid-cols-3 gap-1.5">
                <Button variant="default" size="sm" className="h-8 gap-1.5 text-xs" asChild>
                  <Link href={`/sites/${s.id}/editor`}>
                    <Pencil className="size-3.5" />
                    Edit
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
                  <Link href={`/sites/${s.id}/usage`}>
                    <BarChart3 className="size-3.5" />
                    Statistik
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
                  <Link href={`/sites/${s.id}/domains`}>
                    <Globe2 className="size-3.5" />
                    Domain
                  </Link>
                </Button>
              </div>
            </div>
          );
        })}

        {!loadingSites && sites.length > 0 && canCreate && (
          <button
            onClick={() => setShowModal(true)}
            className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/10 p-8 text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground hover:border-primary/50"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed">
              <Plus className="size-5" />
            </div>
            <span className="text-sm font-medium">Tambah Situs</span>
          </button>
        )}
      </div>

      <NewSiteDialog
        open={showModal}
        onOpenChange={setShowModal}
        templates={templates}
        meta={meta}
        onCreated={() => {
          setShowModal(false);
          refresh();
        }}
      />
    </div>
  );
}

function SiteUsageMini({ usage }: { usage: SiteUsage | undefined }) {
  if (!usage) {
    return (
      <div className="space-y-2">
        <div className="h-5 w-full rounded bg-muted animate-pulse" />
        <div className="h-5 w-full rounded bg-muted animate-pulse" />
      </div>
    );
  }
  return (
    <div className="space-y-2.5">
      <UsageRow
        icon={FileText}
        label="Halaman"
        usedText={`${usage.pages.used} / ${usage.pages.max}`}
        percent={pct(usage.pages.used, usage.pages.max)}
      />
      <UsageRow
        icon={HardDrive}
        label="Storage"
        usedText={`${fmtBytes(usage.storage_bytes.used)} / ${fmtBytes(usage.storage_bytes.max)}`}
        percent={pct(usage.storage_bytes.used, usage.storage_bytes.max)}
      />
    </div>
  );
}

function UsageRow({
  icon: Icon,
  label,
  usedText,
  percent,
}: {
  icon: React.ElementType;
  label: string;
  usedText: string;
  percent: number;
}) {
  const barColor =
    percent >= 90 ? "bg-red-500" : percent >= 70 ? "bg-amber-500" : "bg-emerald-500";
  const textColor =
    percent >= 90
      ? "text-red-600 dark:text-red-400"
      : percent >= 70
      ? "text-amber-600 dark:text-amber-400"
      : "";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 text-muted-foreground">
          <Icon className="size-3" />
          {label}
        </span>
        <span className={`tabular-nums font-medium ${textColor}`}>{usedText}</span>
      </div>
      <Progress value={percent} indicatorClassName={barColor} className="h-1.5 bg-muted" />
    </div>
  );
}

const STEPS = ["Kategori", "Tema", "Detail"];

function NewSiteDialog({
  open,
  onOpenChange,
  templates,
  meta,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  templates: Template[];
  meta: Meta | null;
  onCreated: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [category, setCategory] = useState<string | null>(null);
  const [tplSlug, setTplSlug] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep(1);
        setCategory(null);
        setTplSlug(null);
        setName("");
        setSlug("");
        setErr(null);
      }, 200);
    }
  }, [open]);

  const variantsForCategory = useMemo(
    () => templates.filter((t) => t.category === category),
    [templates, category],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!tplSlug) return;
    setErr(null);
    setLoading(true);
    try {
      await api(`/api/v1/sites/from-template/${tplSlug}`, {
        method: "POST",
        body: JSON.stringify({ slug, name }),
      });
      onCreated();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 py-5 border-b bg-muted/30">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-semibold">Buat Situs Baru</DialogTitle>
            <div className="flex items-center gap-1.5">
              {STEPS.map((label, i) => {
                const s = i + 1;
                const active = step === s;
                const done = step > s;
                return (
                  <div key={s} className="flex items-center gap-1.5">
                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                        done
                          ? "bg-primary text-primary-foreground"
                          : active
                          ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {done ? <CheckCircle2 className="size-3.5" /> : s}
                    </div>
                    <span
                      className={`hidden text-xs sm:inline ${
                        active ? "font-medium text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {label}
                    </span>
                    {i < STEPS.length - 1 && (
                      <div className={`h-px w-4 ${step > s ? "bg-primary" : "bg-border"}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {step === 1
              ? "Pilih jenis website yang ingin Anda buat"
              : step === 2
              ? "Pilih tampilan / tema untuk situs Anda"
              : "Isi nama dan alamat situs Anda"}
          </p>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto p-6">
          {step === 1 && (
            <CategoryStep
              categories={meta?.categories ?? []}
              onPick={(key) => { setCategory(key); setStep(2); }}
            />
          )}
          {step === 2 && category && (
            <VariantStep
              variants={variantsForCategory}
              onBack={() => setStep(1)}
              onPick={(s) => { setTplSlug(s); setStep(3); }}
            />
          )}
          {step === 3 && tplSlug && (
            <DetailsStep
              templates={templates}
              tplSlug={tplSlug}
              name={name}
              slug={slug}
              setName={setName}
              setSlug={setSlug}
              loading={loading}
              err={err}
              onBack={() => setStep(2)}
              onSubmit={submit}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CategoryStep({
  categories,
  onPick,
}: {
  categories: Category[];
  onPick: (key: string) => void;
}) {
  if (categories.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((c) => (
        <button
          key={c.key}
          onClick={() => onPick(c.key)}
          className="group rounded-xl border bg-card p-5 text-left transition-all hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5"
        >
          <div className="text-3xl">{c.emoji}</div>
          <div className="mt-3 text-sm font-semibold group-hover:text-primary transition-colors">
            {c.label}
          </div>
          <div className="mt-1 text-xs text-muted-foreground leading-relaxed">{c.description}</div>
          <div className="mt-3 flex items-center gap-1 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity font-medium">
            Pilih <ArrowRight className="size-3" />
          </div>
        </button>
      ))}
    </div>
  );
}

function VariantStep({
  variants,
  onBack,
  onPick,
}: {
  variants: Template[];
  onBack: () => void;
  onPick: (slug: string) => void;
}) {
  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="size-4" />
        Ganti kategori
      </button>
      <div className="grid gap-3 sm:grid-cols-3">
        {variants.map((t) => (
          <button
            key={t.slug}
            onClick={() => onPick(t.slug)}
            className="group rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5"
          >
            <ThemeSwatchPreview theme={t.theme} />
            <div className="mt-3 text-sm font-semibold group-hover:text-primary transition-colors">
              {t.name.split("—")[1]?.trim() ?? t.name}
            </div>
            <div className="mt-1 text-xs text-muted-foreground leading-relaxed">{t.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ThemeSwatchPreview({ theme }: { theme: Template["theme"] }) {
  const c = theme.colors ?? {};
  const primary = c.primary ?? "#2563eb";
  const secondary = c.secondary ?? "#0ea5e9";
  const bg = c.bg ?? "#ffffff";
  const fg = c.fg ?? "#0f172a";
  const heading = theme.font?.heading ?? "Inter";
  const radius = theme.radius ?? "0.5rem";
  return (
    <div
      className="overflow-hidden border shadow-sm"
      style={{ background: bg, color: fg, borderRadius: radius }}
    >
      <div className="px-3 pt-3" style={{ fontFamily: heading }}>
        <div className="text-xs font-bold leading-tight">Aa — Heading</div>
        <div className="mt-1 text-[10px] opacity-60">Body text sample.</div>
      </div>
      <div className="mt-2 flex gap-1.5 px-3 pb-3">
        <span className="h-5 flex-1 opacity-90" style={{ background: primary, borderRadius: radius }} />
        <span className="h-5 flex-1 opacity-90" style={{ background: secondary, borderRadius: radius }} />
      </div>
    </div>
  );
}

function DetailsStep({
  templates,
  tplSlug,
  name,
  slug,
  setName,
  setSlug,
  loading,
  err,
  onBack,
  onSubmit,
}: {
  templates: Template[];
  tplSlug: string;
  name: string;
  slug: string;
  setName: (s: string) => void;
  setSlug: (s: string) => void;
  loading: boolean;
  err: string | null;
  onBack: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const tpl = templates.find((t) => t.slug === tplSlug);
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="size-4" />
        Ganti tema
      </button>

      {tpl && (
        <div className="flex items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3">
          <div className="w-14 shrink-0">
            <ThemeSwatchPreview theme={tpl.theme} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Tema terpilih</p>
            <p className="truncate text-sm font-semibold">{tpl.name}</p>
            {tpl.description && (
              <p className="truncate text-xs text-muted-foreground">{tpl.description}</p>
            )}
          </div>
          <CheckCircle2 className="ml-auto shrink-0 size-4 text-emerald-500" />
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="site-name" className="text-sm font-medium">
            Nama Situs
          </Label>
          <Input
            id="site-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sekolah Saya"
            className="h-10"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="site-slug" className="text-sm font-medium">
            Slug
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              (huruf kecil, angka, tanda hubung)
            </span>
          </Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">/</span>
            <Input
              id="site-slug"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder="sekolah-saya"
              className="h-10 pl-6 font-mono"
            />
          </div>
          {slug && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ExternalLink className="size-3" />
              Dapat diakses di:{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">
                {slug}.localhost
              </code>
            </div>
          )}
        </div>
      </div>

      {err && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          {err}
        </div>
      )}

      <DialogFooter className="pt-2">
        <Button type="submit" disabled={loading} className="gap-2 shadow-sm">
          {loading ? (
            <><Loader2 className="size-4 animate-spin" /> Membuat…</>
          ) : (
            <><Sparkles className="size-4" /> Buat Situs</>
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}
