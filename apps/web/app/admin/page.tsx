"use client";

import { useEffect, useState } from "react";
import { Users, Globe2, FileText, ShieldCheck, Image as ImageIcon, HardDrive } from "lucide-react";
import { api } from "@/lib/api";
import { fmtBytes } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Stats = {
  user_count: number;
  admin_count: number;
  site_count: number;
  published_sites: number;
  page_count: number;
  domain_count: number;
  verified_domains: number;
  asset_count: number;
  total_storage_bytes: number;
};

export default function AdminOverviewPage() {
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Stats>("/api/v1/admin/stats")
      .then(setS)
      .catch((e) => setErr((e as Error).message));
  }, []);

  if (err) return <p className="text-sm text-destructive">{err}</p>;
  if (!s) return <p className="text-sm text-muted-foreground">Memuat statistik…</p>;

  const cards = [
    { label: "User Terdaftar", value: String(s.user_count), hint: `${s.admin_count} admin`, icon: Users },
    { label: "Situs", value: String(s.site_count), hint: `${s.published_sites} published`, icon: Globe2 },
    { label: "Halaman", value: String(s.page_count), hint: "total seluruh situs", icon: FileText },
    { label: "Domain", value: String(s.domain_count), hint: `${s.verified_domains} verified`, icon: ShieldCheck },
    { label: "Aset", value: String(s.asset_count), hint: "file diupload", icon: ImageIcon },
    { label: "Storage", value: fmtBytes(s.total_storage_bytes), hint: "total dipakai", icon: HardDrive },
  ];

  return (
    <div>
      <header>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-sm text-muted-foreground">Statistik platform secara keseluruhan.</p>
      </header>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {c.label}
              </CardTitle>
              <c.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tabular-nums">{c.value}</div>
              <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
