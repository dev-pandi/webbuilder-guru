"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Home } from "lucide-react";
import { toast } from "sonner";
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

type Page = {
  id: string;
  slug: string;
  title: string;
  is_home: boolean;
  updated_at: string;
};

export default function PagesPage() {
  const params = useParams<{ id: string }>();
  const [pages, setPages] = useState<Page[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");

  async function refresh() {
    try {
      setPages(await api<Page[]>(`/api/v1/sites/${params.id}/pages`));
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => {
    refresh();
  }, [params.id]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await api(`/api/v1/sites/${params.id}/pages`, {
        method: "POST",
        body: JSON.stringify({
          slug,
          title,
          tree: { blocks: [] },
          seo: {},
          is_home: false,
        }),
      });
      setSlug("");
      setTitle("");
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function setHome(id: string) {
    await api(`/api/v1/pages/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_home: true }),
    });
    refresh();
  }

  async function remove(id: string) {
    if (!confirm("Hapus halaman?")) return;
    await api(`/api/v1/pages/${id}`, { method: "DELETE" });
    refresh();
  }

  async function duplicate(id: string) {
    try {
      await api(`/api/v1/pages/${id}/duplicate`, { method: "POST" });
      toast.success("Halaman diduplikat");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Judul</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Home</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pages.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.title || "—"}</TableCell>
                <TableCell className="font-mono text-muted-foreground">/{p.slug}</TableCell>
                <TableCell>
                  {p.is_home ? (
                    <Badge variant="success" className="gap-1">
                      <Home className="size-3" />
                      home
                    </Badge>
                  ) : (
                    <Button variant="link" size="sm" onClick={() => setHome(p.id)}>
                      Jadikan home
                    </Button>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="link" size="sm" onClick={() => duplicate(p.id)}>
                    Duplikat
                  </Button>
                  <Button
                    variant="link"
                    size="sm"
                    className="text-destructive"
                    onClick={() => remove(p.id)}
                  >
                    Hapus
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {pages.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  Belum ada halaman.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tambah Halaman</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="title">Judul</Label>
              <Input
                id="title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-/]/g, ""))}
                placeholder="tentang"
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
