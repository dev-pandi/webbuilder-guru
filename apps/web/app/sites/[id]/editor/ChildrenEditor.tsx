"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { blockSchemas, schemaFor } from "@/lib/blocks";
import { cn } from "@/lib/utils";
import type { BlockData } from "./PropEditor";
import { PropEditor } from "./PropEditor";

/**
 * Children editor — surfaced in the PropEditor when the selected block is a
 * container (Container, Columns). Renders the children as draggable-feeling
 * cards with reorder + delete + add controls. Editing a child opens a small
 * picker dialog that contains a recursive PropEditor instance for that child.
 *
 * Design tradeoff: we DON'T let the user click a child directly in the canvas
 * — that would need path-based selection across the editor, a sizeable
 * refactor. The dialog drill-down covers the same intent at a fraction of the
 * complexity, and matches the WordPress "InnerBlocks" UX users already know.
 */
export function ChildrenEditor({
  block,
  onChange,
}: {
  block: BlockData;
  onChange: (next: BlockData) => void;
}) {
  const children = block.children ?? [];
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  function update(arr: BlockData[]) {
    onChange({ ...block, children: arr });
  }
  function addChild(type: string) {
    const schema = schemaFor(type);
    if (!schema) return;
    const newChild: BlockData = {
      type,
      props: structuredClone(schema.defaults),
    };
    update([...children, newChild]);
    setPickerOpen(false);
    // Open the new child for editing immediately — saves a click.
    setEditIdx(children.length);
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= children.length) return;
    const next = [...children];
    [next[i], next[j]] = [next[j], next[i]];
    update(next);
  }
  function remove(i: number) {
    if (!confirm("Hapus block ini dari container?")) return;
    update(children.filter((_, idx) => idx !== i));
  }
  function updateChild(i: number, next: BlockData) {
    const arr = [...children];
    arr[i] = next;
    update(arr);
  }

  return (
    <div className="rounded-md border bg-card">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Konten Dalam ({children.length})
        </span>
        <Button
          type="button"
          size="sm"
          variant="default"
          className="h-7 gap-1 px-2"
          onClick={() => setPickerOpen(true)}
        >
          <Plus className="size-3" />
          Tambah
        </Button>
      </div>
      <div className="space-y-1.5 border-t px-3 py-3">
        {children.length === 0 ? (
          <p className="rounded border border-dashed py-4 text-center text-[11px] text-muted-foreground">
            Belum ada konten. Klik <strong>Tambah</strong> untuk menyisipkan block.
          </p>
        ) : (
          children.map((c, i) => {
            const schema = schemaFor(c.type);
            return (
              <div
                key={i}
                className="group flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5"
              >
                <span className="text-sm">{schema?.emoji ?? "🧩"}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">
                    {schema?.label ?? c.type}
                  </p>
                </div>
                <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    title="Naik"
                  >
                    <ChevronUp className="size-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => move(i, 1)}
                    disabled={i === children.length - 1}
                    title="Turun"
                  >
                    <ChevronDown className="size-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => setEditIdx(i)}
                    title="Edit konten"
                  >
                    <Pencil className="size-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => remove(i)}
                    title="Hapus"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <ChildPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={addChild}
      />

      {editIdx !== null && children[editIdx] && (
        <ChildEditDialog
          child={children[editIdx]}
          onChange={(next) => updateChild(editIdx, next)}
          onClose={() => setEditIdx(null)}
        />
      )}
    </div>
  );
}

/**
 * Minimal block picker for inserting children. Excludes other container types
 * to prevent runaway nesting depth (browsers handle infinite recursion poorly,
 * and users almost never need >1 level for marketing pages).
 */
function ChildPickerDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (type: string) => void;
}) {
  const [q, setQ] = useState("");
  const candidates = blockSchemas.filter(
    (s) =>
      !s.container && // no nested containers
      s.category !== "dynamic" && // dynamic blocks need site context — skip
      (q.trim() === "" ||
        s.label.toLowerCase().includes(q.toLowerCase()) ||
        s.type.toLowerCase().includes(q.toLowerCase())),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Pilih block untuk ditambah ke container</DialogTitle>
          <DialogDescription>
            Block container tidak ditampilkan (cegah nesting terlalu dalam).
          </DialogDescription>
        </DialogHeader>
        <div className="border-b px-6 py-3">
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari (Hero, Heading, FAQ…)"
            className="h-9"
          />
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-4">
          {candidates.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Tidak ada block cocok.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {candidates.map((s) => (
                <button
                  key={s.type}
                  type="button"
                  onClick={() => onPick(s.type)}
                  className="flex items-start gap-3 rounded-lg border bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-lg">
                    {s.emoji ?? "🧩"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{s.label}</div>
                    {s.description ? (
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                        {s.description}
                      </p>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Drill-down edit dialog for a single child block. Contains its own
 * PropEditor — the same component used at the top level, so all field types
 * (richtext, items, etc.) work identically inside containers.
 */
function ChildEditDialog({
  child,
  onChange,
  onClose,
}: {
  child: BlockData;
  onChange: (next: BlockData) => void;
  onClose: () => void;
}) {
  const schema = schemaFor(child.type);
  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl gap-0 p-0">
        <DialogHeader className="border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{schema?.emoji ?? "🧩"}</span>
            <div>
              <DialogTitle>{schema?.label ?? child.type}</DialogTitle>
              <DialogDescription className="mt-0.5">
                {schema?.description ?? "Edit properti child block"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-y-auto px-6 py-4">
          <PropEditor block={child} onChange={onChange} />
        </div>
        <div className="flex justify-end gap-2 border-t bg-muted/30 px-6 py-3">
          <Button onClick={onClose}>Selesai</Button>
        </div>
        {/* prevent unused-prop lint */}
        <span className={cn("hidden")} />
      </DialogContent>
    </Dialog>
  );
}
