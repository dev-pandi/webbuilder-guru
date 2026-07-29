"use client";

// Template pages editor — visual editor untuk struktur pages_json.
// In-memory: parent (admin edit page) hold `pages` state, editor mutates via
// onChange. Save flow: klik Simpan di parent → PATCH pages_json ke backend.
//
// Reuse dari existing editor:
//   - SortableBlockList — drag+drop reorder
//   - PropEditor — schema-driven prop form
//   - useBlocksHistory — undo/redo per page
//   - schemaFor / blockSchemas — palette + default props
//   - paths.ts — immutable tree mutation
//
// Sengaja lebih sederhana dari editor `/sites/[id]/editor` — tidak ada canvas
// preview inline (parent modal preview cover kebutuhan itu), tidak ada theme
// drawer (theme editor terpisah).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Blocks,
  Home,
  Loader2,
  Plus,
  Redo2,
  Search,
  Settings,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { blockSchemas, blockSchemasByCategory, CATEGORY_LABELS } from "@/lib/blocks";
import { cn } from "@/lib/utils";

import { PropEditor, type BlockData } from "@/app/sites/[id]/editor/PropEditor";
import { SortableBlockList } from "@/app/sites/[id]/editor/SortableBlockList";
import { useBlocksHistory } from "@/app/sites/[id]/editor/useBlocksHistory";

// -------- Types --------

export type TemplatePage = {
  slug: string;
  title: string;
  is_home: boolean;
  tree: { blocks?: BlockData[] } | null;
  seo?: Record<string, unknown> | null;
};

// -------- Helpers --------

// Slug validator sama dengan backend regex.
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

// Stable keys untuk SortableBlockList — dnd-kit butuh id yang survive reorder.
// Generate 1 key per index; kalau blocks berubah length, adjust.
function makeKeys(n: number, prefix: string): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}-${i}-${Math.random().toString(36).slice(2, 8)}`);
}

// -------- Component --------

export function TemplatePagesEditor({
  value,
  onChange,
}: {
  value: TemplatePage[];
  onChange: (pages: TemplatePage[]) => void;
}) {
  // Selected page index — default 0 (atau home page kalau ada).
  const [selectedIdx, setSelectedIdx] = useState(0);
  const selectedPage = value[selectedIdx] as TemplatePage | undefined;

  // Block-level history — init dengan blocks page pertama supaya first-render
  // TIDAK sync empty ke parent (yang bisa wipe pages_json). replaceAll fires
  // dari effect kalau selectedIdx berubah.
  const initialBlocks = useMemo(() => value[0]?.tree?.blocks ?? [], []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { blocks, setBlocks, replaceAll, undo, redo, canUndo, canRedo } = useBlocksHistory(initialBlocks);

  // Hydrated flag — sync-back ke parent hanya setelah initial hydration
  // selesai. Cegah first-render clobber.
  const hydrated = useRef(false);

  // Selected block dalam page current — index in root blocks (nested edit
  // di-defer, kita fokus ke top-level dulu).
  const [selectedBlockIdx, setSelectedBlockIdx] = useState<number>(-1);
  const [blockKeys, setBlockKeys] = useState<string[]>([]);

  const [addBlockOpen, setAddBlockOpen] = useState(false);

  // Load page's blocks saat selection berubah. Set hydrated=true supaya
  // sync-back effect boleh mulai jalan.
  useEffect(() => {
    const pageBlocks = selectedPage?.tree?.blocks ?? [];
    replaceAll(pageBlocks);
    setBlockKeys(makeKeys(pageBlocks.length, "b"));
    setSelectedBlockIdx(pageBlocks.length > 0 ? 0 : -1);
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIdx]);

  // Kalau parent value berubah (mis. paste JSON via advanced editor), sync.
  // Detect via reference-different pages array.
  useEffect(() => {
    if (!selectedPage) {
      setSelectedIdx(0);
      return;
    }
    // If external change ke tree, sync in-memory blocks. Cheap deep-compare
    // via JSON stringify — pages_json biasanya < 50KB, negligible cost.
    const currentJSON = JSON.stringify(blocks);
    const pageJSON = JSON.stringify(selectedPage.tree?.blocks ?? []);
    if (currentJSON !== pageJSON) {
      const pageBlocks = selectedPage.tree?.blocks ?? [];
      replaceAll(pageBlocks);
      setBlockKeys(makeKeys(pageBlocks.length, "b"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Sync block edits back to parent — throttle via effect + comparison biar
  // tidak infinite loop. Skip kalau belum hydrated (initial render).
  useEffect(() => {
    if (!hydrated.current) return;
    if (!selectedPage) return;
    const currentJSON = JSON.stringify(blocks);
    const pageJSON = JSON.stringify(selectedPage.tree?.blocks ?? []);
    if (currentJSON === pageJSON) return;
    const next = [...value];
    next[selectedIdx] = {
      ...selectedPage,
      tree: { blocks },
    };
    onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks]);

  // -------- Page-level actions --------

  const addPage = useCallback(() => {
    const baseSlug = "page";
    let n = 2;
    let slug = baseSlug;
    while (value.some((p) => p.slug === slug)) {
      slug = `${baseSlug}-${n++}`;
    }
    const newPage: TemplatePage = {
      slug,
      title: "New Page",
      is_home: value.length === 0, // pertama = home otomatis
      tree: { blocks: [] },
      seo: {},
    };
    const next = [...value, newPage];
    onChange(next);
    setSelectedIdx(next.length - 1);
  }, [value, onChange]);

  const deletePage = useCallback(
    (idx: number) => {
      if (!confirm(`Hapus page "${value[idx]?.title}"? Blocks di dalamnya akan hilang.`)) return;
      const next = value.filter((_, i) => i !== idx);
      // Kalau delete home, promote page pertama jadi home.
      if (value[idx]?.is_home && next.length > 0) {
        next[0] = { ...next[0], is_home: true };
      }
      onChange(next);
      if (selectedIdx >= next.length) setSelectedIdx(Math.max(0, next.length - 1));
    },
    [value, onChange, selectedIdx],
  );

  const updatePageMeta = useCallback(
    (idx: number, patch: Partial<TemplatePage>) => {
      const next = value.map((p, i) => (i === idx ? { ...p, ...patch } : p));
      onChange(next);
    },
    [value, onChange],
  );

  const setHome = useCallback(
    (idx: number) => {
      // Cuma 1 home max — un-flag page lain.
      const next = value.map((p, i) => ({ ...p, is_home: i === idx }));
      onChange(next);
    },
    [value, onChange],
  );

  // -------- Block-level actions (untuk selected page) --------

  const addBlock = useCallback(
    (type: string) => {
      const schema = blockSchemas.find((s) => s.type === type);
      if (!schema) return;
      const newBlock: BlockData = {
        type,
        props: { ...schema.defaults },
      };
      if (schema.container) newBlock.children = [];
      const next = [...blocks, newBlock];
      setBlocks(next);
      setBlockKeys([...blockKeys, `b-${next.length - 1}-${Math.random().toString(36).slice(2, 8)}`]);
      setSelectedBlockIdx(next.length - 1);
      setAddBlockOpen(false);
    },
    [blocks, blockKeys, setBlocks],
  );

  const deleteBlock = useCallback(
    (idx: number) => {
      const next = blocks.filter((_, i) => i !== idx);
      setBlocks(next);
      setBlockKeys(blockKeys.filter((_, i) => i !== idx));
      if (selectedBlockIdx === idx) setSelectedBlockIdx(next.length > 0 ? 0 : -1);
      else if (selectedBlockIdx > idx) setSelectedBlockIdx(selectedBlockIdx - 1);
    },
    [blocks, blockKeys, setBlocks, selectedBlockIdx],
  );

  const duplicateBlock = useCallback(
    (idx: number) => {
      const orig = blocks[idx];
      if (!orig) return;
      const clone: BlockData = JSON.parse(JSON.stringify(orig));
      const next = [...blocks.slice(0, idx + 1), clone, ...blocks.slice(idx + 1)];
      setBlocks(next);
      const newKeys = [...blockKeys];
      newKeys.splice(idx + 1, 0, `b-dup-${Math.random().toString(36).slice(2, 8)}`);
      setBlockKeys(newKeys);
      setSelectedBlockIdx(idx + 1);
    },
    [blocks, blockKeys, setBlocks],
  );

  const moveBlock = useCallback(
    (idx: number, dir: -1 | 1) => {
      const target = idx + dir;
      if (target < 0 || target >= blocks.length) return;
      const next = [...blocks];
      [next[idx], next[target]] = [next[target], next[idx]];
      setBlocks(next);
      const nextKeys = [...blockKeys];
      [nextKeys[idx], nextKeys[target]] = [nextKeys[target], nextKeys[idx]];
      setBlockKeys(nextKeys);
      setSelectedBlockIdx(target);
    },
    [blocks, blockKeys, setBlocks],
  );

  const reorderBlocks = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      const next = [...blocks];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      setBlocks(next);
      const nextKeys = [...blockKeys];
      const [movedKey] = nextKeys.splice(from, 1);
      nextKeys.splice(to, 0, movedKey);
      setBlockKeys(nextKeys);
      // Track selection through the move.
      if (selectedBlockIdx === from) setSelectedBlockIdx(to);
      else if (from < selectedBlockIdx && to >= selectedBlockIdx) setSelectedBlockIdx(selectedBlockIdx - 1);
      else if (from > selectedBlockIdx && to <= selectedBlockIdx) setSelectedBlockIdx(selectedBlockIdx + 1);
    },
    [blocks, blockKeys, setBlocks, selectedBlockIdx],
  );

  const updateBlock = useCallback(
    (idx: number, next: BlockData) => {
      const nextBlocks = blocks.map((b, i) => (i === idx ? next : b));
      setBlocks(nextBlocks);
    },
    [blocks, setBlocks],
  );

  const selectedBlock = selectedBlockIdx >= 0 ? blocks[selectedBlockIdx] : null;

  // -------- Render --------

  if (value.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
        <Blocks className="size-8 text-muted-foreground opacity-40" />
        <p className="text-sm font-medium">Template belum punya page</p>
        <p className="max-w-md text-xs text-muted-foreground">
          Setiap template butuh minimal 1 page dengan is_home=true. Tambah page
          pertama untuk mulai.
        </p>
        <Button onClick={addPage} className="gap-1.5">
          <Plus className="size-3.5" />
          Tambah page pertama
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr_320px]">
      {/* Left panel — Page list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Halaman ({value.length})
          </Label>
          <Button size="sm" variant="ghost" onClick={addPage} className="h-6 gap-1 text-xs">
            <Plus className="size-3" />
            Tambah
          </Button>
        </div>
        <ul className="space-y-1">
          {value.map((p, i) => {
            const active = i === selectedIdx;
            return (
              <li key={i}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedIdx(i)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setSelectedIdx(i);
                  }}
                  className={cn(
                    "group flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors",
                    active
                      ? "border-primary bg-primary/5"
                      : "border-transparent hover:border-border hover:bg-muted",
                  )}
                >
                  {p.is_home && <Home className="size-3 shrink-0 text-primary" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.title || p.slug}</p>
                    <p className="truncate font-mono text-[10px] text-muted-foreground">
                      /{p.slug}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePage(i);
                    }}
                    className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    aria-label="Hapus page"
                    title={p.is_home && value.length > 1 ? "Hapus (page pertama sisanya jadi home)" : "Hapus"}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Middle panel — Block list for selected page */}
      <div className="space-y-3">
        {selectedPage && (
          <>
            <PageMetaBar
              page={selectedPage}
              onChange={(patch) => updatePageMeta(selectedIdx, patch)}
              onSetHome={() => setHome(selectedIdx)}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={undo}
              onRedo={redo}
            />

            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Blocks ({blocks.length})
              </Label>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAddBlockOpen(true)}
                className="h-8 gap-1 text-xs"
              >
                <Plus className="size-3.5" />
                Tambah Block
              </Button>
            </div>

            {blocks.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
                <Blocks className="size-6 text-muted-foreground opacity-40" />
                <p className="text-xs text-muted-foreground">Belum ada block di page ini</p>
                <Button size="sm" onClick={() => setAddBlockOpen(true)} className="gap-1.5">
                  <Plus className="size-3.5" />
                  Tambah block pertama
                </Button>
              </div>
            ) : (
              <SortableBlockList
                blocks={blocks}
                keys={blockKeys}
                selectedIdx={selectedBlockIdx}
                onSelect={(i) => setSelectedBlockIdx(i)}
                onReorder={reorderBlocks}
                onMove={moveBlock}
                onDuplicate={duplicateBlock}
                onDelete={deleteBlock}
              />
            )}
          </>
        )}
      </div>

      {/* Right panel — PropEditor untuk selected block */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
          <Settings className="size-3" />
          Props
        </Label>
        {selectedBlock ? (
          <Card>
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between border-b pb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {selectedBlock.type}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  #{selectedBlockIdx + 1}
                </span>
              </div>
              <PropEditor
                block={selectedBlock}
                onChange={(next) => updateBlock(selectedBlockIdx, next)}
              />
            </CardContent>
          </Card>
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            Pilih block di tengah untuk edit props-nya
          </p>
        )}
      </div>

      {addBlockOpen && (
        <AddBlockDialog onSelect={addBlock} onClose={() => setAddBlockOpen(false)} />
      )}
    </div>
  );
}

// -------- PageMetaBar --------

function PageMetaBar({
  page,
  onChange,
  onSetHome,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  page: TemplatePage;
  onChange: (patch: Partial<TemplatePage>) => void;
  onSetHome: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const [slugErr, setSlugErr] = useState<string | null>(null);

  return (
    <Card>
      <CardContent className="p-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
          <div className="space-y-1">
            <Label htmlFor="p-title" className="text-[10px]">
              Judul
            </Label>
            <Input
              id="p-title"
              value={page.title}
              onChange={(e) => onChange({ title: e.target.value })}
              placeholder="Beranda"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-slug" className="text-[10px]">
              Slug
            </Label>
            <Input
              id="p-slug"
              value={page.slug}
              onChange={(e) => {
                const v = e.target.value.toLowerCase();
                onChange({ slug: v });
                setSlugErr(!SLUG_RE.test(v) ? "Format invalid" : null);
              }}
              placeholder="tentang"
              className={cn(
                "h-8 font-mono text-xs",
                slugErr && "border-destructive",
              )}
            />
          </div>
          <div className="flex items-end gap-1">
            <Button
              size="sm"
              variant={page.is_home ? "default" : "outline"}
              onClick={onSetHome}
              disabled={page.is_home}
              className="h-8 gap-1 text-xs"
              title={page.is_home ? "Sudah home" : "Set sebagai home"}
            >
              <Home className="size-3" />
              {page.is_home ? "Home" : "Set home"}
            </Button>
          </div>
          <div className="flex items-end gap-0.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={onUndo}
              disabled={!canUndo}
              className="size-8 p-0"
              title="Undo"
            >
              <Undo2 className="size-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onRedo}
              disabled={!canRedo}
              className="size-8 p-0"
              title="Redo"
            >
              <Redo2 className="size-3.5" />
            </Button>
          </div>
        </div>
        {slugErr && <p className="mt-1 text-[10px] text-destructive">{slugErr}</p>}
      </CardContent>
    </Card>
  );
}

// -------- AddBlockDialog --------

function AddBlockDialog({
  onSelect,
  onClose,
}: {
  onSelect: (type: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const grouped = useMemo(() => blockSchemasByCategory(), []);

  const filtered = useMemo(() => {
    if (!q.trim()) return grouped;
    const query = q.toLowerCase();
    return grouped
      .map((g) => ({
        ...g,
        blocks: g.blocks.filter(
          (s) =>
            s.type.toLowerCase().includes(query) ||
            s.label.toLowerCase().includes(query) ||
            (s.description ?? "").toLowerCase().includes(query),
        ),
      }))
      .filter((g) => g.blocks.length > 0);
  }, [q, grouped]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-background shadow-2xl">
        <div className="flex items-center gap-2 border-b p-4">
          <Search className="size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari block…"
            className="h-9 flex-1"
            autoFocus
          />
          <Button variant="ghost" size="icon" onClick={onClose} className="size-8">
            <X className="size-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Tidak ada block match "{q}"
            </p>
          ) : (
            <div className="space-y-6">
              {filtered.map((g) => (
                <div key={g.key}>
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {g.label}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {g.blocks.map((s) => (
                      <button
                        key={s.type}
                        type="button"
                        onClick={() => onSelect(s.type)}
                        className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary hover:bg-primary/5"
                      >
                        {s.emoji && <span className="text-lg">{s.emoji}</span>}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{s.label}</p>
                          {s.description && (
                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                              {s.description}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
