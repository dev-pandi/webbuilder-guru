"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
        <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/50">
          <CardContent className="flex gap-3 p-4 text-sm text-blue-900 dark:text-blue-100">
            <Info className="size-5 shrink-0" />
            <div>
              <p className="font-medium">Cara menambahkan domain kustom</p>
              <ol className="ml-4 mt-2 list-decimal space-y-1">
                <li>
                  Tambahkan hostname di sini (mis. <code>tokoanda.id</code>).
                </li>
                <li>Di registrar DNS Anda, arahkan A record ke IP server platform ini.</li>
                <li>
                  Klik <strong>Verifikasi</strong>. SSL akan diurus otomatis oleh Caddy saat
                  domain pertama diakses.
                </li>
              </ol>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hostname</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>SSL</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {domains.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono">{d.hostname}</TableCell>
                  <TableCell>
                    <StatusBadge status={d.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{d.ssl_status}</TableCell>
                  <TableCell className="text-right">
                    {d.status !== "verified" && (
                      <Button variant="link" size="sm" onClick={() => verify(d.id)}>
                        Verifikasi
                      </Button>
                    )}
                    <Button
                      variant="link"
                      size="sm"
                      className="text-destructive"
                      onClick={() => remove(d.id)}
                    >
                      Hapus
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {domains.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Belum ada domain.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tambah Domain</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="hostname">Hostname</Label>
              <Input
                id="hostname"
                required
                value={hostname}
                onChange={(e) => setHostname(e.target.value.toLowerCase())}
                placeholder="tokoanda.id"
                className="font-mono"
              />
            </div>
            {err && <p className="text-xs text-destructive">{err}</p>}
            <Button type="submit" className="w-full">
              Tambah
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: Domain["status"] }) {
  const variant = status === "verified" ? "success" : status === "failed" ? "destructive" : "warning";
  return <Badge variant={variant}>{status}</Badge>;
}
