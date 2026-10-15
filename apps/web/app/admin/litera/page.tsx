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
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Sparkles,
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
    </div>
  );
}
