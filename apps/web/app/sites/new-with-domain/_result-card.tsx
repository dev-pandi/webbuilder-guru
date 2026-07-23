"use client";

// Kartu hasil check per domain. Dipakai di 2 layout:
//   - "compact" (default): grid multi-TLD
//   - "wide": single result (SLD dengan 1 zone, atau input full-domain)
//
// Klik available → onSelect. Disabled + muted visual kalau taken.

import { ArrowRight, CheckCircle2, FileText, Sparkles, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CheckEntry } from "./_types";
import { formatIDR } from "./_helpers";

export function ResultCard({
  entry,
  active,
  variant = "compact",
  onSelect,
}: {
  entry: CheckEntry;
  active: boolean;
  variant?: "compact" | "wide";
  onSelect: (e: CheckEntry) => void;
}) {
  const wide = variant === "wide";

  if (!entry.available) {
    return (
      <div
        className={cn(
          "flex items-start gap-3 rounded-xl border border-dashed border-border/60 bg-muted/20 p-4",
          wide ? "sm:p-5" : "",
        )}
      >
        <XCircle className={cn("mt-0.5 shrink-0 text-muted-foreground/70", wide ? "size-5" : "size-4")} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <code className={cn("text-muted-foreground line-through", wide ? "text-base" : "text-sm")}>
              {entry.domain}
            </code>
            <Badge variant="secondary" className="text-[10px]">
              Dipakai
            </Badge>
          </div>
          {entry.reason && (
            <p className="mt-1 truncate text-xs text-muted-foreground">{entry.reason}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(entry)}
      className={cn(
        "group relative flex items-start gap-3 rounded-xl border p-4 text-left transition-all",
        "hover:shadow-md hover:-translate-y-0.5",
        active
          ? "border-emerald-500 bg-gradient-to-br from-emerald-50 to-emerald-50/50 ring-2 ring-emerald-500/30 shadow-sm dark:from-emerald-950/40 dark:to-emerald-950/20"
          : "border-emerald-200/70 bg-emerald-50/40 hover:border-emerald-400 dark:border-emerald-900/70 dark:bg-emerald-950/20",
        wide ? "sm:p-5" : "",
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full",
          wide ? "size-10" : "size-8",
          "bg-emerald-500/15",
        )}
      >
        <CheckCircle2 className={cn("text-emerald-600 dark:text-emerald-400", wide ? "size-5" : "size-4")} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <code className={cn("font-semibold tracking-tight", wide ? "text-lg" : "text-sm")}>
            {entry.domain}
          </code>
          <Badge variant="success" className="text-[10px] uppercase tracking-wide">
            <Sparkles className="mr-1 size-2.5" />
            Tersedia
          </Badge>
          {entry.zone?.require_document && !entry.zone.nik_auto_approved && (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <FileText className="size-2.5" />
              Perlu KTP
            </Badge>
          )}
        </div>

        {entry.price && (
          <p className={cn("mt-1.5 text-muted-foreground", wide ? "text-sm" : "text-xs")}>
            {wide ? (
              <>
                <span className="text-foreground font-semibold text-base">
                  {formatIDR(entry.price.register, entry.price.currency)}
                </span>
                <span className="mx-1">/tahun</span>
                <span className="text-xs">
                  · Renew {formatIDR(entry.price.renew, entry.price.currency)}
                </span>
              </>
            ) : (
              <>
                <span className="font-semibold text-foreground">
                  {formatIDR(entry.price.register, entry.price.currency)}
                </span>
                <span className="ml-0.5">/thn</span>
              </>
            )}
          </p>
        )}
      </div>

      <ArrowRight
        className={cn(
          "mt-1 size-4 shrink-0 text-emerald-600 transition-transform",
          "group-hover:translate-x-0.5",
          active ? "opacity-100" : "opacity-40 group-hover:opacity-100",
        )}
      />
    </button>
  );
}
