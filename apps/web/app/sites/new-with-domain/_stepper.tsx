"use client";

// Progress stepper — 3 step visual sinkron dengan flow:
//   1. Cari domain (input)
//   2. Pilih (results.length > 1) — auto-skip kalau single result
//   3. Bayar (confirm section aktif)
//
// State derivation:
//   - currentStep === 1 : belum ada results
//   - currentStep === 2 : results ada, belum selected
//   - currentStep === 3 : selected exists

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepIdx = 1 | 2 | 3;

const STEPS: Array<{ n: StepIdx; label: string }> = [
  { n: 1, label: "Cari" },
  { n: 2, label: "Pilih" },
  { n: 3, label: "Bayar" },
];

export function Stepper({ current }: { current: StepIdx }) {
  return (
    <ol className="flex items-center gap-2 sm:gap-3">
      {STEPS.map((s, i) => {
        const done = s.n < current;
        const active = s.n === current;
        return (
          <li key={s.n} className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
                  done
                    ? "bg-primary text-primary-foreground"
                    : active
                      ? "bg-primary/15 text-primary ring-2 ring-primary"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3.5" /> : s.n}
              </div>
              <span
                className={cn(
                  "text-xs font-medium sm:text-sm",
                  done || active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "h-px w-4 sm:w-8 transition-colors",
                  done ? "bg-primary" : "bg-border",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
