"use client";

// Step 1 — search input + hasil check. Section paling atas + kartu utama.
// Modern touch: hero search input yang besar, allowed_zones chips animasi
// muncul, result grid dengan card yang punya hover elevation.

import { AlertCircle, Globe2, Loader2, Search, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CheckEntry } from "./_types";
import { ResultCard } from "./_result-card";

export function SearchSection(props: {
  domain: string;
  setDomain: (v: string) => void;
  onCheck: () => void;
  checking: boolean;
  allowedZones: string[];
  results: CheckEntry[] | null;
  selected: CheckEntry | null;
  onSelect: (e: CheckEntry) => void;
  err: string | null;
}) {
  const {
    domain, setDomain, onCheck, checking, allowedZones,
    results, selected, onSelect, err,
  } = props;

  const showMultiGrid = results !== null && results.length > 1;
  const showSingleCard = results !== null && results.length === 1;
  const showEmpty = results !== null && results.length === 0;
  const availableCount = results?.filter((r) => r.available).length ?? 0;
  // Chip TLD muncul saat user butuh guidance: pre-search, empty state, atau
  // browsing multi-result. Hide waktu single-card (fokus ke card, hindari
  // duplikasi info). Ini fix bug user bingung waktu results = [].
  const showZoneHint = allowedZones.length > 0 && !showSingleCard;

  // Deteksi TLD yang user ketik (kalau ada '.') — untuk pesan empty spesifik.
  const inputHasTld = domain.includes(".");
  const inputTld = inputHasTld
    ? domain.trim().toLowerCase().split(".").slice(1).join(".")
    : null;
  const inputTldNotAllowed =
    inputTld !== null && allowedZones.length > 0 && !allowedZones.includes(inputTld);

  return (
    <Card className="overflow-hidden border-2 shadow-sm">
      <CardContent className="p-5 sm:p-6">
        {/* Search input hero */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Globe2 className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="myblog atau myblog.id"
              className="h-12 pl-12 text-base font-medium"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onCheck();
                }
              }}
              aria-label="Nama domain"
            />
          </div>
          <Button
            onClick={onCheck}
            disabled={checking || !domain.trim()}
            className="h-12 gap-2 px-6 text-base font-semibold shadow-sm"
          >
            {checking ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Mencari…
              </>
            ) : (
              <>
                <Search className="size-4" />
                Cek
              </>
            )}
          </Button>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Ketik <strong className="text-foreground">nama saja</strong> untuk cek di semua TLD sekaligus,
          atau lengkap dengan extension untuk cek satu.
        </p>

        {/* Allowed-zone chips — hint pre-search. */}
        {showZoneHint && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed bg-muted/30 p-3">
            <span className="mr-1 text-xs font-medium text-muted-foreground">
              TLD tersedia:
            </span>
            {allowedZones.map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => {
                  // Extract SLD saja (bagian sebelum titik pertama) supaya
                  // "myshop.xyz" → klik .id → "myshop.id" (bukan myshop.xyz.id).
                  const sld = (domain.trim().split(".")[0] || "myshop").toLowerCase();
                  setDomain(`${sld}.${z}`);
                }}
                className={cn(
                  "rounded-md border bg-background px-2 py-0.5 font-mono text-xs transition-colors",
                  "hover:border-primary hover:text-primary",
                )}
                title={`Ganti ke .${z}`}
              >
                .{z}
              </button>
            ))}
          </div>
        )}

        {/* Multi-result grid */}
        {showMultiGrid && (
          <div className="mt-5">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Hasil pencarian
                </p>
                <Badge variant="secondary" className="text-[10px]">
                  {results.length} TLD
                </Badge>
                {availableCount > 0 && (
                  <Badge variant="success" className="text-[10px]">
                    {availableCount} tersedia
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                Klik yang tersedia untuk lanjut
              </span>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {results.map((r) => (
                <ResultCard
                  key={r.domain}
                  entry={r}
                  active={selected?.domain === r.domain}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        )}

        {/* Single-result card — full domain OR SLD dengan 1 allowed zone. */}
        {showSingleCard && (
          <div className="mt-5">
            <ResultCard
              entry={results[0]}
              active={selected?.domain === results[0].domain}
              variant="wide"
              onSelect={onSelect}
            />
          </div>
        )}

        {/* Empty state — backend return [] (semua zone disable ATAU TLD user
            tidak di-allow). Tanpa ini user cuma lihat blank + bingung. */}
        {showEmpty && (
          <div className="mt-5 rounded-xl border border-dashed bg-muted/30 p-5">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                <SearchX className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-sm font-semibold">
                  {inputTldNotAllowed
                    ? `Ekstensi .${inputTld} belum dilayani`
                    : allowedZones.length === 0
                      ? "Belum ada zona domain aktif"
                      : "Tidak ada hasil untuk pencarian ini"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {inputTldNotAllowed
                    ? "Coba salah satu TLD di atas — klik untuk isi otomatis."
                    : allowedZones.length === 0
                      ? "Belum ada TLD yang di-aktifkan admin. Hubungi admin atau coba lagi nanti."
                      : "Registrar tidak mengembalikan pilihan. Coba nama lain atau ubah TLD."}
                </p>
              </div>
            </div>
          </div>
        )}

        {err && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{err}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
