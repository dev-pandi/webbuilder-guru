"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, BarChart3, Globe2 } from "lucide-react";
import { api } from "@/lib/api";
import { fmtBytes, pct } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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

export default function DashboardPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [usageMap, setUsageMap] = useState<Record<string, SiteUsage>>({});
  const [templates, setTemplates] = useState<Template[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
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
    }
  }

  useEffect(() => {
    refresh();
    api<Template[]>("/api/v1/templates", { auth: false }).then(setTemplates).catch(() => {});
    api<Meta>("/api/v1/template-meta", { auth: false }).then(setMeta).catch(() => {});
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Situs Saya</h1>
          <p className="text-sm text-muted-foreground">{sites.length} dari 5 situs aktif.</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus />
          Buat Situs Baru
        </Button>
      </div>

      {err && <p className="mt-4 text-sm text-destructive">{err}</p>}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sites.length === 0 && (
          <Card className="col-span-full border-dashed">
            <CardContent className="py-10 text-center text-muted-foreground">
              Belum ada situs. Klik “Buat Situs Baru” untuk mulai.
            </CardContent>
          </Card>
        )}
        {sites.map((s) => (
          <Card key={s.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">{s.name}</CardTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">/{s.slug}</p>
                </div>
                <Badge variant={s.status === "published" ? "success" : "secondary"}>
                  {s.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <SiteUsageMini usage={usageMap[s.id]} />
              <div className="grid grid-cols-3 gap-2">
                <Button variant="default" size="sm" asChild>
                  <Link href={`/sites/${s.id}/editor`}>
                    <Pencil />
                    Edit
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/sites/${s.id}/usage`}>
                    <BarChart3 />
                    Usage
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/sites/${s.id}/domains`}>
                    <Globe2 />
                    Domain
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
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

// ---- Inline usage display ----

function SiteUsageMini({ usage }: { usage: SiteUsage | undefined }) {
  if (!usage) {
    return <div className="h-12 animate-pulse rounded-md bg-muted/50" />;
  }
  return (
    <div className="space-y-2 text-xs">
      <UsageRow
        label="Halaman"
        usedText={`${usage.pages.used} / ${usage.pages.max}`}
        percent={pct(usage.pages.used, usage.pages.max)}
      />
      <UsageRow
        label="Storage"
        usedText={`${fmtBytes(usage.storage_bytes.used)} / ${fmtBytes(usage.storage_bytes.max)}`}
        percent={pct(usage.storage_bytes.used, usage.storage_bytes.max)}
      />
    </div>
  );
}

function UsageRow({
  label,
  usedText,
  percent,
}: {
  label: string;
  usedText: string;
  percent: number;
}) {
  const indicator =
    percent >= 90 ? "bg-destructive" : percent >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div>
      <div className="flex items-center justify-between text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{usedText}</span>
      </div>
      <Progress value={percent} indicatorClassName={indicator} className="mt-1 h-1.5" />
    </div>
  );
}

// ---- Multi-step Dialog: category → variant → name/slug ----

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

  // Reset when dialog closes
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
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Buat Situs Baru</DialogTitle>
          <DialogDescription>
            Langkah {step} dari 3:{" "}
            {step === 1 ? "Pilih kategori" : step === 2 ? "Pilih tema" : "Detail situs"}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          {step === 1 && (
            <CategoryStep
              categories={meta?.categories ?? []}
              onPick={(key) => {
                setCategory(key);
                setStep(2);
              }}
            />
          )}
          {step === 2 && category && (
            <VariantStep
              variants={variantsForCategory}
              onBack={() => setStep(1)}
              onPick={(slug) => {
                setTplSlug(slug);
                setStep(3);
              }}
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
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((c) => (
        <button
          key={c.key}
          onClick={() => onPick(c.key)}
          className="rounded-lg border bg-background p-5 text-left transition hover:border-primary hover:shadow-md"
        >
          <div className="text-3xl">{c.emoji}</div>
          <div className="mt-3 font-semibold">{c.label}</div>
          <div className="mt-1 text-xs text-muted-foreground">{c.description}</div>
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
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-3">
        ← Ganti kategori
      </Button>
      <div className="grid gap-3 sm:grid-cols-3">
        {variants.map((t) => (
          <button
            key={t.slug}
            onClick={() => onPick(t.slug)}
            className="rounded-lg border bg-background p-4 text-left transition hover:border-primary hover:shadow-md"
          >
            <ThemeSwatchPreview theme={t.theme} />
            <div className="mt-3 font-semibold">{t.name.split("—")[1]?.trim() ?? t.name}</div>
            <div className="mt-1 text-xs text-muted-foreground">{t.description}</div>
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
      className="overflow-hidden border"
      style={{ background: bg, color: fg, borderRadius: radius }}
    >
      <div className="px-3 pt-3" style={{ fontFamily: heading }}>
        <div className="text-xs font-bold leading-tight">Aa — Heading</div>
        <div className="mt-1 text-[10px] opacity-70">Body text sample.</div>
      </div>
      <div className="mt-2 flex gap-1 px-3 pb-3">
        <span className="h-6 flex-1" style={{ background: primary, borderRadius: radius }} />
        <span className="h-6 flex-1" style={{ background: secondary, borderRadius: radius }} />
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
    <form onSubmit={onSubmit}>
      <Button type="button" variant="ghost" size="sm" onClick={onBack} className="mb-3">
        ← Ganti tema
      </Button>
      <Card className="mb-4 bg-muted/50">
        <CardContent className="p-3 text-sm">
          <span className="text-muted-foreground">Tema terpilih:</span>{" "}
          <span className="font-medium">{tpl?.name ?? tplSlug}</span>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Nama Situs</Label>
          <Input
            id="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sekolah Saya"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="slug">
            Slug{" "}
            <span className="text-xs font-normal text-muted-foreground">
              (huruf kecil, angka, tanda hubung)
            </span>
          </Label>
          <Input
            id="slug"
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            placeholder="sekolah-saya"
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Bisa diakses di: <code>{slug || "<slug>"}.localhost</code>
          </p>
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
      </div>

      <DialogFooter className="mt-6">
        <Button type="submit" disabled={loading}>
          {loading ? "Membuat..." : "Buat Situs"}
        </Button>
      </DialogFooter>
    </form>
  );
}
