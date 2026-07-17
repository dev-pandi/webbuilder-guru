"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import {
  Download,
  FileArchive,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileCode2,
  Palette,
  Link2,
  Blocks,
} from "lucide-react";
import { getAccessToken } from "@/lib/api";
import { Button } from "@/components/ui/button";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://api.localhost";

const FEATURES = [
  {
    icon: Palette,
    text: (
      <>
        CSS variables dari tema diinline ke{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
          styles.css
        </code>
      </>
    ),
  },
  {
    icon: FileCode2,
    text: (
      <>
        Google Fonts dimuat lewat{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
          @import
        </code>{" "}
        di stylesheet
      </>
    ),
  },
  {
    icon: Link2,
    text: "Link antar halaman otomatis diubah jadi path relatif",
  },
  {
    icon: Blocks,
    text: "Tidak butuh JavaScript untuk fitur statis",
  },
];

const HOSTS = ["Netlify", "Vercel", "Cloudflare Pages", "Nginx", "Amazon S3"];

export default function ExportPage() {
  const params = useParams<{ id: string }>();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function download() {
    setLoading(true);
    setDone(false);
    setErr(null);
    try {
      const token = getAccessToken();
      const res = await fetch(`${BASE}/api/v1/sites/${params.id}/export`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `site-${params.id}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDone(true);
      setTimeout(() => setDone(false), 4000);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-6xl space-y-6 mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/10">
            <FileArchive className="size-4 text-blue-600" />
          </div>
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Export
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Export ke HTML/CSS/JS</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Unduh seluruh situs sebagai file statis siap deploy.
        </p>
      </div>

      {/* File structure preview */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-3">
          <FileArchive className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Struktur file yang dihasilkan</span>
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            .zip
          </span>
        </div>
        <pre className="overflow-x-auto px-5 py-4 text-xs leading-relaxed text-muted-foreground font-mono">{`site.zip
├── index.html
├── tentang/index.html
├── ...
├── assets/css/styles.css
├── robots.txt
└── sitemap.xml`}</pre>
      </div>

      {/* Features */}
      <div className="rounded-xl border bg-card shadow-sm p-5 space-y-3">
        <p className="text-sm font-semibold">Yang disertakan dalam ekspor</p>
        <ul className="space-y-2.5">
          {FEATURES.map((f, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <f.icon className="size-3 text-primary" />
              </div>
              <span>{f.text}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Compatible hosts */}
      <div className="rounded-xl border bg-card shadow-sm p-5">
        <p className="mb-3 text-sm font-semibold">Kompatibel dengan</p>
        <div className="flex flex-wrap gap-2">
          {HOSTS.map((h) => (
            <span
              key={h}
              className="rounded-lg border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground"
            >
              {h}
            </span>
          ))}
        </div>
      </div>

      {/* Error */}
      {err && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>
            <span className="font-medium">Gagal mengekspor:</span> {err}
          </span>
        </div>
      )}

      {/* Success */}
      {done && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>
            <span className="font-medium">Berhasil!</span> File ZIP sedang diunduh.
          </span>
        </div>
      )}

      {/* Download button */}
      <div className="flex items-center gap-4">
        <Button
          onClick={download}
          disabled={loading}
          size="lg"
          className="gap-2 shadow-sm"
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Membungkus file…
            </>
          ) : done ? (
            <>
              <CheckCircle2 className="size-4" />
              Terunduh!
            </>
          ) : (
            <>
              <Download className="size-4" />
              Unduh ZIP
            </>
          )}
        </Button>
        <p className="text-xs text-muted-foreground">
          File akan otomatis terunduh setelah diproses
        </p>
      </div>
    </div>
  );
}
