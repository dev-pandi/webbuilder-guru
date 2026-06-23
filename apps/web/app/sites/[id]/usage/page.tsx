"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtBytes, pct } from "@/lib/format";

type Metric = { used: number; max: number };
type Usage = {
  site_id: string;
  pages: Metric;
  assets: Metric;
  storage_bytes: Metric;
  at: string;
};

type Snapshot = {
  id: number;
  pages_count: number;
  assets_count: number;
  storage_bytes: number;
  captured_at: string;
};

export default function UsagePage() {
  const params = useParams<{ id: string }>();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [u, h] = await Promise.all([
        api<Usage>(`/api/v1/sites/${params.id}/usage`),
        api<Snapshot[]>(`/api/v1/sites/${params.id}/usage/history?limit=30`),
      ]);
      setUsage(u);
      setHistory(h);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, [params.id]);

  if (loading && !usage) return <p className="text-sm text-slate-500">Memuat usage…</p>;
  if (err) return <p className="text-sm text-red-600">{err}</p>;
  if (!usage) return null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <UsageCard
          title="Halaman"
          icon="📄"
          used={usage.pages.used}
          max={usage.pages.max}
          formatter={(n) => `${n} halaman`}
          subtitle="Jumlah halaman yang sudah dibuat."
        />
        <UsageCard
          title="Storage Aset"
          icon="🗂️"
          used={usage.storage_bytes.used}
          max={usage.storage_bytes.max}
          formatter={fmtBytes}
          subtitle={`${usage.assets.used} file diupload.`}
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Riwayat Usage</h2>
            <p className="text-xs text-slate-500">
              Snapshot dicatat setiap kali halaman ini dibuka. {history.length} entri terakhir.
            </p>
          </div>
          <button
            onClick={refresh}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50"
          >
            ↻ Refresh
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="border-b border-slate-200 py-2">Waktu</th>
                <th className="border-b border-slate-200 py-2">Halaman</th>
                <th className="border-b border-slate-200 py-2">Aset</th>
                <th className="border-b border-slate-200 py-2">Storage</th>
              </tr>
            </thead>
            <tbody>
              {history.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 text-slate-600">
                    {new Date(s.captured_at).toLocaleString("id-ID")}
                  </td>
                  <td className="py-2">{s.pages_count}</td>
                  <td className="py-2">{s.assets_count}</td>
                  <td className="py-2">{fmtBytes(s.storage_bytes)}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-500">
                    Belum ada snapshot.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Last updated {new Date(usage.at).toLocaleString("id-ID")}
      </p>
    </div>
  );
}

function UsageCard({
  title,
  icon,
  used,
  max,
  formatter,
  subtitle,
}: {
  title: string;
  icon: string;
  used: number;
  max: number;
  formatter: (n: number) => string;
  subtitle?: string;
}) {
  const p = pct(used, max);
  const danger = p >= 90;
  const warn = p >= 70 && !danger;
  const barColor = danger ? "bg-red-500" : warn ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{icon}</span>
            <h3 className="font-semibold">{title}</h3>
          </div>
          {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums">{formatter(used)}</div>
          <div className="text-xs text-slate-500">dari {formatter(max)}</div>
        </div>
      </div>
      <div className="mt-4">
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full ${barColor} transition-all`} style={{ width: `${p}%` }} />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-xs">
          <span className={danger ? "text-red-600" : warn ? "text-amber-600" : "text-slate-500"}>
            {p}% terpakai
          </span>
          {danger && <span className="text-red-600">⚠ Hampir penuh</span>}
        </div>
      </div>
    </div>
  );
}
