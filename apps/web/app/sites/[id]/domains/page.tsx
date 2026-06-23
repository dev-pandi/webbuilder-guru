"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Domain = {
  id: string;
  hostname: string;
  status: "pending" | "verified" | "failed";
  ssl_status: string;
  verified_at?: string | null;
};

export default function DomainsPage() {
  const params = useParams<{ id: string }>();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [hostname, setHostname] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try {
      setDomains(await api<Domain[]>(`/api/v1/sites/${params.id}/domains`));
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => {
    refresh();
  }, [params.id]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await api(`/api/v1/sites/${params.id}/domains`, {
        method: "POST",
        body: JSON.stringify({ hostname }),
      });
      setHostname("");
      refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function verify(id: string) {
    try {
      await api(`/api/v1/domains/${id}/verify`, { method: "POST" });
      refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function remove(id: string) {
    if (!confirm("Hapus domain?")) return;
    await api(`/api/v1/domains/${id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <p className="font-medium">Cara menambahkan domain kustom</p>
          <ol className="ml-4 mt-2 list-decimal space-y-1">
            <li>Tambahkan hostname di sini (mis. <code>tokoanda.id</code>).</li>
            <li>Di registrar DNS Anda, arahkan A record ke IP server platform ini.</li>
            <li>Klik <strong>Verifikasi</strong>. SSL akan diurus otomatis oleh Caddy saat domain pertama diakses.</li>
          </ol>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Hostname</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">SSL</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {domains.map((d) => (
                <tr key={d.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-mono">{d.hostname}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{d.ssl_status}</td>
                  <td className="px-4 py-3 text-right">
                    {d.status !== "verified" && (
                      <button onClick={() => verify(d.id)} className="mr-3 text-xs text-brand-600 hover:underline">
                        Verifikasi
                      </button>
                    )}
                    <button onClick={() => remove(d.id)} className="text-xs text-red-600 hover:underline">
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
              {domains.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    Belum ada domain.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <form onSubmit={add} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-semibold">Tambah Domain</h3>
        <div>
          <label className="block text-sm font-medium">Hostname</label>
          <input
            required
            value={hostname}
            onChange={(e) => setHostname(e.target.value.toLowerCase())}
            placeholder="tokoanda.id"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
          />
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
        <button className="w-full rounded-lg bg-brand-600 px-3 py-2 font-medium text-white hover:bg-brand-700">
          Tambah
        </button>
      </form>
    </div>
  );
}

function StatusBadge({ status }: { status: Domain["status"] }) {
  const map = {
    pending: "bg-amber-100 text-amber-700",
    verified: "bg-emerald-100 text-emerald-700",
    failed: "bg-red-100 text-red-700",
  } as const;
  return <span className={`rounded-full px-2 py-0.5 text-xs ${map[status]}`}>{status}</span>;
}
