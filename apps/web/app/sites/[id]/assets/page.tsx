"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, getAccessToken } from "@/lib/api";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://api.localhost";

type Asset = {
  id: string;
  url: string;
  mime: string;
  size: number;
  created_at: string;
};

export default function AssetsPage() {
  const params = useParams<{ id: string }>();
  const fileRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function refresh() {
    try {
      setAssets(await api<Asset[]>(`/api/v1/sites/${params.id}/assets`));
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => {
    refresh();
  }, [params.id]);

  async function upload(file: File) {
    setUploading(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${BASE}/api/v1/sites/${params.id}/assets`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getAccessToken()}` },
        body: fd,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.error) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // noop
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Upload Gambar</h2>
        <p className="mt-1 text-sm text-slate-600">
          PNG, JPG, WebP, GIF, atau SVG. Maks 10 MB. URL hasil upload dipakai di field
          gambar pada block (mis. ProductGrid → image).
        </p>
        <div className="mt-4 flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
            }}
            disabled={uploading}
            className="block text-sm"
          />
          {uploading && <span className="text-sm text-slate-500">Mengunggah…</span>}
        </div>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      </div>

      <div>
        <h2 className="mb-3 font-semibold">Library</h2>
        {assets.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada aset.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {assets.map((a) => (
              <div key={a.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="aspect-square bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="p-3">
                  <div className="text-xs text-slate-500">{(a.size / 1024).toFixed(1)} KB · {a.mime}</div>
                  <button
                    onClick={() => copy(a.url)}
                    className="mt-2 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs hover:bg-slate-50"
                  >
                    {copied === a.url ? "✓ Tersalin" : "Copy URL"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
