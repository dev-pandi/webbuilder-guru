"use client";

// /admin/aduan — antrean aduan konten dari publik. Urutan dari server:
// "baru" dulu, lalu "ditinjau", lalu sisanya; terbaru di atas.

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Loader2, Paperclip, Search, ShieldAlert } from "lucide-react";

import { api } from "@/lib/api";
import { Pagination, useDebounced, type PaginatedResult } from "@/components/Pagination";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { CATEGORY_LABEL, STATUS_META, fmtDateTime, type AbuseReport } from "./shared";

const FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "Semua" },
  { value: "baru", label: "Baru" },
  { value: "ditinjau", label: "Ditinjau" },
  { value: "ditindak", label: "Ditindak" },
  { value: "ditolak", label: "Ditolak" },
];

export default function AdminAduanPage() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedResult<AbuseReport> | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => setPage(1), [status, debouncedQ]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (status) params.set("status", status);
    if (debouncedQ) params.set("q", debouncedQ);
    api<PaginatedResult<AbuseReport>>(`/api/v1/admin/abuse-reports?${params}`)
      .then((res) => !cancelled && setData(res))
      .catch((e) => !cancelled && setErr((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [status, debouncedQ, page]);

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-destructive/10">
            <ShieldAlert className="size-4 text-destructive" />
          </div>
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Kepatuhan konten
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Aduan</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Laporan publik tentang situs atau domain bermasalah. Buka aduan untuk
          melihat bukti dan menangguhkan situs atau domainnya.
        </p>
      </div>

      {err && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          {err}
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatus(f.value)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  status === f.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative ml-auto min-w-[220px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari domain, email, atau uraian…"
              className="h-9 pl-8"
            />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Diadukan</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead>Pelapor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Masuk</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={loading ? "opacity-60" : ""}>
            {loading && items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center">
                  <span className="inline-flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Memuat…
                  </span>
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  {debouncedQ || status ? "Tidak ada aduan yang cocok." : "Belum ada aduan masuk."}
                </TableCell>
              </TableRow>
            ) : (
              items.map((r) => (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40">
                  <TableCell className="align-top">
                    <Link href={`/admin/aduan/${r.id}`} className="block">
                      <code className="text-sm font-medium">{r.reported_host}</code>
                      <div className="mt-0.5 line-clamp-1 max-w-sm text-xs text-muted-foreground">
                        {r.description}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Paperclip className="size-3" /> {r.file_count} bukti
                        </span>
                        {!r.site_id && <span>· bukan situs platform</span>}
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="align-top text-sm">{CATEGORY_LABEL[r.category] ?? r.category}</TableCell>
                  <TableCell className="align-top text-xs text-muted-foreground">
                    {r.reporter_name && <div className="font-medium text-foreground">{r.reporter_name}</div>}
                    {r.reporter_email}
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant={STATUS_META[r.status].variant} className="text-xs">
                      {STATUS_META[r.status].label}
                    </Badge>
                  </TableCell>
                  <TableCell className="align-top text-xs text-muted-foreground">
                    {fmtDateTime(r.created_at)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {data && (
          <Pagination
            page={data.page}
            totalPages={data.total_pages}
            total={data.total}
            pageSize={data.page_size}
            onPage={setPage}
          />
        )}
      </Card>
    </div>
  );
}
