"use client";

// Halaman polling status pembelian domain.
//
// Flow:
//   1. Halaman mount → GET /domains/purchases/:job_id (memicu refresh dari registrar)
//   2. Loop polling tiap 5s sampai status jadi terminal (active / failed / expired)
//      → interval turun ke 2s selama pending_payment supaya payment_url cepat
//        muncul begitu registrar-api generate.
//   3. Kalau status=active → tampilkan inline template picker → user pilih →
//      POST /sites/from-template/:slug lalu POST /domains/purchases/:job_id/attach
//      → navigate ke editor situs.

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  ArrowRight,
  ChevronLeft,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { api, getAccessToken, clearTokens } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type Purchase = {
  job_id: string;
  domain: string;
  status: string;
  payment_url?: string;
};

type Template = {
  slug: string;
  category: string;
  variant: string;
  name: string;
  description: string;
};

// Copy per status — Indonesia-friendly, jelas action yang harus user lakukan.
const STATUS_INFO: Record<string, { label: string; hint: string; kind: "wait" | "ok" | "bad" }> = {
  pending_payment: {
    label: "Menunggu pembayaran",
    hint: "Klik tombol di bawah untuk bayar via gateway. Halaman ini akan refresh otomatis.",
    kind: "wait",
  },
  pending_document: {
    label: "Menunggu dokumen",
    hint: "Registrar meminta upload KTP/NPWP. Fitur upload akan segera dibuka.",
    kind: "wait",
  },
  pending_provisioning: {
    label: "Sedang diproses registrar",
    hint: "Pembayaran diterima. Domain sedang di-daftarkan ke registry (biasanya 1–5 menit).",
    kind: "wait",
  },
  active: {
    label: "Domain aktif",
    hint: "Domain Anda sudah live. Pilih template di bawah untuk buat situs.",
    kind: "ok",
  },
  failed: {
    label: "Gagal",
    hint: "Pendaftaran domain gagal. Cek pesan detail di bawah.",
    kind: "bad",
  },
  expired: {
    label: "Kadaluwarsa",
    hint: "Batas waktu pembayaran habis. Silakan coba beli lagi.",
    kind: "bad",
  },
};

function isTerminal(status: string) {
  return status === "active" || status === "failed" || status === "expired";
}

export default function PendingDomainPage() {
  const router = useRouter();
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;

  const [ready, setReady] = useState(false);
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auth guard.
  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/login");
      return;
    }
    api("/api/v1/auth/me")
      .then(() => setReady(true))
      .catch(() => {
        clearTokens();
        router.replace("/login");
      });
  }, [router]);

  // Polling loop.
  useEffect(() => {
    if (!ready || !jobId) return;
    let cancelled = false;
    const controller = new AbortController();
    abortRef.current = controller;

    async function fetchOnce() {
      try {
        const p = await api<Purchase>(`/api/v1/domains/purchases/${jobId}`);
        if (cancelled) return;
        setPurchase(p);
        setErr(null);
      } catch (e) {
        if (cancelled) return;
        setErr((e as Error).message);
      }
    }
    fetchOnce();

    const iv = setInterval(() => {
      const cur = purchaseRef.current;
      if (cur && isTerminal(cur.status)) return; // ideally cleared, but idempotent
      fetchOnce();
    }, 3000);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, jobId]);

  // Small ref so setInterval can peek latest state without dependency loop.
  const purchaseRef = useRef<Purchase | null>(null);
  useEffect(() => {
    purchaseRef.current = purchase;
  }, [purchase]);

  const info = purchase ? STATUS_INFO[purchase.status] ?? { label: purchase.status, hint: "", kind: "wait" as const } : null;

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Memuat…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard">
              <ChevronLeft />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
          </Button>
          <span className="text-lg font-semibold">Status Pembelian Domain</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        {err && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{err}</span>
          </div>
        )}

        {/* Status card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {purchase ? (
                <>
                  Domain{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">{purchase.domain}</code>
                </>
              ) : (
                "Memuat status…"
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {purchase && info ? (
              <div className="flex items-start gap-4">
                <StatusIcon kind={info.kind} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold">{info.label}</span>
                    {info.kind === "wait" && (
                      <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{info.hint}</p>

                  {/* Payment action */}
                  {purchase.status === "pending_payment" && purchase.payment_url && (
                    <Button asChild className="mt-4 gap-2">
                      <a href={purchase.payment_url} target="_blank" rel="noopener noreferrer">
                        Buka halaman pembayaran
                        <ExternalLink className="size-4" />
                      </a>
                    </Button>
                  )}
                  {purchase.status === "pending_payment" && !purchase.payment_url && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Menunggu link pembayaran dari gateway… halaman akan refresh otomatis.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Menghubungi registrar…
              </div>
            )}
          </CardContent>
        </Card>

        {/* Template picker — hanya setelah active */}
        {purchase?.status === "active" && (
          <TemplatePicker
            jobId={jobId}
            domain={purchase.domain}
            onCreated={(siteId) => router.push(`/sites/${siteId}/editor`)}
          />
        )}
      </main>
    </div>
  );
}

function StatusIcon({ kind }: { kind: "wait" | "ok" | "bad" }) {
  if (kind === "ok") return <CheckCircle2 className="size-8 text-emerald-500" />;
  if (kind === "bad") return <XCircle className="size-8 text-destructive" />;
  return <Clock className="size-8 text-amber-500" />;
}

// -------------- Template picker (inline, disederhanakan) --------------
// Bukan replikasi wizard 3-step di dashboard — user sudah putuskan beli domain,
// jadi tinggal pilih template + slug default (dari domain) → create.

function TemplatePicker({
  jobId,
  domain,
  onCreated,
}: {
  jobId: string;
  domain: string;
  onCreated: (siteId: string) => void;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const defaultSlug = useMemo(() => domain.split(".")[0], [domain]);
  const [slug, setSlug] = useState(defaultSlug);
  const [name, setName] = useState(defaultSlug);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Template[]>("/api/v1/templates", { auth: false }).then(setTemplates).catch(() => {});
  }, []);

  async function onCreate() {
    if (!selected) return;
    setErr(null);
    setCreating(true);
    try {
      // Backend enforces atomic create + attach: kirim job_id, server verify
      // purchase active + belum di-attach, lalu create site + attach dalam
      // satu request. Kalau job_id tidak valid → 400/404/409 dari server.
      const site = await api<{ id: string; slug: string }>(
        `/api/v1/sites/from-template/${selected}`,
        { method: "POST", body: JSON.stringify({ slug, name, job_id: jobId }) },
      );
      toast.success("Situs berhasil dibuat");
      onCreated(site.id);
    } catch (e) {
      setErr((e as Error).message);
      setCreating(false);
    }
  }

  // Group template by category untuk tampilan lebih rapi.
  const byCategory = useMemo(() => {
    const m: Record<string, Template[]> = {};
    for (const t of templates) {
      (m[t.category] ??= []).push(t);
    }
    return m;
  }, [templates]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" />
          Pilih template untuk <code className="text-xs">{domain}</code>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {Object.entries(byCategory).map(([cat, list]) => (
          <div key={cat}>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {cat}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {list.map((t) => (
                <button
                  key={t.slug}
                  type="button"
                  onClick={() => setSelected(t.slug)}
                  className={`rounded-lg border p-3 text-left transition-colors hover:border-primary ${
                    selected === t.slug ? "border-primary bg-primary/5 ring-1 ring-primary" : ""
                  }`}
                >
                  <div className="text-sm font-medium">{t.name}</div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {t.description}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}

        {selected && (
          <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="slug">Slug (subdomain platform)</Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="myshop"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name">Nama situs</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Toko Bahagia"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <Badge variant="secondary" className="text-xs">
                Domain <code>{domain}</code> akan otomatis di-attach
              </Badge>
              <Button onClick={onCreate} disabled={creating || !slug || !name} className="gap-2">
                {creating ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Membuat…
                  </>
                ) : (
                  <>
                    Buat situs
                    <ArrowRight className="size-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {err && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{err}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
