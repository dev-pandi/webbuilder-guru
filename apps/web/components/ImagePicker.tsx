"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, getAccessToken } from "@/lib/api";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://api.localhost";

type Asset = { id: string; url: string; mime: string; size: number };

// Hosted-or-pasted image input. Two modes:
//   - paste a URL directly into the text field
//   - open the modal to pick from the site's Asset Library (or upload there)
export function ImagePicker({
  value,
  onChange,
  size = "md",
}: {
  value: string;
  onChange: (url: string) => void;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const inputCls =
    size === "sm"
      ? "flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
      : "flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm";
  const btnCls =
    size === "sm"
      ? "rounded border border-slate-300 px-2 text-xs hover:bg-slate-50"
      : "rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50";

  return (
    <div>
      <div className="flex gap-1.5">
        <input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
          placeholder="URL gambar atau pilih dari library"
        />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={btnCls}
          title="Pilih dari library"
        >
          📁
        </button>
      </div>
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt=""
          className="mt-1.5 h-14 w-14 rounded border border-slate-200 object-cover"
        />
      ) : null}
      {open && (
        <LibraryModal
          onClose={() => setOpen(false)}
          onPick={(url) => {
            onChange(url);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function LibraryModal({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (url: string) => void;
}) {
  const params = useParams<{ id: string }>();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    try {
      setAssets(await api<Asset[]>(`/api/v1/sites/${params.id}/assets`));
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => {
    refresh();
  }, []);

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
      if (!res.ok || body?.error) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      const newAsset = body.data as Asset;
      await refresh();
      onPick(newAsset.url); // auto-select the just-uploaded image
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-xl bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="font-semibold">Asset Library</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>
        <div className="border-b border-slate-200 px-6 py-3">
          <div className="flex items-center gap-3">
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
            {uploading && <span className="text-xs text-slate-500">Mengunggah…</span>}
          </div>
          {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {assets.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Belum ada aset. Upload di atas atau di tab Aset.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-4">
              {assets.map((a) => (
                <button
                  key={a.id}
                  onClick={() => onPick(a.url)}
                  className="overflow-hidden rounded-lg border border-slate-200 transition hover:border-brand-500"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt="" className="aspect-square w-full object-cover" />
                  <div className="border-t border-slate-100 px-2 py-1 text-[10px] text-slate-500">
                    {(a.size / 1024).toFixed(1)} KB
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
