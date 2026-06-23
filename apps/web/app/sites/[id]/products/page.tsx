"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
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
import { ProductDialog, type Product } from "./ProductDialog";

const SORT_OPTIONS = [
  { value: "newest", label: "Terbaru" },
  { value: "oldest", label: "Terlama" },
  { value: "name_asc", label: "Nama A→Z" },
  { value: "price_desc", label: "Harga Termahal" },
  { value: "price_asc", label: "Harga Termurah" },
];

const STATUS_OPTIONS = [
  { value: "_all", label: "Semua status" },
  { value: "active", label: "Aktif" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Arsip" },
];

export default function ProductsPage() {
  const params = useParams<{ id: string }>();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("newest");
  const [status, setStatus] = useState<string>("_all");
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [data, setData] = useState<PaginatedResult<Product> | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, sort, status]);

  async function refresh() {
    setLoading(true);
    try {
      const params2 = new URLSearchParams({
        page: String(page),
        page_size: "20",
        sort,
      });
      if (debouncedQ) params2.set("q", debouncedQ);
      if (status !== "_all") params2.set("status", status);
      const r = await api<PaginatedResult<Product>>(
        `/api/v1/sites/${params.id}/products?${params2}`,
      );
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
  }, [params.id, page, debouncedQ, sort, status]);

  async function remove(p: Product) {
    if (!confirm(`Hapus produk "${p.name}"?`)) return;
    try {
      await api(`/api/v1/products/${p.id}`, { method: "DELETE" });
      toast.success("Produk dihapus");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const products = data?.items ?? [];

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Produk</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total} produk` : "Memuat…"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SearchBar value={q} onChange={setQ} placeholder="Cari nama/slug..." />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-44">
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
          <Button onClick={() => setCreating(true)}>
            <Plus />
            Produk Baru
          </Button>
        </div>
      </header>
      {err && <p className="mt-3 text-sm text-destructive">{err}</p>}

      <Card className="mt-6 overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produk</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Harga</TableHead>
              <TableHead>Stok</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={loading ? "opacity-60" : ""}>
            {products.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    {p.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.image_url}
                        alt=""
                        className="size-10 rounded border object-cover"
                      />
                    ) : (
                      <div className="size-10 rounded border bg-muted" />
                    )}
                    <div>
                      <div className="font-medium">{p.name}</div>
                      {p.category && (
                        <div className="text-xs text-muted-foreground">{p.category}</div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">/{p.slug}</TableCell>
                <TableCell className="tabular-nums">{formatPrice(p.price, p.currency)}</TableCell>
                <TableCell className="tabular-nums">{p.stock ?? "∞"}</TableCell>
                <TableCell>
                  <ProductStatusBadge status={p.status} />
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="link" size="sm" onClick={() => setEditing(p)}>
                    Edit
                  </Button>
                  <Button
                    variant="link"
                    size="sm"
                    className="text-destructive"
                    onClick={() => remove(p)}
                  >
                    Hapus
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {products.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  {debouncedQ ? `Tidak ada hasil untuk "${debouncedQ}".` : "Belum ada produk."}
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

      <ProductDialog
        open={creating}
        onOpenChange={setCreating}
        siteId={params.id}
        product={null}
        onSaved={() => {
          setCreating(false);
          refresh();
        }}
      />
      <ProductDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        siteId={params.id}
        product={editing}
        onSaved={() => {
          setEditing(null);
          refresh();
        }}
      />
    </div>
  );
}

function ProductStatusBadge({ status }: { status: string }) {
  if (status === "active") return <Badge variant="success">aktif</Badge>;
  if (status === "draft") return <Badge variant="secondary">draft</Badge>;
  return <Badge variant="outline">arsip</Badge>;
}

function formatPrice(price: number, currency: string) {
  if (currency === "IDR") return `Rp ${price.toLocaleString("id-ID")}`;
  return `${currency} ${price.toLocaleString("id-ID")}`;
}
