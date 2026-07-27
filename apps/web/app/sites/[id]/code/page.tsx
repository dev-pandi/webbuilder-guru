"use client";

// Kode Kustom — user tempel raw HTML/JS ke 2 slot: sebelum </head> dan
// sebelum </body>. Backend simpan apa adanya, renderer inject via
// dangerouslySetInnerHTML. Sengaja tidak sanitize karena use case
// (GTM/GA/Meta Pixel) butuh raw script tags. Batas 16 KB per field.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  Code2,
  Info,
  Loader2,
  Save,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// Batas backend = 16 KB per field. UI hitung karakter — kita anggap 1 char
// ≈ 1 byte (ASCII). Non-ASCII (mis. UTF-8) sedikit lebih besar, backend
// tetap validate final.
const MAX_BYTES = 16 * 1024;

type Site = {
  id: string;
  name: string;
  custom_head_code?: string;
  custom_body_end_code?: string;
};

export default function CustomCodePage() {
  const params = useParams<{ id: string }>();
  const siteID = params?.id ?? "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [headCode, setHeadCode] = useState("");
  const [bodyEndCode, setBodyEndCode] = useState("");
  const [original, setOriginal] = useState({ head: "", body: "" });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr(null);
      try {
        const site = await api<Site>(`/api/v1/sites/${siteID}`);
        if (cancelled) return;
        const h = site.custom_head_code ?? "";
        const b = site.custom_body_end_code ?? "";
        setHeadCode(h);
        setBodyEndCode(b);
        setOriginal({ head: h, body: b });
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [siteID]);

  const dirty = headCode !== original.head || bodyEndCode !== original.body;
  const headBytes = new Blob([headCode]).size;
  const bodyBytes = new Blob([bodyEndCode]).size;
  const overLimit = headBytes > MAX_BYTES || bodyBytes > MAX_BYTES;

  async function save() {
    if (!dirty || saving || overLimit) return;
    setSaving(true);
    try {
      const updated = await api<Site>(`/api/v1/sites/${siteID}`, {
        method: "PATCH",
        body: JSON.stringify({
          custom_head_code: headCode,
          custom_body_end_code: bodyEndCode,
        }),
      });
      setOriginal({
        head: updated.custom_head_code ?? "",
        body: updated.custom_body_end_code ?? "",
      });
      toast.success("Kode kustom tersimpan");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Header />
        <Card>
          <CardContent className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Memuat…
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Header />

      {err && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0 translate-y-0.5" />
          <span>{err}</span>
        </div>
      )}

      {/* Warning — raw injection */}
      <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50/50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/30">
        <AlertTriangle className="size-4 shrink-0 translate-y-0.5 text-amber-700 dark:text-amber-300" />
        <div className="text-amber-900 dark:text-amber-100">
          <p className="font-medium">Peringatan keamanan</p>
          <p className="mt-1 text-xs opacity-90">
            Kode di sini di-render <strong>apa adanya</strong> di situs Anda —
            termasuk <code>&lt;script&gt;</code>. Hanya tempel snippet dari
            sumber terpercaya. Jangan tempel kode dari orang yang tidak Anda
            kenal.
          </p>
        </div>
      </div>

      <CodeField
        icon={<Code2 className="size-4" />}
        title="Kode di Header (sebelum </head>)"
        description="Cocok untuk Google Analytics, Google Tag Manager, Meta Pixel, meta tag verifikasi (Search Console, Ahrefs, dll)."
        value={headCode}
        onChange={setHeadCode}
        bytes={headBytes}
        maxBytes={MAX_BYTES}
        placeholder={`Contoh:\n<!-- Google Analytics -->\n<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXX"></script>\n<script>\n  window.dataLayer = window.dataLayer || [];\n  function gtag(){dataLayer.push(arguments);}\n  gtag('js', new Date());\n  gtag('config', 'G-XXXXX');\n</script>`}
      />

      <CodeField
        icon={<Sparkles className="size-4" />}
        title="Kode di akhir Body (sebelum </body>)"
        description="Cocok untuk chat widget (Tawk, Crisp, Intercom), heatmap (Hotjar, Microsoft Clarity), atau script yang tidak boleh block first paint."
        value={bodyEndCode}
        onChange={setBodyEndCode}
        bytes={bodyBytes}
        maxBytes={MAX_BYTES}
        placeholder={`Contoh:\n<!-- Tawk.to chat widget -->\n<script>\n  var Tawk_API = Tawk_API || {}, Tawk_LoadStart = new Date();\n  (function(){\n    var s1 = document.createElement("script"), s0 = document.getElementsByTagName("script")[0];\n    s1.async = true;\n    s1.src = "https://embed.tawk.to/YOUR_ID/default";\n    s0.parentNode.insertBefore(s1, s0);\n  })();\n</script>`}
      />

      {/* Save bar — sticky di bawah */}
      <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-md">
        <div className="text-xs text-muted-foreground">
          {dirty ? (
            overLimit ? (
              <span className="text-destructive">
                Ada field yang melebihi batas 16 KB — kurangi dulu sebelum simpan.
              </span>
            ) : (
              "Ada perubahan yang belum disimpan."
            )
          ) : (
            "Semua tersimpan."
          )}
        </div>
        <Button
          onClick={save}
          disabled={!dirty || saving || overLimit}
          className="gap-1.5"
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          {saving ? "Menyimpan…" : "Simpan Perubahan"}
        </Button>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
          <Code2 className="size-4 text-primary" />
        </div>
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Advanced
        </span>
      </div>
      <h1 className="text-2xl font-bold tracking-tight">Kode Kustom</h1>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Tambahkan snippet HTML/JS untuk analytics, chat widget, atau verifikasi
        pihak ketiga. Aktif di situs publik dan mode pratinjau.
      </p>
    </div>
  );
}

function CodeField({
  icon,
  title,
  description,
  value,
  onChange,
  bytes,
  maxBytes,
  placeholder,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  value: string;
  onChange: (v: string) => void;
  bytes: number;
  maxBytes: number;
  placeholder: string;
}) {
  const over = bytes > maxBytes;
  const near = bytes > maxBytes * 0.85 && !over;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Label htmlFor={`code-${title}`} className="sr-only">
          {title}
        </Label>
        <Textarea
          id={`code-${title}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={10}
          spellCheck={false}
          className={cn(
            "font-mono text-xs leading-relaxed",
            over && "border-destructive focus-visible:ring-destructive",
          )}
        />
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Info className="size-3" />
            <span>Ditempatkan otomatis — tidak perlu tulis tag pembuka/penutup wrapper.</span>
          </div>
          <span
            className={cn(
              "font-mono",
              over ? "text-destructive" : near ? "text-amber-600" : "text-muted-foreground",
            )}
          >
            {formatBytes(bytes)} / {formatBytes(maxBytes)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}
