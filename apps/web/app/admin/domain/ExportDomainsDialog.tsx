"use client";

// Export CSV domain secara bertahap: backend mengirim maks 2.000 baris per
// request + cursor keyset, browser menyambung potongannya jadi satu file.
// Tidak ada request panjang yang bisa kena timeout, progres terlihat, dan
// kalau satu potongan gagal setelah retry, export bisa dilanjutkan dari
// potongan itu — bukan mulai dari nol.

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Download, Filter, Globe2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { API_BASE, getAccessToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

type Scope = "filtered" | "all";

type Job = {
  query: string;
  scope: Scope;
  parts: Blob[];
  cursor: string;
  done: number;
  total: number | null;
};

// 4xx selain 429 tidak akan sembuh dengan diulang.
class FatalExportError extends Error {}

const MAX_ATTEMPTS = 3;

export function ExportDomainsDialog({
  open,
  onOpenChange,
  filterQuery,
  filterCount,
  filteredTotal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filterQuery: string;
  filterCount: number;
  filteredTotal: number | null;
}) {
  const [scope, setScope] = useState<Scope>("filtered");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number | null }>({
    done: 0,
    total: null,
  });
  const [err, setErr] = useState<string | null>(null);
  const jobRef = useRef<Job | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Buka ulang = mulai bersih; sisa job gagal sebelumnya dibuang.
  useEffect(() => {
    if (!open) return;
    jobRef.current = null;
    setErr(null);
    setProgress({ done: 0, total: null });
    setScope(filterCount > 0 ? "filtered" : "all");
  }, [open, filterCount]);

  async function run(job: Job) {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRunning(true);
    setErr(null);
    try {
      do {
        const chunk = await fetchChunk(job.query, job.cursor, ctrl.signal);
        job.parts.push(chunk.blob);
        job.done += chunk.rows;
        if (chunk.total !== null) job.total = chunk.total;
        job.cursor = chunk.next;
        setProgress({ done: job.done, total: job.total });
      } while (job.cursor);

      saveBlob(new Blob(job.parts, { type: "text/csv;charset=utf-8" }), fileName(job.scope));
      toast.success(`${job.done.toLocaleString("id-ID")} domain diekspor`);
      jobRef.current = null;
      onOpenChange(false);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      // Error permanen (sesi habis, filter tidak valid) tidak ditawari Lanjutkan.
      if (e instanceof FatalExportError) jobRef.current = null;
      setErr((e as Error).message || "Export gagal");
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      setRunning(false);
    }
  }

  function start() {
    const job: Job = {
      query: scope === "filtered" ? filterQuery : "",
      scope,
      parts: [],
      cursor: "",
      done: 0,
      total: null,
    };
    jobRef.current = job;
    setProgress({ done: 0, total: null });
    void run(job);
  }

  function cancel() {
    abortRef.current?.abort();
    jobRef.current = null;
    setRunning(false);
    setProgress({ done: 0, total: null });
    toast("Export dibatalkan");
  }

  const pct =
    progress.total && progress.total > 0
      ? Math.min(100, Math.round((progress.done / progress.total) * 100))
      : 0;
  const resumable = !running && err !== null && jobRef.current !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Menutup dialog di tengah jalan akan membuang potongan yang sudah
        // diunduh — arahkan ke tombol Batal yang eksplisit.
        if (!o && running) return;
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export CSV</DialogTitle>
          <DialogDescription>
            Data diambil bertahap per 2.000 baris, jadi aman untuk jumlah domain yang
            besar. Tanggal memakai WIB.
          </DialogDescription>
        </DialogHeader>

        {!running && !resumable && (
          <div className="grid gap-2">
            {filterCount > 0 && (
              <ScopeOption
                active={scope === "filtered"}
                onClick={() => setScope("filtered")}
                icon={<Filter className="size-4" />}
                title="Sesuai filter saat ini"
                hint={
                  filteredTotal !== null
                    ? `${filteredTotal.toLocaleString("id-ID")} domain · ${filterCount} filter aktif`
                    : `${filterCount} filter aktif`
                }
              />
            )}
            <ScopeOption
              active={scope === "all"}
              onClick={() => setScope("all")}
              icon={<Globe2 className="size-4" />}
              title="Semua domain"
              hint="Seluruh domain di platform, tanpa filter"
            />
          </div>
        )}

        {(running || resumable) && (
          <div className="space-y-2" aria-live="polite">
            <Progress value={pct} />
            <p className="text-sm tabular-nums text-muted-foreground">
              {progress.total === null
                ? "Menyiapkan…"
                : `${Math.min(progress.done, progress.total).toLocaleString("id-ID")} dari ${progress.total.toLocaleString("id-ID")} domain (${pct}%)`}
            </p>
          </div>
        )}

        {err && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>
              {err}
              {resumable && " Data yang sudah terambil disimpan — klik Lanjutkan."}
            </span>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {running ? (
            <Button variant="outline" onClick={cancel}>
              Batal
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Tutup
            </Button>
          )}
          {resumable ? (
            <Button onClick={() => jobRef.current && run(jobRef.current)} className="gap-1.5">
              <Download className="size-3.5" />
              Lanjutkan
            </Button>
          ) : (
            <Button onClick={start} disabled={running} className="gap-1.5">
              {running ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              {running ? "Mengekspor…" : "Mulai export"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScopeOption({
  active,
  onClick,
  icon,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
        (active ? "border-primary bg-primary/5" : "hover:bg-muted/50")
      }
    >
      <span className={"mt-0.5 " + (active ? "text-primary" : "text-muted-foreground")}>{icon}</span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

async function fetchChunk(
  query: string,
  cursor: string,
  signal: AbortSignal,
): Promise<{ blob: Blob; rows: number; next: string; total: number | null }> {
  const params = new URLSearchParams(query);
  if (cursor) params.set("cursor", cursor);
  for (let attempt = 1; ; attempt++) {
    try {
      const t = getAccessToken();
      const res = await fetch(`${API_BASE}/api/v1/admin/domains/export?${params}`, {
        headers: t ? { Authorization: `Bearer ${t}` } : {},
        cache: "no-store",
        signal,
      });
      if (res.ok) {
        const total = res.headers.get("X-Total-Count");
        return {
          // blob(), bukan text(): text() membuang BOM yang dibutuhkan Excel.
          blob: await res.blob(),
          rows: Number(res.headers.get("X-Row-Count") ?? 0),
          next: res.headers.get("X-Next-Cursor") ?? "",
          total: total === null ? null : Number(total),
        };
      }
      let msg = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body?.error?.message) msg = body.error.message;
      } catch {
        // body bukan JSON
      }
      if (res.status === 401) {
        throw new FatalExportError("Sesi login berakhir. Muat ulang halaman, login lagi, lalu export ulang.");
      }
      if (res.status < 500 && res.status !== 429) throw new FatalExportError(msg);
      throw new Error(msg);
    } catch (e) {
      if (signal.aborted || e instanceof FatalExportError || attempt >= MAX_ATTEMPTS) {
        if (!(e instanceof FatalExportError) && !signal.aborted) {
          throw new Error(`Gagal mengambil data setelah ${MAX_ATTEMPTS} percobaan (${(e as Error).message}).`);
        }
        throw e;
      }
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    }
  }
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke langsung bisa membatalkan unduhan di sebagian browser.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function fileName(scope: Scope): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `domain-${scope === "all" ? "semua" : "terfilter"}-${stamp}.csv`;
}
