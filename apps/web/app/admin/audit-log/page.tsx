"use client";

// Admin audit log viewer (Phase 7). Paginated table dari `audit_log` table.
// Filter: event, actor_id, target. Search by target_id.

import { Fragment, useEffect, useState } from "react";
import {
  AlertCircle,
  Filter,
  Loader2,
  ScrollText,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";

type Entry = {
  id: string;
  actor_id?: string;
  actor_email?: string;
  actor_name?: string;
  event: string;
  target_type?: string;
  target_id?: string;
  metadata: Record<string, unknown>;
  ip?: string;
  user_agent?: string;
  created_at: string;
};

type PagedResp = {
  items: Entry[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

// Common events untuk filter dropdown — supaya admin bisa pick tanpa hafal string.
const EVENT_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Semua event" },
  { value: "reseller.applied", label: "Reseller apply" },
  { value: "reseller.approved", label: "Reseller approved" },
  { value: "reseller.suspended", label: "Reseller suspended" },
  { value: "agent.invited", label: "Agent invited" },
  { value: "client.invited", label: "Client invited" },
  { value: "invitation.accepted", label: "Invitation accepted" },
  { value: "purchase.created", label: "Purchase (self)" },
  { value: "purchase.on_behalf_of", label: "Purchase (on-behalf-of)" },
  { value: "purchase.retried", label: "Purchase retried" },
  { value: "purchase.renewed", label: "Purchase renewed" },
  { value: "wallet.topup_initiated", label: "Wallet topup" },
  { value: "wallet.proof_uploaded", label: "Wallet proof" },
  { value: "admin.user_promoted", label: "Admin: promote user" },
  { value: "admin.user_demoted", label: "Admin: demote user" },
  { value: "admin.user_deleted", label: "Admin: delete user" },
  { value: "admin.site_deleted", label: "Admin: delete site" },
];

export default function AuditLogPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [event, setEvent] = useState("");
  const [targetID, setTargetID] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    const q = new URLSearchParams({
      page: String(page),
      page_size: "50",
    });
    if (event) q.set("event", event);
    if (targetID.trim()) q.set("target_id", targetID.trim());
    api<PagedResp>(`/api/v1/admin/audit-log?${q.toString()}`)
      .then((res) => {
        setEntries(res.items ?? []);
        setTotalPages(res.total_pages);
        setTotal(res.total);
      })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [page, event, targetID]);

  function resetFilters() {
    setEvent("");
    setTargetID("");
    setPage(1);
  }

  const hasFilter = event !== "" || targetID.trim() !== "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <ScrollText className="size-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Jejak aksi sensitif — reseller approve, purchase, invite, wallet,
            admin ops. Append-only.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Filter className="size-4" />
            Filter
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="evt" className="text-xs uppercase tracking-wider text-muted-foreground">
                Event
              </Label>
              <select
                id="evt"
                value={event}
                onChange={(e) => {
                  setEvent(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                {EVENT_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tgt" className="text-xs uppercase tracking-wider text-muted-foreground">
                Target ID
              </Label>
              <Input
                id="tgt"
                value={targetID}
                onChange={(e) => {
                  setTargetID(e.target.value);
                  setPage(1);
                }}
                placeholder="UUID / job ID / email"
              />
            </div>
            <div className="flex items-end">
              {hasFilter && (
                <Button variant="outline" size="sm" onClick={resetFilters} className="gap-1">
                  <X className="size-3" />
                  Reset
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {err && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0 translate-y-0.5" />
          <span>{err}</span>
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-40">Waktu</TableHead>
                <TableHead>Aktor</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Target</TableHead>
                <TableHead className="w-0">Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={loading ? "opacity-60" : ""}>
              {loading && entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-14 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-14 text-center text-sm text-muted-foreground">
                    Tidak ada audit entry
                    {hasFilter ? " untuk filter ini" : ""}.
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((e) => (
                  <Fragment key={e.id}>
                    <TableRow>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDate(e.created_at)}
                      </TableCell>
                      <TableCell>
                        {e.actor_email ? (
                          <div className="min-w-0">
                            <p className="truncate text-sm">{e.actor_name || "—"}</p>
                            <p className="truncate font-mono text-[11px] text-muted-foreground">
                              {e.actor_email}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">system</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          {e.event}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {e.target_id ? (
                          <div className="min-w-0">
                            {e.target_type && (
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                {e.target_type}
                              </p>
                            )}
                            <p className="truncate font-mono text-xs">{e.target_id}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                          className="text-xs text-primary hover:underline"
                        >
                          {expanded === e.id ? "Tutup" : "Detail"}
                        </button>
                      </TableCell>
                    </TableRow>
                    {expanded === e.id && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={5} className="py-3">
                          <pre className="overflow-x-auto rounded-md bg-background p-3 text-[11px]">
                            {JSON.stringify(e.metadata, null, 2)}
                          </pre>
                          {e.ip && (
                            <p className="mt-2 text-[11px] text-muted-foreground">
                              IP: <span className="font-mono">{e.ip}</span>
                            </p>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {totalPages > 1 && (
        <div className={cn("flex items-center justify-between text-sm", loading && "opacity-60")}>
          <span className="text-muted-foreground">
            Halaman {page} dari {totalPages} · {total.toLocaleString("id-ID")} entry
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Sebelumnya
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Berikutnya
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}
