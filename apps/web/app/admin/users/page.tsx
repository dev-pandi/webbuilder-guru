"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Pagination, SearchBar, useDebounced, type PaginatedResult } from "@/components/Pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  site_count: number;
  created_at: string;
};

const SORT_OPTIONS = [
  { value: "newest", label: "Terbaru" },
  { value: "oldest", label: "Terlama" },
  { value: "email_asc", label: "Email A→Z" },
  { value: "email_desc", label: "Email Z→A" },
  { value: "sites_desc", label: "Jumlah Situs (banyak dulu)" },
];

export default function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("newest");
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [data, setData] = useState<PaginatedResult<AdminUser> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, sort]);

  async function refresh() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: "20",
        sort,
      });
      if (debouncedQ) params.set("q", debouncedQ);
      const r = await api<PaginatedResult<AdminUser>>(`/api/v1/admin/users?${params}`);
      setData(r);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, [page, debouncedQ, sort]);

  async function setRole(id: string, role: "user" | "admin") {
    try {
      await api(`/api/v1/admin/users/${id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function remove(id: string, email: string) {
    if (!confirm(`Hapus user ${email}? Semua situs miliknya juga akan dihapus.`)) return;
    try {
      await api(`/api/v1/admin/users/${id}`, { method: "DELETE" });
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const users = data?.items ?? [];

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">User</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total} user terdaftar` : "Memuat…"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SearchBar value={q} onChange={setQ} placeholder="Cari email/nama..." />
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>
      {err && <p className="mt-3 text-sm text-destructive">{err}</p>}

      <Card className="mt-6 overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Nama</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Situs</TableHead>
              <TableHead>Daftar</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={loading ? "opacity-60" : ""}>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-mono text-xs">{u.email}</TableCell>
                <TableCell>{u.name || "—"}</TableCell>
                <TableCell>
                  <Badge variant={u.role === "admin" ? "warning" : "secondary"}>{u.role}</Badge>
                </TableCell>
                <TableCell className="tabular-nums">{u.site_count}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(u.created_at).toLocaleDateString("id-ID")}
                </TableCell>
                <TableCell className="text-right">
                  {u.role === "admin" ? (
                    <Button
                      variant="link"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() => setRole(u.id, "user")}
                    >
                      Demote
                    </Button>
                  ) : (
                    <Button
                      variant="link"
                      size="sm"
                      className="text-amber-600"
                      onClick={() => setRole(u.id, "admin")}
                    >
                      Jadikan Admin
                    </Button>
                  )}
                  <Button
                    variant="link"
                    size="sm"
                    className="text-destructive"
                    onClick={() => remove(u.id, u.email)}
                  >
                    Hapus
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  {debouncedQ ? `Tidak ada hasil untuk "${debouncedQ}".` : "Belum ada user."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {data && (
          <div className="border-t">
            <Pagination
              page={data.page}
              totalPages={data.total_pages}
              total={data.total}
              pageSize={data.page_size}
              onPage={setPage}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
