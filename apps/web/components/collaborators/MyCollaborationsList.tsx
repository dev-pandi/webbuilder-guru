"use client";

// MyCollaborationsList — sites di mana agent/reseller adalah member
// (bukan owner). Kebalikan dari CollaboratorsList (client-facing).
// Endpoint: GET /api/v1/collaborations → array flat, group by-site di UI.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ExternalLink,
  Globe2,
  Loader2,
  User,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Collaboration = {
  site_id: string;
  site_name: string;
  site_slug: string;
  owner_id: string;
  owner_email: string;
  owner_name: string;
  role: "editor" | "viewer";
  added_at: string;
};

export function MyCollaborationsList() {
  const [items, setItems] = useState<Collaboration[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Collaboration[]>("/api/v1/collaborations")
      .then((res) => setItems(res ?? []))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <Users className="size-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">
            Situs yang saya kelola
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Situs milik klien yang Anda bantu kelola sebagai editor / viewer.
          Klik <strong>Buka editor</strong> untuk edit isi situs.
        </p>
      </div>

      {err && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0 translate-y-0.5" />
          <span>{err}</span>
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Memuat…
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center text-muted-foreground">
            <Users className="size-8 opacity-30" />
            <p className="text-sm font-medium">Belum ada situs yang dikelola</p>
            <p className="max-w-md text-xs">
              Ketika Anda beli domain + buat situs untuk klien, klien otomatis
              jadi pemilik dan Anda dapat akses editor untuk bantu isi konten.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <Card key={it.site_id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Globe2 className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{it.site_name}</p>
                    <Badge
                      variant={it.role === "editor" ? "secondary" : "warning"}
                      className="text-[10px]"
                    >
                      {roleLabel(it.role)}
                    </Badge>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      /{it.site_slug}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <User className="size-3" />
                    <span>Milik {it.owner_name || it.owner_email}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" asChild className="gap-1.5">
                    <Link href={`/sites/${it.site_id}/editor`}>
                      Buka editor
                      <ExternalLink className="size-3" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function roleLabel(role: string): string {
  return { editor: "Editor", viewer: "Viewer" }[role] || role;
}
