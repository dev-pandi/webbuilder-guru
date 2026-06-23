"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { getAccessToken } from "@/lib/api";

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
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold">Export ke HTML/CSS/JS</h2>
        <p className="mt-2 text-sm text-slate-600">
          Unduh seluruh situs sebagai file statis. Cocok untuk hosting di server lain
          seperti Netlify, Vercel, Cloudflare Pages, Nginx, atau S3.
        </p>

        <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm">
          <p className="font-medium">Struktur file yang dihasilkan:</p>
          <pre className="mt-2 overflow-x-auto text-xs text-slate-700">{`site.zip
├── index.html
├── tentang/index.html
├── ...
├── assets/css/styles.css
├── robots.txt
└── sitemap.xml`}</pre>
        </div>

        <ul className="mt-4 space-y-1 text-sm text-slate-600">
          <li>• CSS variables dari tema diinline ke <code>styles.css</code>.</li>
          <li>• Google Fonts dimuat lewat <code>@import</code> di stylesheet.</li>
          <li>• Link antar halaman otomatis diubah jadi path relatif.</li>
          <li>• Tidak butuh JavaScript untuk fitur statis.</li>
        </ul>

        {err && <p className="mt-4 text-sm text-red-600">{err}</p>}

        <button
          onClick={download}
          disabled={loading}
          className="mt-6 rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {loading ? "Membungkus…" : "Unduh ZIP"}
        </button>
      </div>
    </div>
  );
}
