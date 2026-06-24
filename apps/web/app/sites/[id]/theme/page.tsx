"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Eye,
  Loader2,
  Palette,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
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
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-500/10">
            <Palette className="h-4 w-4 text-violet-500" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Tema
          </span>
        </div>
        <h1 className="text-xl font-bold">Pengaturan Tema</h1>
        <p className="text-sm text-muted-foreground">
          Sesuaikan tampilan visual dan template situs Anda.
        </p>
      </div>

      {/* Current Template */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
              <Sparkles className="h-4 w-4 text-violet-500" />
            </div>
            <div>
              <p className="text-sm font-semibold">Template Saat Ini</p>
              {currentTemplate ? (
                <p className="text-sm text-muted-foreground">
                  {currentTemplate.name}
                  <span className="ml-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {currentTemplate.variant}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Belum terhubung ke template tertentu.
                </p>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setSwitchOpen(true)}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Ganti Template
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Edit Theme */}
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-500/10">
              <Palette className="h-3.5 w-3.5 text-violet-500" />
            </div>
            <span className="text-sm font-semibold">Edit Tema</span>
          </div>
          <div className="space-y-5 p-4">
            {/* Colors */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Warna
              </p>
              <div className="grid gap-2">
                {(
                  [
                    { key: "primary", label: "Primary", desc: "Warna utama & aksen" },
                    { key: "secondary", label: "Secondary", desc: "Aksen sekunder" },
                    { key: "bg", label: "Background", desc: "Latar halaman" },
                    { key: "fg", label: "Foreground", desc: "Teks utama" },
                  ] as const
                ).map(({ key, label, desc }) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="h-6 w-6 shrink-0 rounded-md border shadow-sm"
                        style={{ background: color(key) }}
                      />
                      <div>
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {color(key).toUpperCase()}
                      </span>
                      <input
                        type="color"
                        value={color(key)}
                        onChange={(e) =>
                          setTheme((t) => ({
                            ...t,
                            colors: { ...(t.colors ?? {}), [key]: e.target.value },
                          }))
                        }
                        className="h-8 w-10 cursor-pointer rounded border border-input bg-transparent p-0.5"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Fonts */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Font
              </p>
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

            {/* Radius */}
            <div className="space-y-1.5">
              <Label
                htmlFor="radius"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Border Radius
              </Label>
              <Input
                id="radius"
                value={theme.radius ?? ""}
                onChange={(e) => setTheme((t) => ({ ...t, radius: e.target.value }))}
                placeholder="0.5rem"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Contoh:{" "}
                <code className="rounded bg-muted px-1">0rem</code>,{" "}
                <code className="rounded bg-muted px-1">0.5rem</code>,{" "}
                <code className="rounded bg-muted px-1">1rem</code>
              </p>
            </div>

            <div className="flex justify-end border-t pt-4">
              <Button onClick={save} disabled={saving} className="gap-2">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {saving ? "Menyimpan…" : "Simpan Tema"}
              </Button>
            </div>
          </div>
        </div>

        {/* Live Preview */}
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-sky-500/10">
              <Eye className="h-3.5 w-3.5 text-sky-500" />
            </div>
            <span className="text-sm font-semibold">Preview Langsung</span>
          </div>
          <div className="p-4">
            <div
              className="overflow-hidden rounded-lg border p-5 shadow-inner"
              style={{
                background: color("bg"),
                color: color("fg"),
                borderRadius: theme.radius,
              }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-widest opacity-50">
                Preview
              </p>
              <h2
                className="mt-1 text-2xl font-bold leading-tight"
                style={{ fontFamily: theme.font?.heading }}
              >
                Judul Halaman
              </h2>
              <p
                className="mt-2 text-sm leading-relaxed opacity-80"
                style={{ fontFamily: theme.font?.body }}
              >
                Ini contoh teks body. Gunakan untuk melihat kombinasi font dan warna.
              </p>
              <div className="mt-4 flex gap-3">
                <span
                  className="rounded px-4 py-1.5 text-sm font-medium text-white shadow-sm"
                  style={{ background: color("primary"), borderRadius: theme.radius }}
                >
                  Tombol Primer
                </span>
                <span
                  className="rounded px-4 py-1.5 text-sm font-medium text-white shadow-sm"
                  style={{ background: color("secondary"), borderRadius: theme.radius }}
                >
                  Sekunder
                </span>
              </div>
              <div className="mt-4 space-y-2 border-t pt-3 opacity-40">
                <div className="h-2 w-1/2 rounded" style={{ background: color("fg") }} />
                <div className="h-2 w-2/3 rounded opacity-60" style={{ background: color("fg") }} />
                <div className="h-2 w-1/3 rounded opacity-40" style={{ background: color("fg") }} />
              </div>
            </div>
          </div>
        </div>
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
            Pilih template dan cara penerapannya untuk situs ini.
          </DialogDescription>
        </DialogHeader>

        {/* Visual Stepper */}
        <div className="flex items-start justify-center gap-0 border-b pb-4">
          {(["Kategori", "Tema", "Penerapan"] as const).map((label, i) => {
            const n = (i + 1) as 1 | 2 | 3;
            const done = step > n;
            const active = step === n;
            return (
              <div key={label} className="flex items-center">
                {i > 0 && (
                  <div
                    className={cn(
                      "mb-5 h-px w-10",
                      done ? "bg-primary" : "bg-muted",
                    )}
                  />
                )}
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all",
                      done
                        ? "bg-primary text-primary-foreground"
                        : active
                          ? "border-2 border-primary bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : n}
                  </div>
                  <span
                    className={cn(
                      "text-[10px]",
                      active ? "font-semibold text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="max-h-[55vh] overflow-y-auto">
          {step === 1 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(meta?.categories ?? []).map((c) => (
                <button
                  key={c.key}
                  onClick={() => {
                    setCategory(c.key);
                    setStep(2);
                  }}
                  className="group rounded-xl border bg-background p-5 text-left transition hover:border-primary hover:shadow-md"
                >
                  <div className="text-3xl">{c.emoji}</div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="font-semibold">{c.label}</span>
                    <span className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                      Pilih →
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{c.description}</div>
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep(1)}
                className="mb-3 gap-1.5 text-xs"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
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
                        "rounded-xl border bg-background p-4 text-left transition hover:border-primary hover:shadow-md",
                        isCurrent && "border-primary ring-2 ring-primary/20",
                      )}
                    >
                      <ThemeSwatchPreview theme={t.theme} />
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="font-semibold">
                          {t.name.split("—")[1]?.trim() ?? t.name}
                        </span>
                        {isCurrent && (
                          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                            saat ini
                          </span>
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep(2)}
                className="mb-3 gap-1.5 text-xs"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Ganti tema
              </Button>

              <div className="mb-4 flex items-center gap-3 rounded-xl border bg-muted/40 p-3">
                <div className="w-24 shrink-0">
                  <ThemeSwatchPreview theme={picked.theme} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tema terpilih</p>
                  <p className="font-semibold">{picked.name}</p>
                  <p className="text-xs text-muted-foreground">{picked.description}</p>
                </div>
              </div>

              <p className="mb-3 text-sm font-semibold">Bagaimana cara menerapkan?</p>
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
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
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
          <DialogFooter className="border-t pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={applying}
            >
              Batal
            </Button>
            <Button
              onClick={apply}
              disabled={applying}
              variant={mode === "replace" ? "destructive" : "default"}
              className="gap-2"
            >
              {applying && <Loader2 className="h-4 w-4 animate-spin" />}
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
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
              direkomendasikan
            </span>
          )}
          {danger && (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
              destruktif
            </span>
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
