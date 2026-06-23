"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, getAccessToken } from "@/lib/api";
import { Pagination, SearchBar, useDebounced, type PaginatedResult } from "@/components/Pagination";

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
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [data, setData] = useState<PaginatedResult<Asset> | null>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ]);

  async function refresh() {
    try {
      const params2 = new URLSearchParams({
        page: String(page),
        page_size: "24",
      });
      if (debouncedQ) params2.set("q", debouncedQ);
      const r = await api<PaginatedResult<Asset>>(
        `/api/v1/sites/${params.id}/assets?${params2}`,
      );
      setData(r);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => {
    refresh();
  }, [params.id, page, debouncedQ]);

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
      if (!res.ok || body.error)
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
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

  const assets = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Upload Gambar</h2>
        <p className="mt-1 text-sm text-slate-600">
          PNG, JPG, WebP, GIF, atau SVG. Maks 10 MB.
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
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-semibold">Library {data ? `(${data.total})` : ""}</h2>
          <SearchBar value={q} onChange={setQ} placeholder="Filter MIME (mis. image)" />
        </div>
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="p-4">
            {assets.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                {debouncedQ ? `Tidak ada hasil untuk "${debouncedQ}".` : "Belum ada aset."}
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {assets.map((a) => (
                  <div
                    key={a.id}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                  >
                    <div className="aspect-square bg-slate-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.url} alt="" className="h-full w-full object-cover" />
                    </div>
                    <div className="p-3">
                      <div className="text-xs text-slate-500">
                        {(a.size / 1024).toFixed(1)} KB · {a.mime}
                      </div>
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
          {data && data.total_pages > 1 && (
            <div className="border-t border-slate-100">
              <Pagination
                page={data.page}
                totalPages={data.total_pages}
                total={data.total}
                pageSize={data.page_size}
                onPage={setPage}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
