"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp, Copy, GripVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { schemaFor } from "@/lib/blocks";
import type { BlockData } from "./PropEditor";

// Stable string IDs for dnd-kit. We can't use array index — when items move,
// the indices change and dnd-kit gets confused. We need an id that survives
// the move. Approach: synthesise from index + type, but maintain a stable
// mapping via the caller's `keys` array so dnd survives reorders.
//
// In practice the caller is wb editor where blocks have no stable id field;
// we cope by tracking a parallel keys array (one symbol per block) that
// follows the same reorders.

export function SortableBlockList({
  blocks,
  keys,
  selectedIdx,
  selectedIndices,
  onSelect,
  onReorder,
  onMove,
  onDuplicate,
  onDelete,
  hiddenIndices,
}: {
  blocks: BlockData[];
  keys: string[];
  selectedIdx: number;
  // Optional — when provided, the row uses the set membership for the active
  // highlight (enables multi-select visual). Falls back to selectedIdx.
  selectedIndices?: Set<number>;
  // Receives modifier keys so the parent can implement shift-range / ⌘-toggle.
  onSelect: (i: number, mods?: { shift?: boolean; meta?: boolean }) => void;
  onReorder: (from: number, to: number) => void;
  onMove: (i: number, dir: -1 | 1) => void;
  onDuplicate: (i: number) => void;
  onDelete: (i: number) => void;
  // Top-level indices yang di-hide dari sidebar (mirror Preview canvas).
  // Blok tetap di array — hanya tidak di-render/di-DND. Path indices tetap
  // konsisten dengan blocks array.
  hiddenIndices?: Set<number>;
}) {
  // Pointer sensor 8px activation — kurangi false positive drag saat guru
  // click cepat untuk select (sebelumnya 4px terasa terlalu sensitif). Touch
  // pakai delay 250ms + tolerance 5px supaya scroll native smooth di mobile.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragStart(_: DragStartEvent) {
    setIsDragging(true);
  }

  function onDragEnd(e: DragEndEvent) {
    setIsDragging(false);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = keys.indexOf(String(active.id));
    const to = keys.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(from, to);
  }

  function onDragCancel() {
    setIsDragging(false);
  }

  // Freeze hidden set selama drag aktif — kalau parent update hiddenIndices
  // di tengah drag (mis. autosave completes → layout state re-sync), dnd-kit
  // items/render bisa diverge dan bikin crash / drop ke posisi salah.
  const [isDragging, setIsDragging] = useState(false);
  const frozenHiddenRef = useRef<Set<number> | null>(null);
  const liveHidden = hiddenIndices ?? new Set<number>();
  useEffect(() => {
    if (!isDragging) frozenHiddenRef.current = null;
  }, [isDragging]);
  if (isDragging && frozenHiddenRef.current == null) {
    frozenHiddenRef.current = new Set(liveHidden);
  }
  const hidden = isDragging && frozenHiddenRef.current
    ? frozenHiddenRef.current
    : liveHidden;
  const visibleKeys = keys.filter((_, i) => !hidden.has(i));
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <SortableContext items={visibleKeys} strategy={verticalListSortingStrategy}>
        <ul className="space-y-1">
          {blocks.map((b, i) => {
            if (hidden.has(i)) return null;
            return (
              <SortableRow
                key={keys[i]}
                id={keys[i]}
                block={b}
                index={i}
                total={blocks.length}
                active={selectedIndices ? selectedIndices.has(i) : selectedIdx === i}
                isAnchor={selectedIdx === i}
                onSelect={(mods) => onSelect(i, mods)}
                onMove={(dir) => onMove(i, dir)}
                onDuplicate={() => onDuplicate(i)}
                onDelete={() => onDelete(i)}
              />
            );
          })}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  block,
  index,
  total,
  active,
  isAnchor,
  onSelect,
  onMove,
  onDuplicate,
  onDelete,
}: {
  id: string;
  block: BlockData;
  index: number;
  total: number;
  active: boolean;
  // True when this row is THE anchor (selectedIdx) — multi-selected rows are
  // `active` but only one is the anchor (the row whose props show in panel).
  isAnchor?: boolean;
  onSelect: (mods?: { shift?: boolean; meta?: boolean }) => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const schema = schemaFor(block.type);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 10 : "auto",
  };

  return (
    <li ref={setNodeRef} style={style}>
      <div
        onClick={(e) =>
          onSelect({
            shift: e.shiftKey,
            meta: e.metaKey || e.ctrlKey,
          })
        }
        className={cn(
          "group flex cursor-pointer items-center gap-1.5 rounded-md border px-1.5 py-2 text-sm transition-all",
          active
            ? isAnchor
              ? "border-primary/60 bg-primary/10 shadow-sm"
              : "border-primary/30 bg-primary/5"
            : "border-transparent hover:border-input hover:bg-muted/50",
          isDragging && "border-primary shadow-lg",
        )}
      >
        {/* Drag handle — separate hit area so clicks elsewhere still select */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing"
          title="Geser untuk pindah"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="size-3.5" />
        </button>

        <span className="text-xs">{schema?.emoji ?? "🧩"}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">
            {schema?.label ?? block.type}
          </div>
        </div>

        {/* Quick actions — visible on hover/active */}
        <span
          className={cn(
            "flex shrink-0 gap-0.5 transition-opacity",
            active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={(e) => {
              e.stopPropagation();
              onMove(-1);
            }}
            disabled={index === 0}
            title="Naik"
          >
            <ChevronUp className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={(e) => {
              e.stopPropagation();
              onMove(1);
            }}
            disabled={index === total - 1}
            title="Turun"
          >
            <ChevronDown className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            title="Duplikat (⌘D)"
          >
            <Copy className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Hapus block "${schema?.label ?? block.type}"?`)) onDelete();
            }}
            title="Hapus (Del)"
          >
            <Trash2 className="size-3" />
          </Button>
        </span>
      </div>
    </li>
  );
}

// Helper: build a fresh keys array for `n` blocks. Uses crypto.randomUUID()
// when available so keys survive renders + reorders.
export function makeKeys(n: number): string[] {
  return Array.from({ length: n }, () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
  );
}

// Reorder keys + blocks together when a drag completes.
export function reorderWithKeys<T>(items: T[], keys: string[], from: number, to: number): {
  items: T[];
  keys: string[];
} {
  return {
    items: arrayMove(items, from, to),
    keys: arrayMove(keys, from, to),
  };
}
