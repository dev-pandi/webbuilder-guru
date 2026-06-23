"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FileText, HardDrive, RefreshCw, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { fmtBytes, pct } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

  if (loading && !usage)
    return <p className="text-sm text-muted-foreground">Memuat usage…</p>;
  if (err) return <p className="text-sm text-destructive">{err}</p>;
  if (!usage) return null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <UsageCard
          title="Halaman"
          icon={FileText}
          used={usage.pages.used}
          max={usage.pages.max}
          formatter={(n) => `${n} halaman`}
          subtitle="Jumlah halaman yang sudah dibuat."
        />
        <UsageCard
          title="Storage Aset"
          icon={HardDrive}
          used={usage.storage_bytes.used}
          max={usage.storage_bytes.max}
          formatter={fmtBytes}
          subtitle={`${usage.assets.used} file diupload.`}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Riwayat Usage</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Snapshot dicatat setiap kali halaman ini dibuka. {history.length} entri terakhir.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Halaman</TableHead>
                <TableHead>Aset</TableHead>
                <TableHead>Storage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="text-muted-foreground">
                    {new Date(s.captured_at).toLocaleString("id-ID")}
                  </TableCell>
                  <TableCell>{s.pages_count}</TableCell>
                  <TableCell>{s.assets_count}</TableCell>
                  <TableCell>{fmtBytes(s.storage_bytes)}</TableCell>
                </TableRow>
              ))}
              {history.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                    Belum ada snapshot.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Last updated {new Date(usage.at).toLocaleString("id-ID")}
      </p>
    </div>
  );
}

function UsageCard({
  title,
  icon: Icon,
  used,
  max,
  formatter,
  subtitle,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  used: number;
  max: number;
  formatter: (n: number) => string;
  subtitle?: string;
}) {
  const p = pct(used, max);
  const danger = p >= 90;
  const warn = p >= 70 && !danger;
  const indicator = danger ? "bg-destructive" : warn ? "bg-amber-500" : "bg-emerald-500";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Icon className="size-5 text-primary" />
              <CardTitle className="text-base">{title}</CardTitle>
            </div>
            {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums">{formatter(used)}</div>
            <div className="text-xs text-muted-foreground">dari {formatter(max)}</div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Progress value={p} indicatorClassName={indicator} />
        <div className="mt-1.5 flex items-center justify-between text-xs">
          <span
            className={
              danger ? "text-destructive" : warn ? "text-amber-600" : "text-muted-foreground"
            }
          >
            {p}% terpakai
          </span>
          {danger && (
            <span className="flex items-center gap-1 text-destructive">
              <AlertTriangle className="size-3" />
              Hampir penuh
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
