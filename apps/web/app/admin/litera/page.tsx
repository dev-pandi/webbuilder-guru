"use client";

// Admin Litera — tabbed page: Config (credentials + smart contract defaults)
// + Intents (list artikel yang Litera-enabled, retry untuk soft-failed).
//
// Backend endpoints:
//   GET  /api/v1/admin/litera/config
//   PATCH /api/v1/admin/litera/config
//   GET  /api/v1/admin/litera/intents
//   POST /api/v1/admin/articles/:id/litera-retry

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  CircleAlert,
  Clock,
  Code,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Info,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { Pagination, useDebounced, type PaginatedResult } from "@/components/Pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type LiteraConfig = {
  api_key_masked: string;
  api_key_set: boolean;
  base_url: string;
  collection_name: string;
  default_price: number;
  default_fee_enabled: boolean;
  default_max_minted: number;
  default_user_reward: number;
  default_creator_mint_reward: number;
  default_creator_approve_reward: number;
  enabled: boolean;
  updated_at: string;
};

type LiteraIntent = {
  id: string;
  site_id: string;
  rubric: string;
  slug: string;
  title: string;
  litera_enabled: boolean;
  litera_intent_id: string;
  litera_registered_at: string | null;
  litera_register_error: string;
  site_name: string;
  site_slug: string;
  owner_email: string;
  created_at: string;
};

export default function AdminLiteraPage() {
  const [tab, setTab] = useState<"config" | "intents">("config");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Sparkles className="size-6 text-indigo-500" /> Litera NFT Publishing
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Integrasi platform NFT edukatif Literaa (Polygon). Konfigurasi
            credentials + smart contract defaults + monitor artikel yang
            terdaftar.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-6">
          {(["config", "intents"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`relative py-2.5 text-sm font-medium transition ${
                tab === t
                  ? "text-indigo-600"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {t === "config" ? "Konfigurasi" : "Artikel Terdaftar"}
              {tab === t && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 bg-indigo-600" />
              )}
            </button>
          ))}
        </nav>
      </div>

      {tab === "config" ? <ConfigForm /> : <IntentsList />}
    </div>
  );
}

// =========================== CONFIG FORM ===========================

function ConfigForm() {
  const [cfg, setCfg] = useState<LiteraConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Local draft — pisah dari server state supaya user bisa edit tanpa overwrite
  // immediate.
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [baseURL, setBaseURL] = useState("");
  const [collectionName, setCollectionName] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [price, setPrice] = useState(0);
  const [feeEnabled, setFeeEnabled] = useState(false);
  const [maxMinted, setMaxMinted] = useState(100);
  const [userReward, setUserReward] = useState(0);
  const [creatorMintReward, setCreatorMintReward] = useState(0);
  const [creatorApproveReward, setCreatorApproveReward] = useState(0);
  const [apiKeyDirty, setApiKeyDirty] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const r = await api<LiteraConfig>("/api/v1/admin/litera/config");
      setCfg(r);
      setBaseURL(r.base_url);
      setCollectionName(r.collection_name);
      setEnabled(r.enabled);
      setPrice(r.default_price);
      setFeeEnabled(r.default_fee_enabled);
      setMaxMinted(r.default_max_minted);
      setUserReward(r.default_user_reward);
      setCreatorMintReward(r.default_creator_mint_reward);
      setCreatorApproveReward(r.default_creator_approve_reward);
      setApiKey("");
      setApiKeyDirty(false);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function save() {
    setSaving(true);
    try {
      // Hanya kirim api_key kalau user edit (dirty). Supaya tidak overwrite
      // dengan string kosong atau mask.
      const payload: Record<string, unknown> = {
        base_url: baseURL,
        collection_name: collectionName,
        enabled,
        default_price: price,
        default_fee_enabled: feeEnabled,
        default_max_minted: maxMinted,
        default_user_reward: userReward,
        default_creator_mint_reward: creatorMintReward,
        default_creator_approve_reward: creatorApproveReward,
      };
      if (apiKeyDirty) {
        payload.api_key = apiKey;
      }
      await api("/api/v1/admin/litera/config", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      toast.success("Konfigurasi Litera disimpan");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function resetDefaults() {
    if (!confirm("Reset smart contract defaults ke rekomendasi doc?")) return;
    setPrice(0);
    setFeeEnabled(false);
    setMaxMinted(100);
    setUserReward(0);
    setCreatorMintReward(0);
    setCreatorApproveReward(0);
  }

  if (loading && !cfg) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Memuat konfigurasi…
      </div>
    );
  }

  if (err) {
    return (
      <Card className="border-destructive/50 bg-destructive/5 p-4">
        <div className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{err}</span>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      {/* Credentials */}
      <Card className="p-6">
        <div className="mb-4">
          <h3 className="text-base font-semibold">Credentials</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            API key disediakan oleh Literaa. Simpan aman — key setara wallet
            publisher.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2 space-y-1.5">
            <Label htmlFor="api_key">API Key</Label>
            <div className="relative">
              <Input
                id="api_key"
                type={showKey ? "text" : "password"}
                value={apiKeyDirty ? apiKey : cfg?.api_key_masked ?? ""}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setApiKeyDirty(true);
                }}
                placeholder={cfg?.api_key_set ? "••••••••" : "lit_sk_..."}
                className="pr-10 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-slate-100"
              >
                {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {cfg?.api_key_set
                ? `Tersimpan. Isi ulang untuk ganti; biarkan kosong untuk pakai yang sudah ada.`
                : "Belum di-set. Ambil dari dashboard Literaa → Creator → Domain & API Key."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="base_url">Base URL API</Label>
            <Input
              id="base_url"
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="enabled">Status</Label>
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  id="enabled"
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="peer sr-only"
                />
                <span className="h-5 w-9 rounded-full bg-slate-300 transition peer-checked:bg-emerald-500" />
                <span className="absolute left-0.5 top-0.5 size-4 rounded-full bg-white transition peer-checked:translate-x-4" />
              </label>
              <span className="text-sm font-medium">
                {enabled ? "Aktif" : "Nonaktif"}
              </span>
              <span className="ml-auto text-[11px] text-muted-foreground">
                {enabled
                  ? "Register artikel otomatis saat publish"
                  : "Tombol di form editor hidden"}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Collection */}
      <Card className="p-6">
        <div className="mb-4">
          <h3 className="text-base font-semibold">Koleksi</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Nama koleksi induk yang terlihat di marketplace Literaa.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="collection">Nama Koleksi</Label>
          <Input
            id="collection"
            value={collectionName}
            onChange={(e) => setCollectionName(e.target.value)}
          />
        </div>
      </Card>

      {/* Smart Contract Defaults */}
      <Card className="p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Smart Contract Defaults</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Parameter ekonomi token (
              <code className="rounded bg-slate-100 px-1 text-xs">Writer.sol</code>) yang
              diset ke setiap artikel. Untuk model edukasi, biarkan 0.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={resetDefaults}>
            <RefreshCw className="mr-1 size-3.5" />
            Reset
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="price">Price (LITE)</Label>
            <Input
              id="price"
              type="number"
              value={price}
              onChange={(e) => setPrice(parseInt(e.target.value || "0", 10))}
            />
            <p className="text-[11px] text-muted-foreground">
              0 = free claim (direkomendasikan untuk siswa).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fee">Fee Enabled</Label>
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  id="fee"
                  type="checkbox"
                  checked={feeEnabled}
                  onChange={(e) => setFeeEnabled(e.target.checked)}
                  className="peer sr-only"
                />
                <span className="h-5 w-9 rounded-full bg-slate-300 transition peer-checked:bg-indigo-500" />
                <span className="absolute left-0.5 top-0.5 size-4 rounded-full bg-white transition peer-checked:translate-x-4" />
              </label>
              <span className="text-sm">{feeEnabled ? "Aktif" : "Nonaktif"}</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="max_minted">Max Minted</Label>
            <Input
              id="max_minted"
              type="number"
              value={maxMinted}
              onChange={(e) => setMaxMinted(parseInt(e.target.value || "0", 10))}
            />
            <p className="text-[11px] text-muted-foreground">
              Batas kolektor per artikel. 0 = unlimited.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="user_reward">User Reward (LITE)</Label>
            <Input
              id="user_reward"
              type="number"
              value={userReward}
              onChange={(e) => setUserReward(parseInt(e.target.value || "0", 10))}
            />
            <p className="text-[11px] text-muted-foreground">
              Bonus untuk pembaca saat mint. Butuh deposit pool kalau &gt;0.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="creator_mint">Creator Mint Reward (LITE)</Label>
            <Input
              id="creator_mint"
              type="number"
              value={creatorMintReward}
              onChange={(e) =>
                setCreatorMintReward(parseInt(e.target.value || "0", 10))
              }
            />
            <p className="text-[11px] text-muted-foreground">
              Bonus untuk guru per NFT yang diklaim.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="creator_approve">Creator Approve Reward (LITE)</Label>
            <Input
              id="creator_approve"
              type="number"
              value={creatorApproveReward}
              onChange={(e) =>
                setCreatorApproveReward(parseInt(e.target.value || "0", 10))
              }
            />
            <p className="text-[11px] text-muted-foreground">
              Bonus verifikator saat approve. 0 = alur otomatis.
            </p>
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" /> Menyimpan…
            </>
          ) : (
            <>
              <Save className="mr-2 size-4" /> Simpan Konfigurasi
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// =========================== INTENTS LIST ===========================

type LiteraPreview = {
  article: {
    id: string;
    title: string;
    rubric: string;
    slug: string;
    excerpt: string;
    cover_image_url: string;
    status: string;
    litera_enabled: boolean;
    litera_intent_id: string;
    litera_registered_at: string | null;
    litera_unlockable_url: string;
    litera_unlockable_description: string;
    litera_quiz_json: unknown;
  };
  site: {
    id: string;
    name: string;
    slug: string;
    primary_hostname: string;
    has_hostname: boolean;
    hostname_source: string; // "primary_hostname" | "anchor_purchased" | "anchor_pending:<status>" | "none"
    hostname_pending: boolean;
  };
  canonical_url: string;
  payload_preview: Record<string, unknown> | null;
  // null = hostname belum pernah didaftarkan ke CORS allowlist Litera.
  litera_domain: {
    hostname: string;
    status: string; // "registered" | "failed"
    auto_approved: boolean;
    last_error: string;
    registered_at: string | null;
    checked_at: string;
  } | null;
  error: {
    message: string;
    category: string;
    hint: string;
  };
};

function IntentsList() {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("newest");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [data, setData] = useState<PaginatedResult<LiteraIntent> | null>(null);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, sort, status]);

  async function refresh() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: "20",
        sort,
      });
      if (debouncedQ) params.set("q", debouncedQ);
      if (status) params.set("status", status);
      const r = await api<PaginatedResult<LiteraIntent>>(
        `/api/v1/admin/litera/intents?${params}`,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedQ, sort, status]);

  async function retry(id: string, title: string) {
    setRetrying(id);
    try {
      await api(`/api/v1/admin/articles/${id}/litera-retry`, {
        method: "POST",
      });
      toast.success(`Retry dijadwalkan untuk "${title}"`);
      setTimeout(refresh, 1500);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRetrying(null);
    }
  }

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cari judul, slug, atau email pengguna…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Semua status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              <SelectItem value="registered">Terdaftar</SelectItem>
              <SelectItem value="pending">Diproses</SelectItem>
              <SelectItem value="failed">Gagal</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Terbaru</SelectItem>
              <SelectItem value="oldest">Terlama</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {err && (
        <Card className="border-destructive/50 bg-destructive/5 p-4">
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{err}</span>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Artikel</TableHead>
              <TableHead>Pengguna &amp; Situs</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Didaftarkan</TableHead>
              <TableHead className="pr-5 text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={loading ? "opacity-60" : ""}>
            {items.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  {debouncedQ
                    ? `Tidak ada hasil untuk "${debouncedQ}".`
                    : "Belum ada artikel yang terdaftar di Litera."}
                </TableCell>
              </TableRow>
            ) : (
              items.map((it) => {
                const isRegistered = !!it.litera_intent_id;
                const isFailed = !!it.litera_register_error && !isRegistered;
                return (
                  <TableRow key={it.id}>
                    <TableCell className="pl-5">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium">{it.title}</span>
                        <code className="text-[10px] text-muted-foreground">
                          {it.rubric}/{it.slug}
                        </code>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5 text-sm">
                        <span className="truncate">{it.owner_email}</span>
                        <Link
                          href={`/sites/${it.site_id}`}
                          className="truncate text-xs text-muted-foreground hover:underline"
                        >
                          📁 {it.site_name}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell>
                      {isRegistered ? (
                        <Badge className="gap-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                          <CheckCircle2 className="size-3" />
                          Terdaftar
                        </Badge>
                      ) : isFailed ? (
                        <div className="flex flex-col gap-0.5">
                          <Badge variant="destructive" className="gap-1">
                            <CircleAlert className="size-3" />
                            Gagal
                          </Badge>
                          <p className="line-clamp-2 max-w-xs text-[10px] text-rose-700">
                            {it.litera_register_error}
                          </p>
                        </div>
                      ) : (
                        <Badge className="gap-1 bg-amber-100 text-amber-800 hover:bg-amber-100">
                          <Clock className="size-3" />
                          Diproses
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {it.litera_registered_at
                        ? new Date(it.litera_registered_at).toLocaleString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDetailId(it.id)}
                          title="Lihat detail payload & error"
                        >
                          <Info className="mr-1 size-3" />
                          Detail
                        </Button>
                        {isRegistered && (
                          <a
                            href={`https://literaa.xyz/creator?articleUrl=${encodeURIComponent(
                              `https://${it.site_slug}/${it.rubric}/${it.slug}`,
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                            title="Buka di Literaa Creator"
                          >
                            Buka <ExternalLink className="size-3" />
                          </a>
                        )}
                        {isFailed && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => retry(it.id, it.title)}
                            disabled={retrying === it.id}
                          >
                            {retrying === it.id ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <>
                                <RefreshCw className="mr-1 size-3" />
                                Retry
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {data && data.total_pages > 1 && (
        <Pagination
          page={data.page}
          totalPages={data.total_pages}
          total={data.total}
          pageSize={data.page_size}
          onPage={setPage}
        />
      )}

      {detailId && (
        <DetailModal
          id={detailId}
          onClose={() => setDetailId(null)}
          onRetry={() => {
            const row = items.find((x) => x.id === detailId);
            if (row) retry(row.id, row.title);
          }}
        />
      )}
    </div>
  );
}

// =========================== DETAIL MODAL ===========================

function DetailModal({
  id,
  onClose,
  onRetry,
}: {
  id: string;
  onClose: () => void;
  onRetry: () => void;
}) {
  const [data, setData] = useState<LiteraPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api<LiteraPreview>(`/api/v1/admin/articles/${id}/litera-preview`)
      .then((d) => {
        setData(d);
        setErr(null);
      })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  // Close on escape
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-3xl rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">Detail Pendaftaran Litera</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Payload, status, dan analisis error.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="shrink-0">
            <X className="size-4" />
          </Button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-6">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Memuat detail…
            </div>
          )}

          {err && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{err}</span>
            </div>
          )}

          {data && (
            <div className="space-y-6">
              {/* Status + Error */}
              {data.error.message ? (
                <section className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <div className="flex items-start gap-3">
                    <CircleAlert className="mt-0.5 size-5 shrink-0 text-rose-600" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-rose-900">
                        Pendaftaran Gagal
                      </h3>
                      <p className="mt-1 font-mono text-xs text-rose-800">
                        {data.error.message}
                      </p>
                      {data.error.hint && (
                        <div className="mt-3 rounded-lg bg-white/70 p-3 ring-1 ring-rose-200">
                          <div className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase text-rose-700">
                            <Info className="size-3" />
                            Cara perbaiki ({data.error.category})
                          </div>
                          <p className="text-sm text-rose-900">{data.error.hint}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              ) : data.article.litera_intent_id ? (
                <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-emerald-900">
                        Terdaftar di Litera
                      </h3>
                      <p className="mt-1 text-sm text-emerald-800">
                        Intent ID:{" "}
                        <code className="rounded bg-white/70 px-2 py-0.5 font-mono text-xs">
                          {data.article.litera_intent_id}
                        </code>
                      </p>
                    </div>
                  </div>
                </section>
              ) : (
                <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-start gap-3">
                    <Clock className="mt-0.5 size-5 shrink-0 text-amber-600" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-amber-900">
                        Belum terdaftar / sedang diproses
                      </h3>
                    </div>
                  </div>
                </section>
              )}

              {/* Site + Hostname */}
              <section>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <FileText className="size-4 text-muted-foreground" />
                  Site & Domain Publik
                </h3>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5">
                    <dt className="font-medium text-muted-foreground">Nama Site:</dt>
                    <dd>{data.site.name}</dd>
                    <dt className="font-medium text-muted-foreground">
                      Hostname Efektif:
                    </dt>
                    <dd>
                      {data.site.has_hostname ? (
                        <div className="flex flex-col gap-0.5">
                          <code
                            className={`w-fit rounded px-1.5 py-0.5 font-mono text-xs ${
                              data.site.hostname_pending
                                ? "bg-amber-100 text-amber-900 line-through"
                                : "bg-white"
                            }`}
                          >
                            {data.site.primary_hostname}
                          </code>
                          <span className="text-[10px] text-muted-foreground">
                            {data.site.hostname_source === "primary_hostname" &&
                              "Sumber: Primary hostname (user set manual)"}
                            {data.site.hostname_source === "anchor_purchased" &&
                              "Sumber: Domain yang dibeli (fallback otomatis, status aktif)"}
                            {data.site.hostname_source.startsWith("anchor_pending") &&
                              `Sumber: Domain yang dibeli — tapi status ${data.site.hostname_source.replace(
                                "anchor_pending:",
                                "",
                              )}`}
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                          <CircleAlert className="size-3" />
                          Belum ada domain
                        </span>
                      )}
                    </dd>
                    <dt className="font-medium text-muted-foreground">
                      Canonical URL:
                    </dt>
                    <dd>
                      {data.canonical_url ? (
                        <code className="break-all rounded bg-white px-1.5 py-0.5 font-mono text-xs">
                          {data.canonical_url}
                        </code>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">
                          Belum bisa dibangun — belum ada domain
                        </span>
                      )}
                    </dd>
                  </dl>
                  {!data.site.has_hostname && (
                    <div className="mt-3 rounded-lg bg-rose-50 p-3 ring-1 ring-rose-200">
                      <div className="text-[11px] font-bold uppercase text-rose-700">
                        Site tidak terhubung ke domain apapun
                      </div>
                      <p className="mt-1 text-xs text-rose-900 leading-relaxed">
                        Normalnya 1 site = 1 domain. Site ini belum punya
                        domain purchase sama sekali di tabel{" "}
                        <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px]">
                          domain_purchases
                        </code>
                        . Kemungkinan data corruption atau site dibuat tanpa
                        beli domain.
                      </p>
                    </div>
                  )}
                  {data.site.hostname_pending && (
                    <div className="mt-3 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200">
                      <div className="text-[11px] font-bold uppercase text-amber-700">
                        Domain masih dalam proses
                      </div>
                      <p className="mt-1 text-xs text-amber-900 leading-relaxed">
                        Site sudah beli domain{" "}
                        <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px]">
                          {data.site.primary_hostname}
                        </code>
                        , tapi statusnya belum{" "}
                        <code className="font-mono">active</code>. Litera
                        TIDAK akan diaftarkan sekarang (akan 403 CORS kalau
                        dipaksa).
                      </p>
                      <p className="mt-2 text-xs text-amber-900">
                        <strong>Fix:</strong> tunggu domain purchase selesai
                        provisioning (biasanya 1-5 menit). Setelah status
                        active, klik Retry di bawah.
                      </p>
                    </div>
                  )}
                  {data.site.hostname_source === "anchor_purchased" && (
                    <div className="mt-3 rounded-lg bg-emerald-50 p-2.5 ring-1 ring-emerald-200">
                      <p className="text-[11px] text-emerald-900">
                        <strong>✓ Fallback otomatis bekerja:</strong> site
                        belum klik "Set as Primary" tapi punya domain yang
                        dibeli. Litera pakai domain itu sebagai canonical URL.
                        Guru bisa override di Settings site → Domain kalau mau.
                      </p>
                    </div>
                  )}

                  {data.site.has_hostname && (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                      <div className="mb-1.5 text-[11px] font-bold uppercase text-muted-foreground">
                        CORS allowlist Litera
                      </div>
                      {!data.litera_domain ? (
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Domain ini belum pernah didaftarkan ke Litera. Itu
                          normal — pendaftaran berjalan otomatis saat artikel
                          pertama dari domain ini dipublikasikan.
                        </p>
                      ) : data.litera_domain.status === "registered" ? (
                        <p className="text-xs text-emerald-900 leading-relaxed">
                          <strong>✓ Terdaftar</strong>
                          {data.litera_domain.auto_approved
                            ? " (auto-approved)"
                            : " (menunggu persetujuan Litera)"}
                          {data.litera_domain.registered_at && (
                            <>
                              {" "}
                              pada{" "}
                              {new Date(
                                data.litera_domain.registered_at,
                              ).toLocaleString("id-ID")}
                            </>
                          )}
                          .
                        </p>
                      ) : (
                        <>
                          <p className="text-xs text-rose-900 leading-relaxed">
                            <strong>Pendaftaran gagal.</strong> Artikel tidak
                            akan dikirim sampai domain masuk allowlist.
                          </p>
                          {data.litera_domain.last_error && (
                            <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap rounded bg-rose-50 p-2 font-mono text-[11px] text-rose-900">
                              {data.litera_domain.last_error}
                            </pre>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {/* Payload Preview */}
              <section>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Code className="size-4 text-muted-foreground" />
                  Payload ke Litera {data.site.has_hostname ? "" : "(preview — belum terkirim)"}
                </h3>
                {!data.site.has_hostname && data.payload_preview && (
                  <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900">
                    Ini preview payload yang akan dikirim. Field{" "}
                    <code className="font-mono font-bold">articleUrl</code> masih
                    placeholder karena site belum punya primary hostname.
                    Semua field lain (title, author, cover, smart contract
                    defaults) sudah benar — tinggal set hostname lalu Retry.
                  </div>
                )}
                {data.payload_preview ? (
                  <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-900 p-4 text-xs text-slate-100">
                    {JSON.stringify(data.payload_preview, null, 2)}
                  </pre>
                ) : (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
                    Payload belum bisa di-generate — Litera client tidak
                    tersedia. Buka{" "}
                    <Link href="/admin/litera" className="font-bold underline">
                      /admin/litera → Konfigurasi
                    </Link>{" "}
                    dan pastikan API key sudah terisi + status Aktif.
                  </div>
                )}
              </section>

              {/* Konten source */}
              <section>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <FileText className="size-4 text-muted-foreground" />
                  Konten Artikel (sumber)
                </h3>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5">
                    <dt className="font-medium text-muted-foreground">Judul:</dt>
                    <dd>{data.article.title}</dd>
                    <dt className="font-medium text-muted-foreground">Ringkasan:</dt>
                    <dd>
                      {data.article.excerpt || (
                        <span className="text-rose-700 italic">(kosong)</span>
                      )}
                    </dd>
                    <dt className="font-medium text-muted-foreground">Cover:</dt>
                    <dd>
                      {data.article.cover_image_url ? (
                        <code className="break-all font-mono text-xs">
                          {data.article.cover_image_url}
                        </code>
                      ) : (
                        <span className="text-rose-700 italic">(kosong)</span>
                      )}
                    </dd>
                    <dt className="font-medium text-muted-foreground">Unlockable:</dt>
                    <dd>
                      {data.article.litera_unlockable_url ? (
                        <code className="break-all font-mono text-xs">
                          {data.article.litera_unlockable_url}
                        </code>
                      ) : (
                        <span className="text-muted-foreground italic">
                          Tidak ada
                        </span>
                      )}
                    </dd>
                  </dl>
                </div>
              </section>
            </div>
          )}
        </div>

        {data && !data.article.litera_intent_id && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-3">
            <Button variant="outline" onClick={onClose}>
              Tutup
            </Button>
            <Button onClick={onRetry}>
              <RefreshCw className="mr-1.5 size-4" />
              Retry Pendaftaran
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
