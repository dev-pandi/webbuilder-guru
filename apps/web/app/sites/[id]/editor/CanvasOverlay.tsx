"use client";

import { ChevronDown, ChevronUp, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { schemaFor } from "@/lib/blocks";
import type { BlockData } from "./PropEditor";

/**
 * Floating action bar that sits on top of the selected block in the preview
 * canvas. Currently shown only for the active block — hover-only would be
 * noisy on long pages. Operations dispatch into the same reducer the sidebar
 * uses so undo/redo cover them.
 */
export function CanvasBlockToolbar({
  block,
  index,
  total,
  onMove,
  onDuplicate,
  onDelete,
}: {
  block: BlockData;
  index: number;
  total: number;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const schema = schemaFor(block.type);
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "pointer-events-auto absolute right-2 top-2 z-20 flex items-center gap-0.5 rounded-md border bg-background/95 px-1 py-1 shadow-lg backdrop-blur",
      )}
    >
      <span className="px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {schema?.label ?? block.type}
      </span>
      <span className="mx-0.5 h-4 w-px bg-border" />
      <ToolbarBtn
        title="Naik"
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        <ChevronUp className="size-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Turun"
        disabled={index === total - 1}
        onClick={() => onMove(1)}
      >
        <ChevronDown className="size-3.5" />
      </ToolbarBtn>
      <ToolbarBtn title="Duplikat (⌘D)" onClick={onDuplicate}>
        <Copy className="size-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Hapus (Del)"
        onClick={() => {
          if (confirm(`Hapus block "${schema?.label ?? block.type}"?`)) onDelete();
        }}
        danger
      >
        <Trash2 className="size-3.5" />
      </ToolbarBtn>
    </div>
  );
}

function ToolbarBtn({
  children,
  onClick,
  title,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "size-7",
        danger && "text-destructive hover:bg-destructive/10 hover:text-destructive",
      )}
    >
      {children}
    </Button>
  );
}
