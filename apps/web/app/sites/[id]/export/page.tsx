"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { Download } from "lucide-react";
import { getAccessToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://api.localhost";

export default function ExportPage() {
  const params = useParams<{ id: string }>();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function download() {
    setLoading(true);
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
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Export ke HTML/CSS/JS</CardTitle>
          <CardDescription>
            Unduh seluruh situs sebagai file statis. Cocok untuk hosting di Netlify, Vercel,
            Cloudflare Pages, Nginx, atau S3.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-4 text-sm">
            <p className="font-medium">Struktur file yang dihasilkan:</p>
            <pre className="mt-2 overflow-x-auto text-xs text-muted-foreground">{`site.zip
├── index.html
├── tentang/index.html
├── ...
├── assets/css/styles.css
├── robots.txt
└── sitemap.xml`}</pre>
          </div>

          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>
              • CSS variables dari tema diinline ke <code>styles.css</code>.
            </li>
            <li>
              • Google Fonts dimuat lewat <code>@import</code> di stylesheet.
            </li>
            <li>• Link antar halaman otomatis diubah jadi path relatif.</li>
            <li>• Tidak butuh JavaScript untuk fitur statis.</li>
          </ul>

          {err && <p className="text-sm text-destructive">{err}</p>}

          <Button onClick={download} disabled={loading} size="lg">
            <Download />
            {loading ? "Membungkus…" : "Unduh ZIP"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
