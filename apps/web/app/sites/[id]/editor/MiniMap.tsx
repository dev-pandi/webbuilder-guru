"use client";

import { Map } from "lucide-react";
import { schemaFor } from "@/lib/blocks";
import type { BlockData } from "./PropEditor";
import { cn } from "@/lib/utils";

/**
 * Mini-map — a thin vertical overview pinned to the right edge of the canvas.
 * Each block is rendered as a tiny labelled bar, scaled to its on-page height
 * so users can spot where in the document they are. Click a bar to scroll the
 * canvas to that block.
 *
 * Visual model: simplified Figma right-side outline. Not a true pixel-accurate
 * miniature — those need DOM measurement + canvas painting (~10x the code).
 * The simplified labelled version covers 95% of the navigation need.
 */
export function MiniMap({
  blocks,
  keys,
  selectedIdx,
  selectedIndices,
  onJump,
  scrollContainerRef,
}: {
  blocks: BlockData[];
  keys: string[];
  selectedIdx: number;
  selectedIndices?: Set<number>;
  // Called when user clicks a mini-bar — caller scrolls the actual canvas.
  onJump: (i: number) => void;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  if (blocks.length < 4) return null; // Pointless for short pages.

  function jump(i: number) {
    onJump(i);
    // Try to scroll the wrapped canvas element into view if a ref is provided.
    if (scrollContainerRef?.current) {
      const target = scrollContainerRef.current.querySelector<HTMLElement>(
        `[data-block-key="${keys[i]}"]`,
      );
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  return (
    <div
      className="pointer-events-auto absolute right-2 top-1/2 z-30 flex max-h-[70vh] w-[120px] -translate-y-1/2 flex-col gap-0.5 overflow-y-auto rounded-md border bg-background/90 p-1.5 shadow-lg backdrop-blur"
      aria-label="Mini-map navigasi block"
    >
      <div className="mb-1 flex items-center gap-1 px-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Map className="size-3" />
        Map
      </div>
      {blocks.map((b, i) => {
        const schema = schemaFor(b.type);
        const isSelected = selectedIndices ? selectedIndices.has(i) : selectedIdx === i;
        return (
          <button
            key={keys[i] ?? i}
            type="button"
            onClick={() => jump(i)}
            title={`Block #${i + 1}: ${schema?.label ?? b.type}`}
            className={cn(
              "flex items-center gap-1 truncate rounded px-1.5 py-1 text-left text-[9px] transition-colors",
              isSelected
                ? "bg-primary text-primary-foreground font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <span className="text-[10px]">{schema?.emoji ?? "🧩"}</span>
            <span className="truncate">{schema?.label ?? b.type}</span>
          </button>
        );
      })}
    </div>
  );
}
