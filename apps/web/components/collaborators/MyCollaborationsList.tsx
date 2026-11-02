"use client";

// MyCollaborationsList — situs milik klien yang agent/reseller bantu kelola
// (role editor/viewer, bukan owner). Kebalikan dari CollaboratorsList yang
// menampilkan orang-orang yang punya akses ke situs SAYA.
//
// Endpoint: GET /api/v1/collaborations.
//
// Sejak "Situs Saya" dipersempit ke pemilik saja, halaman ini satu-satunya
// tempat situs klien muncul — jadi tiap baris memuat identitas pemiliknya dan
// jalan menuju profil kliennya, bukan hanya nama situs.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CalendarClock,
  ExternalLink,
  Loader2,
  Mail,
  Search,
  SquarePen,
  UserRound,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

export function MyCollaborationsList({
  basePath = "/agent",
}: {
  // Dipakai untuk tautan ke profil klien; berbeda antara portal agent dan
  // reseller, seperti pola basePath di ClientDetail.
  basePath?: string;
}) {
  const [items, setItems] = useState<Collaboration[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    api<Collaboration[]>("/api/v1/collaborations")
      .then((res) => setItems(res ?? []))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((it) =>
      [it.site_name, it.site_slug, it.owner_name, it.owner_email]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [items, q]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Users className="size-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">
              Situs Klien
            </h1>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Situs yang dimiliki klien Anda dan Anda bantu kelola. Situs milik
            Anda sendiri ada di Situs Saya.
          </p>
        </div>
        {items.length > 0 && (
          <Badge variant="secondary" className="gap-1.5 text-xs">
            {items.length} situs
          </Badge>
        )}
      </div>

      {err && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0 translate-y-0.5" />
          <span>{err}</span>
        </div>
      )}

      {items.length > 4 && (
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari situs atau nama klien…"
            className="h-9 pl-8"
          />
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
            <p className="text-sm font-medium">Belum ada situs klien</p>
            <p className="max-w-md text-xs">
              Saat Anda membelikan domain dan membuat situs untuk klien, klien
              menjadi pemiliknya dan Anda otomatis mendapat akses editor.
            </p>
          </CardContent>
        </Card>
      ) : shown.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Tidak ada hasil untuk “{q}”.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {shown.map((it) => (
            <Card key={it.site_id} className="overflow-hidden">
              <CardContent className="space-y-4 p-4">
                {/* Situs */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {it.site_name}
                    </p>
                    <code className="text-[11px] text-muted-foreground">
                      /{it.site_slug}
                    </code>
                  </div>
                  <Badge
                    variant={it.role === "editor" ? "secondary" : "warning"}
                    className="shrink-0 text-[10px]"
                  >
                    {roleLabel(it.role)}
                  </Badge>
                </div>

                {/* Pemilik */}
                <div className="flex items-center gap-3 rounded-lg bg-muted/40 p-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {initials(it.owner_name, it.owner_email)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {it.owner_name || "Tanpa nama"}
                    </p>
                    <a
                      href={`mailto:${it.owner_email}`}
                      className="inline-flex max-w-full items-center gap-1 truncate text-xs text-muted-foreground hover:text-primary"
                    >
                      <Mail className="size-3 shrink-0" />
                      <span className="truncate">{it.owner_email}</span>
                    </a>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <CalendarClock className="size-3" />
                    Dikelola sejak {formatDate(it.added_at)}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" asChild className="gap-1.5">
                      <Link href={`${basePath}/clients/${it.owner_id}`}>
                        <UserRound className="size-3.5" />
                        Detail klien
                      </Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild className="gap-1.5">
                      <Link href={`/sites/${it.site_id}/editor`}>
                        <SquarePen className="size-3.5" />
                        Buka editor
                        <ExternalLink className="size-3 opacity-60" />
                      </Link>
                    </Button>
                  </div>
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

function initials(name: string, email: string): string {
  const src = name || email;
  const parts = src.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
