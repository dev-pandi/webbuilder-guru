"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Palette, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { FontPicker } from "@/components/FontPicker";
import { cn } from "@/lib/utils";

type Site = {
  id: string;
  name: string;
  template_id: string | null;
  theme: ThemeJson | null;
};

type ThemeJson = {
  colors?: { primary?: string; secondary?: string; bg?: string; fg?: string };
  font?: { heading?: string; body?: string };
  radius?: string;
};

type Template = {
  id: string;
  slug: string;
  category: string;
  variant: string;
  name: string;
  description: string;
  theme: ThemeJson;
};

type Category = { key: string; label: string; description: string; emoji: string };
type Meta = { categories: Category[]; variants: { key: string; name: string; description: string }[] };

type ApplyMode = "theme" | "append" | "replace";

type ApplyResult = {
  mode: ApplyMode;
  template_slug: string;
  pages_inserted: number;
  pages_skipped: number;
  pages_removed: number;
};

export default function ThemePage() {
  const params = useParams<{ id: string }>();
  const [site, setSite] = useState<Site | null>(null);
  const [theme, setTheme] = useState<ThemeJson>({
    colors: { primary: "#2563eb", secondary: "#0ea5e9", bg: "#ffffff", fg: "#0f172a" },
    font: { heading: "Inter", body: "Inter" },
    radius: "0.75rem",
  });
  const [templates, setTemplates] = useState<Template[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [saving, setSaving] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);

  async function loadSite() {
    const s = await api<Site>(`/api/v1/sites/${params.id}`);
    setSite(s);
    if (s.theme && Object.keys(s.theme).length > 0) setTheme(s.theme);
  }

  useEffect(() => {
    loadSite().catch((e) => toast.error((e as Error).message));
    api<Template[]>("/api/v1/templates", { auth: false }).then(setTemplates).catch(() => {});
    api<Meta>("/api/v1/template-meta", { auth: false }).then(setMeta).catch(() => {});
  }, [params.id]);

  const currentTemplate = useMemo(
    () => templates.find((t) => t.id === site?.template_id) ?? null,
    [templates, site?.template_id],
  );

  async function save() {
    setSaving(true);
    try {
      await api(`/api/v1/sites/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({ theme }),
      });
      toast.success("Tema tersimpan");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function onTemplateApplied(res: ApplyResult, picked: Template) {
    setSwitchOpen(false);
    // refresh local state from server so theme + template badge update
    await loadSite();
    if (res.mode === "theme") {
      toast.success(`Tema "${picked.name}" diterapkan`);
    } else if (res.mode === "append") {
      const skip = res.pages_skipped ? `, ${res.pages_skipped} dilewati (slug sudah ada)` : "";
      toast.success(`${res.pages_inserted} halaman dari "${picked.name}" disisipkan${skip}`);
    } else {
      toast.success(
        `${res.pages_removed} halaman lama dihapus, ${res.pages_inserted} halaman dari "${picked.name}" dibuat`,
      );
    }
  }

  function color(name: "primary" | "secondary" | "bg" | "fg") {
    return theme.colors?.[name] ?? "#000000";
  }

  return (
    <div className="space-y-6">
      {/* Template section */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Template Saat Ini</CardTitle>
            <CardDescription className="mt-1">
              {currentTemplate ? (
                <span>
                  {currentTemplate.name}{" "}
                  <Badge variant="secondary" className="ml-1">
                    {currentTemplate.variant}
                  </Badge>
                </span>
              ) : (
                "Situs ini belum terhubung ke template tertentu."
              )}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setSwitchOpen(true)}>
            <Sparkles />
            Ganti Template
          </Button>
        </CardHeader>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Palette className="size-4" />
              Edit Tema
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(["primary", "secondary", "bg", "fg"] as const).map((k) => (
              <div key={k} className="flex items-center justify-between">
                <Label className="capitalize">{k}</Label>
                <input
                  type="color"
                  value={color(k)}
                  onChange={(e) =>
                    setTheme((t) => ({
                      ...t,
                      colors: { ...(t.colors ?? {}), [k]: e.target.value },
                    }))
                  }
                  className="h-9 w-16 rounded border border-input"
                />
              </div>
            ))}

            <Separator />

            <div className="space-y-3">
              <Label>Font</Label>
              <FontPicker
                label="Heading"
                value={theme.font?.heading ?? ""}
                onChange={(name) =>
                  setTheme((t) => ({ ...t, font: { ...(t.font ?? {}), heading: name } }))
                }
              />
              <FontPicker
                label="Body"
                value={theme.font?.body ?? ""}
                onChange={(name) =>
                  setTheme((t) => ({ ...t, font: { ...(t.font ?? {}), body: name } }))
                }
              />
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label htmlFor="radius">Radius</Label>
              <Input
                id="radius"
                value={theme.radius ?? ""}
                onChange={(e) => setTheme((t) => ({ ...t, radius: e.target.value }))}
                placeholder="0.5rem"
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={save} disabled={saving}>
                {saving ? "Menyimpan…" : "Simpan"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card
          className="p-6"
          style={{ background: color("bg"), color: color("fg"), borderRadius: theme.radius }}
        >
          <h2 className="text-2xl font-bold" style={{ fontFamily: theme.font?.heading }}>
            Preview Tema
          </h2>
          <p className="mt-2" style={{ fontFamily: theme.font?.body }}>
            Ini contoh teks body. Tombol primer dan sekunder tampil di bawah.
          </p>
          <div className="mt-4 flex gap-3">
            <span
              className="rounded px-3 py-1.5 text-white"
              style={{ background: color("primary"), borderRadius: theme.radius }}
            >
              Primer
            </span>
            <span
              className="rounded px-3 py-1.5 text-white"
              style={{ background: color("secondary"), borderRadius: theme.radius }}
            >
              Sekunder
            </span>
          </div>
        </Card>
      </div>

      <SwitchTemplateDialog
        open={switchOpen}
        onOpenChange={setSwitchOpen}
        siteId={params.id}
        currentTemplateId={site?.template_id ?? null}
        templates={templates}
        meta={meta}
        onApplied={onTemplateApplied}
      />
    </div>
  );
}

// ----- Switch Template Dialog: category → variant → mode -----

function SwitchTemplateDialog({
  open,
  onOpenChange,
  siteId,
  currentTemplateId,
  templates,
  meta,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  siteId: string;
  currentTemplateId: string | null;
  templates: Template[];
  meta: Meta | null;
  onApplied: (r: ApplyResult, picked: Template) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [category, setCategory] = useState<string | null>(null);
  const [picked, setPicked] = useState<Template | null>(null);
  const [mode, setMode] = useState<ApplyMode>("theme");
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open) {
      const id = setTimeout(() => {
        setStep(1);
        setCategory(null);
        setPicked(null);
        setMode("theme");
      }, 200);
      return () => clearTimeout(id);
    }
  }, [open]);

  const variantsForCategory = useMemo(
    () => templates.filter((t) => t.category === category),
    [templates, category],
  );

  async function apply() {
    if (!picked) return;
    if (mode === "replace") {
      if (
        !confirm(
          "Mode Reset Total akan MENGHAPUS SEMUA halaman yang ada dan menggantinya dengan halaman default dari template baru. Versi terbaru disnapshot, tapi disarankan export dulu kalau ragu. Lanjutkan?",
        )
      )
        return;
    }
    setApplying(true);
    try {
      const r = await api<ApplyResult>(`/api/v1/sites/${siteId}/apply-template`, {
        method: "POST",
        body: JSON.stringify({ slug: picked.slug, mode }),
      });
      onApplied(r, picked);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setApplying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Ganti Template</DialogTitle>
          <DialogDescription>
            Langkah {step} dari 3:{" "}
            {step === 1
              ? "Pilih kategori baru"
              : step === 2
                ? "Pilih tema"
                : "Pilih cara penerapan"}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          {step === 1 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(meta?.categories ?? []).map((c) => (
                <button
                  key={c.key}
                  onClick={() => {
                    setCategory(c.key);
                    setStep(2);
                  }}
                  className="rounded-lg border bg-background p-5 text-left transition hover:border-primary hover:shadow-md"
                >
                  <div className="text-3xl">{c.emoji}</div>
                  <div className="mt-3 font-semibold">{c.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{c.description}</div>
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div>
              <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="mb-3">
                <ArrowLeft />
                Ganti kategori
              </Button>
              <div className="grid gap-3 sm:grid-cols-3">
                {variantsForCategory.map((t) => {
                  const isCurrent = t.id === currentTemplateId;
                  return (
                    <button
                      key={t.slug}
                      onClick={() => {
                        setPicked(t);
                        setStep(3);
                      }}
                      className={cn(
                        "rounded-lg border bg-background p-4 text-left transition hover:border-primary hover:shadow-md",
                        isCurrent && "border-primary ring-2 ring-primary/30",
                      )}
                    >
                      <ThemeSwatchPreview theme={t.theme} />
                      <div className="mt-3 flex items-center justify-between">
                        <span className="font-semibold">
                          {t.name.split("—")[1]?.trim() ?? t.name}
                        </span>
                        {isCurrent && (
                          <Badge variant="secondary" className="text-[10px]">
                            saat ini
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{t.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 3 && picked && (
            <div>
              <Button variant="ghost" size="sm" onClick={() => setStep(2)} className="mb-3">
                <ArrowLeft />
                Ganti tema
              </Button>

              <Card className="mb-4 bg-muted/50">
                <CardContent className="p-3 text-sm">
                  <span className="text-muted-foreground">Tema terpilih:</span>{" "}
                  <span className="font-medium">{picked.name}</span>
                </CardContent>
              </Card>

              <p className="mb-2 text-sm font-medium">Bagaimana cara menerapkan?</p>
              <div className="space-y-2">
                <ModeOption
                  value="theme"
                  active={mode === "theme"}
                  onSelect={setMode}
                  title="Hanya Tema"
                  desc="Cuma ganti warna, font, dan radius. Semua halaman dan kontennya tetap sama."
                  recommended
                />
                <ModeOption
                  value="append"
                  active={mode === "append"}
                  onSelect={setMode}
                  title="Tema + Tambah Halaman Default"
                  desc='Ganti tema dan SISIPKAN halaman default dari template baru. Halaman yang slug-nya sudah ada (mis. "home") di-skip.'
                />
                <ModeOption
                  value="replace"
                  active={mode === "replace"}
                  onSelect={setMode}
                  title="Reset Total"
                  desc="Hapus SEMUA halaman saat ini, lalu buat ulang dari template baru. Disnapshot ke versi history tapi tetap berbahaya."
                  danger
                />
              </div>

              {mode === "replace" && (
                <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  <ShieldAlert className="size-4 shrink-0" />
                  <p>
                    Tindakan ini menghapus halaman yang sudah Anda edit. Pertimbangkan export ZIP
                    dulu sebelum melanjutkan.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {step === 3 && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>
              Batal
            </Button>
            <Button onClick={apply} disabled={applying} variant={mode === "replace" ? "destructive" : "default"}>
              {applying ? "Menerapkan…" : "Terapkan"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ModeOption({
  value,
  active,
  onSelect,
  title,
  desc,
  recommended,
  danger,
}: {
  value: ApplyMode;
  active: boolean;
  onSelect: (v: ApplyMode) => void;
  title: string;
  desc: string;
  recommended?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition",
        active
          ? danger
            ? "border-destructive bg-destructive/5"
            : "border-primary bg-primary/5"
          : "hover:border-primary/50",
      )}
    >
      <div
        className={cn(
          "mt-0.5 size-4 shrink-0 rounded-full border-2",
          active
            ? danger
              ? "border-destructive bg-destructive"
              : "border-primary bg-primary"
            : "border-input",
        )}
      />
      <div className="flex-1">
        <div className="flex items-center gap-2 font-medium">
          {title}
          {recommended && (
            <Badge variant="success" className="text-[10px]">
              direkomendasikan
            </Badge>
          )}
          {danger && (
            <Badge variant="destructive" className="text-[10px]">
              destruktif
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
      </div>
    </button>
  );
}

function ThemeSwatchPreview({ theme }: { theme: ThemeJson }) {
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
