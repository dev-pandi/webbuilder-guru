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
  Blocks,
  Eye,
  ExternalLink,
  FileText,
  Home,
  LayoutTemplate,
  Loader2,
  Monitor,
  Plus,
  Redo2,
  RefreshCw,
  Search,
  Settings,
  Smartphone,
  Sparkles,
  Tablet,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { blockSchemas, blockSchemasByCategory } from "@/lib/blocks";
import { cn } from "@/lib/utils";

const RENDERER_BASE =
  process.env.NEXT_PUBLIC_RENDERER_BASE ?? "http://localhost";

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
  templateId,
  templateUpdatedAt,
  onSaveRequest,
  saving,
}: {
  value: TemplatePage[];
  onChange: (pages: TemplatePage[]) => void;
  // Untuk live preview iframe — kirim template ID (UUID) supaya renderer
  // bisa fetch preview endpoint by-id (accept semua status).
  templateId?: string;
  // Timestamp save terakhir — dipakai untuk key iframe supaya auto-refresh
  // setelah save. Ganti reference → iframe reload.
  templateUpdatedAt?: string;
  // Callback save (dari parent) — dipanggil kalau user pindah tab ke Preview
  // supaya iframe reflect state terbaru.
  onSaveRequest?: () => Promise<void>;
  saving?: boolean;
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

  // Device switcher untuk preview iframe di center panel.
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "tablet" | "mobile">(
    "desktop",
  );
  // Nonce untuk force refresh iframe pada tombol Refresh manual.
  const [previewNonce, setPreviewNonce] = useState(0);
  // "Menyimpan draft…" indicator saat auto-save berlangsung.
  const [autoSaving, setAutoSaving] = useState(false);

  // Debounced auto-save — setelah user berhenti edit 1.5 detik, save ke DB
  // supaya preview iframe reflect state terbaru. Iframe key ganti via
  // templateUpdatedAt yang parent update dari response save → auto-reload.
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleAutoSave = useCallback(() => {
    if (!onSaveRequest) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      setAutoSaving(true);
      try {
        await onSaveRequest();
      } catch {
        /* parent handles toast */
      } finally {
        setAutoSaving(false);
      }
    }, 1500);
  }, [onSaveRequest]);

  // Force refresh iframe (bypass cache) + trigger save fresh.
  const refreshPreview = useCallback(async () => {
    if (onSaveRequest) {
      setAutoSaving(true);
      try {
        await onSaveRequest();
      } catch {
        /* ignore */
      } finally {
        setAutoSaving(false);
      }
    }
    setPreviewNonce((n) => n + 1);
  }, [onSaveRequest]);

  // Cleanup timer saat unmount supaya tidak save di background setelah nav away.
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, []);

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
  // Setelah sync, schedule debounced auto-save supaya preview iframe auto-reload.
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
    // Trigger auto-save + preview refresh (debounced, 1.5s).
    scheduleAutoSave();
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
      <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-border/70 bg-muted/20 px-6 py-12 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <LayoutTemplate className="size-7" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold">Belum ada halaman di template</p>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            Setiap template butuh minimal <b>1 halaman</b> yang di-tandai sebagai
            Home. Tambahkan halaman pertama untuk mulai menyusun struktur.
          </p>
        </div>
        <Button onClick={addPage} size="lg" className="gap-1.5">
          <Plus className="size-4" />
          Tambah Halaman Pertama
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Page meta bar (title + slug + home + undo/redo) — top level, spans all */}
      {selectedPage && (
        <PageMetaBar
          page={selectedPage}
          onChange={(patch) => updatePageMeta(selectedIdx, patch)}
          onSetHome={() => setHome(selectedIdx)}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
          autoSaving={autoSaving}
        />
      )}

      {/* 3-column workspace: Left (Pages+Blocks) | Center (Preview) | Right (Props) */}
      <div className="grid gap-3 lg:grid-cols-[280px_1fr_340px]">
        {/* ============ LEFT — Pages list + Block outline ============ */}
        <Card className="flex h-fit max-h-[calc(100vh-9rem)] flex-col overflow-hidden lg:sticky lg:top-4">
          {/* Pages section */}
          <div className="border-b p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <FileText className="size-3.5 text-muted-foreground" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Halaman
                </span>
                <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                  {value.length}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={addPage}
                className="h-7 gap-1 px-2 text-[11px]"
              >
                <Plus className="size-3" />
                Baru
              </Button>
            </div>
            <ul className="max-h-40 space-y-1 overflow-y-auto pr-1">
              {value.map((p, i) => {
                const active = i === selectedIdx;
                const blockCount = p.tree?.blocks?.length ?? 0;
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
                        "group flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors",
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {p.is_home ? (
                        <Home className="size-3 shrink-0" />
                      ) : (
                        <FileText className="size-3 shrink-0" />
                      )}
                      <span className="flex-1 truncate font-medium">
                        {p.title || p.slug}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-1.5 py-0 font-mono text-[9px]",
                          active
                            ? "bg-primary/20 text-primary"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {blockCount}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePage(i);
                        }}
                        className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                        aria-label="Hapus halaman"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Block outline section — susunan block untuk selected page */}
          <div className="flex flex-1 flex-col overflow-hidden p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Blocks className="size-3.5 text-muted-foreground" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Susunan Block
                </span>
                <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                  {blocks.length}
                </span>
              </div>
              <Button
                size="sm"
                variant="default"
                onClick={() => setAddBlockOpen(true)}
                className="h-7 gap-1 px-2 text-[11px] shadow-sm"
              >
                <Plus className="size-3" />
                Tambah
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              {blocks.length === 0 ? (
                <button
                  onClick={() => setAddBlockOpen(true)}
                  className="flex w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-input py-6 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                >
                  <Sparkles className="size-4" />
                  Tambah block pertama
                </button>
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
            </div>
          </div>
        </Card>

        {/* ============ CENTER — Live Preview (always visible) ============ */}
        <Card className="flex h-fit max-h-[calc(100vh-9rem)] flex-col overflow-hidden lg:sticky lg:top-4">
          <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
            <div className="flex items-center gap-1.5">
              <Eye className="size-3.5 text-muted-foreground" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Preview Langsung
              </span>
              {autoSaving && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Loader2 className="size-2.5 animate-spin" />
                  Sync…
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {/* Device switcher */}
              <div className="flex items-center gap-0.5 rounded-md border bg-background p-0.5">
                {(
                  [
                    { key: "desktop", Icon: Monitor, label: "Desktop" },
                    { key: "tablet", Icon: Tablet, label: "Tablet" },
                    { key: "mobile", Icon: Smartphone, label: "Mobile" },
                  ] as const
                ).map(({ key, Icon, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPreviewDevice(key)}
                    className={cn(
                      "flex size-6 items-center justify-center rounded-sm transition-colors",
                      previewDevice === key
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                    title={label}
                  >
                    <Icon className="size-3" />
                  </button>
                ))}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void refreshPreview()}
                disabled={autoSaving || saving}
                className="size-7 p-0"
                title="Simpan draft + reload preview"
              >
                {autoSaving || saving ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <RefreshCw className="size-3" />
                )}
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            <PreviewPanel
              templateId={templateId}
              pageSlug={selectedPage?.slug}
              device={previewDevice}
              nonce={previewNonce}
              templateUpdatedAt={templateUpdatedAt}
            />
          </div>
        </Card>

        {/* ============ RIGHT — PropEditor ============ */}
        <Card className="h-fit max-h-[calc(100vh-9rem)] overflow-y-auto lg:sticky lg:top-4">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2 border-b pb-2">
              <div className="flex items-center gap-1.5">
                <Settings className="size-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {selectedBlock ? selectedBlock.type : "Pengaturan Block"}
                </span>
              </div>
              {selectedBlock && (
                <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  #{selectedBlockIdx + 1}
                </span>
              )}
            </div>
            {selectedBlock ? (
              <PropEditor
                block={selectedBlock}
                onChange={(next) => updateBlock(selectedBlockIdx, next)}
              />
            ) : (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
                  <Settings className="size-4" />
                </div>
                <p className="text-xs font-medium text-muted-foreground">
                  Belum ada block dipilih
                </p>
                <p className="max-w-[240px] text-[11px] text-muted-foreground/80">
                  Klik salah satu block di panel kiri untuk mengedit propertinya
                  di sini.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
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
  autoSaving,
}: {
  page: TemplatePage;
  onChange: (patch: Partial<TemplatePage>) => void;
  onSetHome: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  autoSaving?: boolean;
}) {
  const [slugErr, setSlugErr] = useState<string | null>(null);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2 border-b pb-2">
          <div className="flex items-center gap-1.5">
            <FileText className="size-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Detail Halaman
            </span>
            {autoSaving && (
              <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                <Loader2 className="size-2.5 animate-spin" />
                Sync…
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {page.is_home ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                <Home className="size-3" />
                Halaman Home
              </span>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={onSetHome}
                className="h-7 gap-1 px-2 text-[11px]"
                title="Jadikan halaman ini sebagai Home"
              >
                <Home className="size-3" />
                Jadikan Home
              </Button>
            )}
            <div className="flex items-center gap-0.5 rounded-md border border-border/60 p-0.5">
              <Button
                size="sm"
                variant="ghost"
                onClick={onUndo}
                disabled={!canUndo}
                className="size-7 p-0 disabled:opacity-40"
                title="Undo (⌘Z)"
                aria-label="Undo"
              >
                <Undo2 className="size-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onRedo}
                disabled={!canRedo}
                className="size-7 p-0 disabled:opacity-40"
                title="Redo (⌘⇧Z)"
                aria-label="Redo"
              >
                <Redo2 className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="p-title" className="text-xs">
              Judul Halaman
            </Label>
            <Input
              id="p-title"
              value={page.title}
              onChange={(e) => onChange({ title: e.target.value })}
              placeholder="mis. Beranda, Tentang Kami"
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-slug" className="text-xs">
              Slug URL
            </Label>
            <div className="flex items-center gap-1">
              <span className="rounded-md bg-muted px-2 py-1.5 font-mono text-xs text-muted-foreground">
                /
              </span>
              <Input
                id="p-slug"
                value={page.slug}
                onChange={(e) => {
                  const v = e.target.value.toLowerCase();
                  onChange({ slug: v });
                  setSlugErr(!SLUG_RE.test(v) ? "Slug hanya huruf kecil, angka, dan dash" : null);
                }}
                placeholder="tentang-kami"
                className={cn(
                  "h-9 flex-1 font-mono text-sm",
                  slugErr && "border-destructive focus-visible:ring-destructive",
                )}
              />
            </div>
            {slugErr && (
              <p className="flex items-center gap-1 text-[11px] text-destructive">
                <span className="inline-block size-1 rounded-full bg-destructive" />
                {slugErr}
              </p>
            )}
          </div>
        </div>
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

// -------- PreviewPanel --------
// Iframe live preview ke renderer route /template-preview-by-id/:id?page=<slug>.
// Renderer endpoint bypass status filter — draft/published sama-sama accessible
// (aman karena UUID unguessable).
//
// Refresh trigger:
//   1. Ganti device — iframe unmount + remount (key change)
//   2. Ganti page slug — auto-navigate via URL param
//   3. Ganti templateUpdatedAt / nonce — force reload iframe
function PreviewPanel({
  templateId,
  pageSlug,
  device,
  nonce,
  templateUpdatedAt,
}: {
  templateId?: string;
  pageSlug?: string;
  device: "desktop" | "tablet" | "mobile";
  nonce: number;
  templateUpdatedAt?: string;
}) {
  const [loaded, setLoaded] = useState(false);

  if (!templateId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-muted/20 p-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Eye className="size-5" />
        </div>
        <div className="space-y-0.5">
          <p className="text-sm font-semibold">Preview belum tersedia</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Klik <b>Simpan</b> di bawah dulu untuk aktifkan preview live.
          </p>
        </div>
      </div>
    );
  }

  // Device dimension untuk width iframe.
  const deviceWidth = {
    desktop: 1280,
    tablet: 768,
    mobile: 390,
  }[device];

  const url = `${RENDERER_BASE}/template-preview-by-id/${encodeURIComponent(
    templateId,
  )}${pageSlug ? `?page=${encodeURIComponent(pageSlug)}` : ""}`;

  // Key ganti setiap ada perubahan yang perlu refresh iframe.
  const iframeKey = `${templateId}-${device}-${pageSlug ?? "_home"}-${templateUpdatedAt ?? ""}-${nonce}`;

  return (
    <div className="flex h-full flex-col bg-muted/20">
      {/* Iframe container — browser-chrome-like frame */}
      <div className="flex-1 overflow-auto p-3">
        <div
          className="mx-auto overflow-hidden rounded-lg border border-foreground/10 bg-white shadow-lg transition-all duration-300"
          style={{ width: deviceWidth, maxWidth: "100%" }}
        >
          {/* Fake browser chrome */}
          <div className="flex items-center gap-1.5 border-b bg-muted/40 px-3 py-1.5">
            <span className="size-2 rounded-full bg-red-400" />
            <span className="size-2 rounded-full bg-amber-400" />
            <span className="size-2 rounded-full bg-emerald-400" />
            <div className="mx-2 flex-1 truncate rounded-md bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
              /{pageSlug || "home"}
            </div>
          </div>

          <div className="relative">
            {!loaded && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-sm">
                <div className="flex items-center gap-2 rounded-md bg-background px-3 py-2 text-xs font-medium text-muted-foreground shadow-sm">
                  <Loader2 className="size-3.5 animate-spin" />
                  Memuat…
                </div>
              </div>
            )}
            <iframe
              key={iframeKey}
              src={url}
              title="Template preview"
              onLoad={() => setLoaded(true)}
              className="h-[calc(100vh-14rem)] w-full border-0 bg-white"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </div>
        </div>
      </div>

      {/* Meta bar footer */}
      <div className="flex items-center justify-between gap-2 border-t bg-muted/40 px-3 py-1 text-[10px] text-muted-foreground">
        <span className="font-mono">
          {device} · {deviceWidth}px
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          Buka tab baru
          <ExternalLink className="size-2.5" />
        </a>
      </div>
    </div>
  );
}
