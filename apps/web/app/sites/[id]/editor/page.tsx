"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  History,
  Layers,
  Loader2,
  Map as MapIcon,
  Monitor,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Redo2,
  Rocket,
  RotateCcw,
  Save,
  Search,
  Settings2,
  Smartphone,
  Sparkles,
  Tablet,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { marked } from "marked";
import { api } from "@/lib/api";
import { blockSchemas, blockSchemasByCategory, schemaFor } from "@/lib/blocks";
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
import { cn } from "@/lib/utils";
import { hexToHslComponents, readableForeground } from "@/lib/color";
import { buildCatalogFontsUrl } from "@/lib/fonts";
import { PropEditor, type BlockData } from "./PropEditor";
import { LayoutPanel } from "./LayoutPanel";
import { ThemeDrawer, type ThemeJson } from "./ThemeDrawer";
import { buildLayoutStyle, buildMaxWidthStyle, layoutForBreakpoint } from "@/lib/blockLayout";
import { useBlocksHistory } from "./useBlocksHistory";
import { SortableBlockList, makeKeys, reorderWithKeys } from "./SortableBlockList";
import { CanvasBlockToolbar } from "./CanvasOverlay";
import { EditableText } from "./EditableText";
import { PageSettingsDialog } from "./PageSettingsDialog";
import { MiniMap } from "./MiniMap";

type PageVersion = {
  id: string;
  page_id: string;
  version: number;
  title: string;
  tree: { blocks?: BlockData[] } | null;
  seo: unknown;
  created_at: string;
};

type Page = {
  id: string;
  site_id: string;
  slug: string;
  title: string;
  tree: { blocks?: BlockData[] } | null;
  is_home: boolean;
  // Live snapshot — what the public renderer is serving. `null` means never
  // published. Used to compute the unpublishedChanges indicator + Publish
  // button enabled state.
  published_tree?: { blocks?: BlockData[] } | null;
  published_at?: string | null;
};

type Site = {
  id: string;
  name: string;
  theme: ThemeJson | null;
};

const DEFAULT_THEME: ThemeJson = {
  colors: { primary: "#2563eb", secondary: "#0ea5e9", bg: "#ffffff", fg: "#0f172a" },
  font: { heading: "Inter", body: "Inter" },
  radius: "0.75rem",
};

// Inserts a single <link> loading the whole font catalog so any font the user
// picks is available in the canvas without per-pick network juggling.
function ensureFontCatalogLoaded() {
  if (typeof document === "undefined") return;
  const id = "wb-editor-font-catalog";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = buildCatalogFontsUrl();
  document.head.appendChild(link);
}

export default function EditorPage() {
  const params = useParams<{ id: string }>();
  const [pages, setPages] = useState<Page[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);

  // Block tree lives in a reducer with undo/redo history. selectedIdx +
  // clipboard are local UI state.
  const { blocks, setBlocks, replaceAll, undo, redo, canUndo, canRedo } =
    useBlocksHistory([]);
  const [blockKeys, setBlockKeys] = useState<string[]>([]);
  const [originalBlocks, setOriginalBlocks] = useState<BlockData[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number>(-1);
  // selectedIndices is the FULL multi-select set. selectedIdx is the "anchor"
  // (last clicked, also the block whose props show in the right panel).
  // Single-selection codepath: selectedIndices stays in sync as a 1-item set.
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  // Clipboard is an array — copy/paste works on the multi-selection.
  const [clipboard, setClipboard] = useState<BlockData[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Sidebar collapse — fullscreen canvas for users who need a wider preview.
  // Defaults open; persisted to localStorage so the choice survives reloads.
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  // Mini-map shown by default; hidden via toolbar toggle (less noise for users
  // who don't want it). Persisted alongside sidebar state.
  const [miniMapVisible, setMiniMapVisible] = useState(true);
  const canvasScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const l = window.localStorage.getItem("wb_editor_left_collapsed");
    const r = window.localStorage.getItem("wb_editor_right_collapsed");
    const m = window.localStorage.getItem("wb_editor_minimap_visible");
    if (l === "1") setLeftCollapsed(true);
    if (r === "1") setRightCollapsed(true);
    if (m === "0") setMiniMapVisible(false);
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("wb_editor_minimap_visible", miniMapVisible ? "1" : "0");
  }, [miniMapVisible]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("wb_editor_left_collapsed", leftCollapsed ? "1" : "0");
  }, [leftCollapsed]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("wb_editor_right_collapsed", rightCollapsed ? "1" : "0");
  }, [rightCollapsed]);

  // Compute the grid-template-columns based on what's collapsed. The expanded
  // size matches the original 240/1fr/320 layout. SPACES (not underscores) —
  // this string is passed to a real CSS property via inline style, so it must
  // be valid CSS. Underscores would only be correct as Tailwind class
  // shorthand, which gets transformed at build time.
  const gridCols = useMemo(() => {
    const L = leftCollapsed ? "0" : "240px";
    const R = rightCollapsed ? "0" : "320px";
    return `${L} 1fr ${R}`;
  }, [leftCollapsed, rightCollapsed]);

  // Theme state — loaded from the site, applied as CSS vars on canvas.
  const [theme, setTheme] = useState<ThemeJson>(DEFAULT_THEME);
  const [originalTheme, setOriginalTheme] = useState<ThemeJson>(DEFAULT_THEME);
  const [themeOpen, setThemeOpen] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);

  useEffect(() => {
    ensureFontCatalogLoaded();
  }, []);

  useEffect(() => {
    api<Page[]>(`/api/v1/sites/${params.id}/pages`)
      .then((list) => {
        setPages(list);
        const home = list.find((p) => p.is_home) ?? list[0] ?? null;
        if (home) {
          setCurrentId(home.id);
          const bs = home.tree?.blocks ?? [];
          replaceAll(bs);
          setBlockKeys(makeKeys(bs.length));
          setOriginalBlocks(bs);
          setSelectedIdx(bs.length ? 0 : -1);
        }
      })
      .catch((e) => toast.error((e as Error).message));

    // Site fetch parallel — feeds theme into the canvas.
    api<Site>(`/api/v1/sites/${params.id}`)
      .then((s) => {
        if (s.theme && Object.keys(s.theme).length > 0) {
          setTheme(s.theme);
          setOriginalTheme(s.theme);
        }
      })
      .catch(() => {
        /* non-fatal — canvas falls back to defaults */
      });
  }, [params.id]);

  const current = useMemo(
    () => pages.find((p) => p.id === currentId) ?? null,
    [pages, currentId],
  );

  function selectPage(p: Page) {
    // Warn before discarding unsaved changes on the current page.
    if (blocksDirty && !confirm("Ada perubahan belum disimpan. Pindah halaman?")) return;
    setCurrentId(p.id);
    const bs = p.tree?.blocks ?? [];
    replaceAll(bs);
    setBlockKeys(makeKeys(bs.length));
    setOriginalBlocks(bs);
    setSelectedIdx(bs.length ? 0 : -1);
    setSelectedIndices(bs.length ? new Set([0]) : new Set());
  }

  /**
   * Unified selection handler. Supports:
   *   - shift-click: extend range from anchor to clicked
   *   - meta/ctrl-click: toggle the clicked index in the set
   *   - plain click: single-select (clears the set)
   * The PropEditor + Layout panels always read the LAST clicked block
   * (`selectedIdx`) so bulk operations work without ambiguity over which
   * block is the "current" one.
   */
  function selectAt(i: number, mods?: { shift?: boolean; meta?: boolean }) {
    if (mods?.shift && selectedIdx >= 0 && selectedIdx !== i) {
      const lo = Math.min(selectedIdx, i);
      const hi = Math.max(selectedIdx, i);
      const range = new Set<number>();
      for (let k = lo; k <= hi; k++) range.add(k);
      setSelectedIndices(range);
      setSelectedIdx(i);
      return;
    }
    if (mods?.meta) {
      setSelectedIndices((prev) => {
        const next = new Set(prev);
        if (next.has(i)) next.delete(i);
        else next.add(i);
        return next;
      });
      setSelectedIdx(i);
      return;
    }
    setSelectedIndices(new Set([i]));
    setSelectedIdx(i);
  }

  // Dirty checks — JSON.stringify is fine for the typical block-tree size and
  // gives a precise (false-negative-free) reading.
  const blocksDirty = useMemo(
    () => JSON.stringify(blocks) !== JSON.stringify(originalBlocks),
    [blocks, originalBlocks],
  );
  const themeDirty = useMemo(
    () => JSON.stringify(theme) !== JSON.stringify(originalTheme),
    [theme, originalTheme],
  );

  // CSS variables applied to the preview canvas wrapper. By overriding the
  // same shadcn HSL tokens the dashboard uses internally (primary, background,
  // foreground, secondary, radius), every `bg-primary` / `text-foreground`
  // class inside the canvas renders in the SITE'S colour — true WYSIWYG with
  // zero block-by-block rewrite. The renderer-style `--color-*` and
  // `--font-*` vars are also set so the same blocks that go to production
  // (which use `style={{background: "var(--color-primary)"}}`) match too.
  const canvasStyle = useMemo<React.CSSProperties>(() => {
    const c = theme.colors ?? {};
    const primary = c.primary ?? "#2563eb";
    const secondary = c.secondary ?? "#0ea5e9";
    const bg = c.bg ?? "#ffffff";
    const fg = c.fg ?? "#0f172a";
    const style: Record<string, string> = {
      // shadcn-style HSL tokens — override locally so tailwind classes pick
      // them up inside .wb-canvas only.
      "--background": hexToHslComponents(bg) ?? "0 0% 100%",
      "--foreground": hexToHslComponents(fg) ?? "222 47% 11%",
      "--card": hexToHslComponents(bg) ?? "0 0% 100%",
      "--card-foreground": hexToHslComponents(fg) ?? "222 47% 11%",
      "--primary": hexToHslComponents(primary) ?? "221 83% 53%",
      "--primary-foreground": readableForeground(primary),
      "--secondary": hexToHslComponents(secondary) ?? "199 89% 48%",
      "--secondary-foreground": readableForeground(secondary),
      "--muted": hexToHslComponents(fg) ?? "215 16% 47%",
      "--muted-foreground": hexToHslComponents(fg) ?? "215 16% 47%",
      "--border": hexToHslComponents(fg) ?? "214 32% 91%",
      "--input": hexToHslComponents(fg) ?? "214 32% 91%",
      "--ring": hexToHslComponents(primary) ?? "221 83% 53%",
      "--radius": theme.radius ?? "0.75rem",
      // Renderer-style raw colour vars (used by future inline-style blocks).
      "--color-primary": primary,
      "--color-secondary": secondary,
      "--color-bg": bg,
      "--color-fg": fg,
      // Font vars — read by .wb-canvas typography rules in globals.css.
      "--wb-font-heading": theme.font?.heading
        ? `"${theme.font.heading}", system-ui, sans-serif`
        : `"Inter", system-ui, sans-serif`,
      "--wb-font-body": theme.font?.body
        ? `"${theme.font.body}", system-ui, sans-serif`
        : `"Inter", system-ui, sans-serif`,
      // Apply background+foreground directly so even an empty canvas matches
      // the site (otherwise the dashboard's neutral grey shows through).
      backgroundColor: bg,
      color: fg,
    };
    return style as React.CSSProperties;
  }, [theme]);

  // -------- Block mutations --------
  // Every mutator must keep `blockKeys` aligned with `blocks` so the DnD
  // sortable context stays consistent across renders.

  function newKey() {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  }

  function addBlock(type: string, atIdx?: number) {
    const schema = schemaFor(type);
    if (!schema) return;
    const newBlock: BlockData = { type, props: structuredClone(schema.defaults) };
    insertNewBlock(newBlock, atIdx);
  }

  // Insert a pre-built BlockData (e.g. from a saved snippet). Deep-clones so
  // the saved snippet's reference isn't shared if the user inserts multiple
  // copies on the same page.
  function addBlockFromData(b: BlockData, atIdx?: number) {
    insertNewBlock(structuredClone(b), atIdx);
  }

  function insertNewBlock(block: BlockData, atIdx?: number) {
    const insertIdx = atIdx ?? blocks.length;
    const next = [...blocks.slice(0, insertIdx), block, ...blocks.slice(insertIdx)];
    const keys = [...blockKeys.slice(0, insertIdx), newKey(), ...blockKeys.slice(insertIdx)];
    setBlocks(next);
    setBlockKeys(keys);
    setSelectedIdx(insertIdx);
    setPaletteOpen(false);
  }

  function updateBlock(i: number, next: BlockData) {
    const arr = [...blocks];
    arr[i] = next;
    setBlocks(arr);
  }

  function removeBlock(i: number) {
    removeBlocks(new Set([i]));
  }

  // Bulk delete — removes every index in `indices` in a single state update so
  // history records ONE undo step (not N).
  function removeBlocks(indices: Set<number>) {
    if (indices.size === 0) return;
    const arr = blocks.filter((_, idx) => !indices.has(idx));
    const keys = blockKeys.filter((_, idx) => !indices.has(idx));
    setBlocks(arr);
    setBlockKeys(keys);
    // Re-anchor selection to the next surviving block (or last).
    const remaining = arr.length;
    if (remaining === 0) {
      setSelectedIdx(-1);
      setSelectedIndices(new Set());
      return;
    }
    const next = Math.min(selectedIdx, remaining - 1);
    setSelectedIdx(Math.max(0, next));
    setSelectedIndices(new Set([Math.max(0, next)]));
  }

  function moveBlock(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const arr = [...blocks];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    const keys = [...blockKeys];
    [keys[i], keys[j]] = [keys[j], keys[i]];
    setBlocks(arr);
    setBlockKeys(keys);
    if (selectedIdx === i) setSelectedIdx(j);
    else if (selectedIdx === j) setSelectedIdx(i);
  }

  function reorderBlocks(from: number, to: number) {
    if (from === to) return;
    const { items, keys } = reorderWithKeys(blocks, blockKeys, from, to);
    setBlocks(items);
    setBlockKeys(keys);
    // Keep selection on the moved item if it was selected.
    if (selectedIdx === from) setSelectedIdx(to);
    else if (from < selectedIdx && to >= selectedIdx) setSelectedIdx(selectedIdx - 1);
    else if (from > selectedIdx && to <= selectedIdx) setSelectedIdx(selectedIdx + 1);
  }

  function duplicateBlock(i: number) {
    duplicateBlocks(new Set([i]));
  }

  // Bulk duplicate — clones every selected block in order; inserts the clones
  // contiguously right after the last selected index.
  function duplicateBlocks(indices: Set<number>) {
    if (indices.size === 0) return;
    const sorted = [...indices].sort((a, b) => a - b);
    const clones = sorted.map((i) => structuredClone(blocks[i]));
    const newKeys = sorted.map(() => newKey());
    const insertAt = sorted[sorted.length - 1] + 1;
    const next = [...blocks.slice(0, insertAt), ...clones, ...blocks.slice(insertAt)];
    const keys = [...blockKeys.slice(0, insertAt), ...newKeys, ...blockKeys.slice(insertAt)];
    setBlocks(next);
    setBlockKeys(keys);
    // Move selection to the newly inserted clones.
    const newSet = new Set<number>();
    for (let k = 0; k < clones.length; k++) newSet.add(insertAt + k);
    setSelectedIndices(newSet);
    setSelectedIdx(insertAt);
  }

  function copyBlock(i: number) {
    copyBlocks(new Set([i]));
  }

  // Save a single block as a reusable snippet. Prompts for a name so the user
  // can find it later — defaults to "<BlockLabel> #<n>" but they almost always
  // override.
  async function saveSnippet(i: number) {
    if (i < 0 || i >= blocks.length) return;
    const b = blocks[i];
    const schema = schemaFor(b.type);
    const defaultName = `${schema?.label ?? b.type}`;
    const name = window.prompt("Beri nama snippet:", defaultName);
    if (!name || !name.trim()) return;
    try {
      await api(`/api/v1/snippets`, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          block_type: b.type,
          // structuredClone keeps the JSONb stable + drops React-managed refs.
          block: structuredClone(b),
        }),
      });
      toast.success(`Snippet "${name.trim()}" tersimpan`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function copyBlocks(indices: Set<number>) {
    if (indices.size === 0) return;
    const sorted = [...indices].sort((a, b) => a - b);
    const out = sorted.map((i) => structuredClone(blocks[i]));
    setClipboard(out);
    if (out.length === 1) {
      toast.success(`Disalin: ${schemaFor(out[0].type)?.label ?? out[0].type}`);
    } else {
      toast.success(`Disalin: ${out.length} block`);
    }
  }

  function pasteBlock() {
    if (!clipboard || clipboard.length === 0) return;
    const insertIdx = selectedIdx >= 0 ? selectedIdx + 1 : blocks.length;
    const clones = clipboard.map((b) => structuredClone(b));
    const newKeys = clones.map(() => newKey());
    const next = [...blocks.slice(0, insertIdx), ...clones, ...blocks.slice(insertIdx)];
    const keys = [...blockKeys.slice(0, insertIdx), ...newKeys, ...blockKeys.slice(insertIdx)];
    setBlocks(next);
    setBlockKeys(keys);
    const newSet = new Set<number>();
    for (let k = 0; k < clones.length; k++) newSet.add(insertIdx + k);
    setSelectedIndices(newSet);
    setSelectedIdx(insertIdx);
  }

  // savedAt — wall clock for "Tersimpan otomatis 12 dtk lalu" display.
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // Marks whether the upcoming save was triggered by autosave (silent) vs
  // an explicit user action (toast).
  const autosaveRef = useRef(false);

  async function save(opts?: { silent?: boolean }) {
    if (!current) return;
    setSaving(true);
    try {
      const updated = await api<Page>(`/api/v1/pages/${current.id}`, {
        method: "PATCH",
        body: JSON.stringify({ tree: { blocks } }),
      });
      setPages((ps) => ps.map((p) => (p.id === updated.id ? updated : p)));
      setOriginalBlocks(blocks);
      setSavedAt(Date.now());
      if (!opts?.silent) toast.success("Halaman tersimpan");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // -------- Publish (draft → live) --------
  const [publishing, setPublishing] = useState(false);

  async function publish() {
    if (!current) return;
    // Always save draft first so the live copy reflects the latest edits.
    if (blocksDirty) {
      try {
        await save({ silent: true });
      } catch {
        return; // save() already toasted the error
      }
    }
    setPublishing(true);
    try {
      const updated = await api<Page>(`/api/v1/pages/${current.id}/publish`, {
        method: "POST",
      });
      setPages((ps) => ps.map((p) => (p.id === updated.id ? updated : p)));
      toast.success("Halaman live ✓");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPublishing(false);
    }
  }

  // True when the draft has unpublished edits (or page has never been published).
  const hasUnpublishedChanges = useMemo(() => {
    if (!current) return false;
    if (!current.published_at) return blocks.length > 0; // never published
    const liveBlocks = current.published_tree?.blocks ?? [];
    // Compare against the LAST SAVED draft (originalBlocks), not the current
    // unsaved one — autosave will commit the dirty draft shortly. Without this
    // the indicator flickers while the user types.
    return JSON.stringify(originalBlocks) !== JSON.stringify(liveBlocks);
  }, [current, blocks, originalBlocks]);

  // -------- Preview link --------
  // Generate a signed HMAC token + open the renderer's /_preview/<token> route
  // in a new tab. Token TTL 1h — server-side enforced. If the draft has dirty
  // changes we save first so the preview reflects what the user just edited.
  async function openPreview() {
    if (!current) return;
    if (blocksDirty) {
      try {
        await save({ silent: true });
      } catch {
        return;
      }
    }
    try {
      const res = await api<{ token: string; path: string }>(
        `/api/v1/pages/${current.id}/preview-token`,
        { method: "POST" },
      );
      const rendererBase =
        process.env.NEXT_PUBLIC_RENDERER_BASE ?? window.location.origin;
      // path returned is "/_preview/<token>" but the API API base is dashboard;
      // we want the renderer host. Strip API prefix if any and prepend
      // configured renderer base.
      const previewPath = `/_preview/${res.token}`;
      window.open(`${rendererBase}${previewPath}`, "_blank", "noopener");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function saveTheme() {
    setSavingTheme(true);
    try {
      await api(`/api/v1/sites/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({ theme }),
      });
      setOriginalTheme(theme);
      toast.success("Tema tersimpan");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingTheme(false);
    }
  }

  // -------- Autosave --------
  // Debounce 3s. Fires when blocks change AND there are dirty changes AND we
  // aren't already saving. Manual save (⌘S / Simpan button) clears the
  // pending timer so we don't double-fire. Page switch also clears it.
  useEffect(() => {
    if (!current || !blocksDirty || saving) return;
    const handle = window.setTimeout(() => {
      autosaveRef.current = true;
      save({ silent: true }).finally(() => {
        autosaveRef.current = false;
      });
    }, 3000);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, current, blocksDirty, saving]);

  // Keyboard shortcuts — global. We ignore shortcuts while the user is typing
  // in an input/textarea/contentEditable so inline edit isn't hijacked.
  useEffect(() => {
    function isEditingTarget(t: EventTarget | null): boolean {
      const el = t as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable === true
      );
    }

    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      const editing = isEditingTarget(e.target);

      // ⌘S — save (always, even while editing — user expectation)
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
        return;
      }

      // ⌘Z / ⌘⇧Z — undo / redo
      if (mod && e.key.toLowerCase() === "z") {
        // Don't fight the browser's built-in undo when typing.
        if (editing) return;
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        if (editing) return;
        e.preventDefault();
        redo();
        return;
      }

      // ⌘D — duplicate (bulk when multi-selected)
      if (mod && e.key.toLowerCase() === "d") {
        if (editing) return;
        e.preventDefault();
        if (selectedIndices.size > 1) duplicateBlocks(selectedIndices);
        else if (selectedIdx >= 0) duplicateBlock(selectedIdx);
        return;
      }

      // ⌘C / ⌘V — copy/paste (bulk-aware)
      if (mod && e.key.toLowerCase() === "c") {
        if (editing) return;
        if (selectedIndices.size > 0) {
          e.preventDefault();
          copyBlocks(selectedIndices);
        } else if (selectedIdx >= 0) {
          e.preventDefault();
          copyBlock(selectedIdx);
        }
        return;
      }
      if (mod && e.key.toLowerCase() === "v") {
        if (editing) return;
        if (clipboard) {
          e.preventDefault();
          pasteBlock();
        }
        return;
      }

      // ⌘A — select all blocks
      if (mod && e.key.toLowerCase() === "a") {
        if (editing) return;
        if (blocks.length === 0) return;
        e.preventDefault();
        setSelectedIndices(new Set(blocks.map((_, i) => i)));
        return;
      }

      // Delete / Backspace — bulk delete when multi-selected
      if ((e.key === "Delete" || e.key === "Backspace") && !editing) {
        if (selectedIndices.size > 1) {
          e.preventDefault();
          if (confirm(`Hapus ${selectedIndices.size} block?`)) {
            removeBlocks(selectedIndices);
          }
          return;
        }
        if (selectedIdx >= 0) {
          e.preventDefault();
          const schema = schemaFor(blocks[selectedIdx]?.type ?? "");
          if (confirm(`Hapus block "${schema?.label ?? blocks[selectedIdx]?.type}"?`)) {
            removeBlock(selectedIdx);
          }
        }
        return;
      }

      // / — open palette
      if (e.key === "/" && !editing) {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }

      // ↑ / ↓ — navigate block list (when not editing)
      if (!editing && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        if (blocks.length === 0) return;
        e.preventDefault();
        const dir = e.key === "ArrowUp" ? -1 : 1;
        const next = Math.max(0, Math.min(blocks.length - 1, selectedIdx + dir));
        setSelectedIdx(next);
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, current, selectedIdx, clipboard, canUndo, canRedo]);

  const previewWidth = device === "mobile" ? 375 : device === "tablet" ? 768 : "100%";

  return (
    <div
      className="grid h-[calc(100vh-140px)] gap-3 transition-[grid-template-columns] duration-200 ease-out"
      style={{ gridTemplateColumns: gridCols }}
    >
      {/* ---------- Sidebar kiri: Pages + Block tree ---------- */}
      <aside
        className={cn(
          "flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-all",
          leftCollapsed && "pointer-events-none border-transparent bg-transparent opacity-0",
        )}
      >
        {/* Pages list */}
        <div className="border-b p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <Layers className="size-3.5 text-muted-foreground" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Halaman
            </span>
          </div>
          <ul className="space-y-0.5">
            {pages.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => selectPage(p)}
                  className={cn(
                    "group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-all",
                    currentId === p.id
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span className="truncate">{p.title || p.slug}</span>
                  {p.is_home && (
                    <span
                      className={cn(
                        "ml-2 rounded-full px-1.5 py-0 text-[9px] font-medium uppercase",
                        currentId === p.id
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      home
                    </span>
                  )}
                </button>
              </li>
            ))}
            {pages.length === 0 && (
              <li className="px-2 py-3 text-xs text-muted-foreground">Memuat…</li>
            )}
          </ul>
        </div>

        {/* Block tree */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-muted-foreground" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Block ({blocks.length})
              </span>
            </div>
            <Button
              size="sm"
              variant="default"
              onClick={() => setPaletteOpen(true)}
              className="h-7 gap-1 px-2 shadow-sm"
            >
              <Plus className="size-3" />
              Tambah
            </Button>
          </div>

          {blocks.length === 0 ? (
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-input py-8 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
            >
              <Plus className="size-4" />
              Tambah block pertama
            </button>
          ) : (
            <SortableBlockList
              blocks={blocks}
              keys={blockKeys}
              selectedIdx={selectedIdx}
              selectedIndices={selectedIndices}
              onSelect={selectAt}
              onReorder={reorderBlocks}
              onMove={moveBlock}
              onDuplicate={duplicateBlock}
              onDelete={removeBlock}
            />
          )}
        </div>
      </aside>

      {/* ---------- Center: Preview ---------- */}
      <section className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 border-b bg-card/95 px-3 py-2 backdrop-blur">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setLeftCollapsed((v) => !v)}
              title={leftCollapsed ? "Tampilkan sidebar kiri" : "Sembunyikan sidebar kiri"}
            >
              {leftCollapsed ? (
                <PanelLeftOpen className="size-3.5" />
              ) : (
                <PanelLeftClose className="size-3.5" />
              )}
            </Button>
            <div className="inline-flex items-center gap-0.5 rounded-md bg-muted p-0.5 shadow-inner">
              <DeviceBtn
                active={device === "desktop"}
                onClick={() => setDevice("desktop")}
                icon={Monitor}
                label="Desktop"
              />
              <DeviceBtn
                active={device === "tablet"}
                onClick={() => setDevice("tablet")}
                icon={Tablet}
                label="Tablet"
              />
              <DeviceBtn
                active={device === "mobile"}
                onClick={() => setDevice("mobile")}
                icon={Smartphone}
                label="Mobile"
              />
            </div>
            <span className="hidden items-center gap-1 text-[11px] text-muted-foreground md:inline-flex">
              <Eye className="size-3" />
              {device === "desktop" ? "Auto" : device === "tablet" ? "768px" : "375px"}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className={cn("size-7", miniMapVisible && "bg-muted text-foreground")}
              onClick={() => setMiniMapVisible((v) => !v)}
              title={miniMapVisible ? "Sembunyikan mini-map" : "Tampilkan mini-map"}
            >
              <MapIcon className="size-3.5" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {/* <span className="hidden truncate text-xs text-muted-foreground sm:inline">
              {current?.slug ? `/${current.slug}` : "—"}
            </span> */}
            {/* Undo / Redo — visible affordance for the new history capability */}
            <div className="inline-flex items-center gap-0.5 rounded-md border bg-background p-0.5 shadow-sm">
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={undo}
                disabled={!canUndo}
                title="Undo (⌘Z)"
              >
                <Undo2 className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={redo}
                disabled={!canRedo}
                title="Redo (⌘⇧Z)"
              >
                <Redo2 className="size-3.5" />
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setThemeOpen(true)}
              className="relative gap-1.5"
            >
              <Palette className="size-3.5" />
              <span className="hidden sm:inline">Tema</span>
              {themeDirty && (
                <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-amber-500 ring-2 ring-card" />
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={openPreview}
              disabled={!current}
              className="gap-1.5"
              title="Pratinjau draft di tab baru — link berlaku 1 jam"
            >
              <Eye className="size-3.5" />
              <span className="hidden sm:inline">Pratinjau</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSettingsOpen(true)}
              disabled={!current}
              className="gap-1.5"
              title="Pengaturan halaman: judul, SEO, status"
            >
              <Settings2 className="size-3.5" />
              <span className="hidden sm:inline">Pengaturan</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHistoryOpen(true)}
              disabled={!current}
              className="gap-1.5"
            >
              <History className="size-3.5" />
              <span className="hidden sm:inline">Riwayat</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => save()}
              disabled={saving || !current || !blocksDirty}
              size="sm"
              className="relative gap-1.5"
            >
              <Save className="size-3.5" />
              {saving ? "Menyimpan…" : "Simpan Draft"}
              {blocksDirty && !saving && (
                <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-amber-400 ring-2 ring-card" />
              )}
            </Button>
            <Button
              onClick={publish}
              disabled={publishing || !current || (!hasUnpublishedChanges && !blocksDirty)}
              size="sm"
              className="relative gap-1.5 shadow-sm"
              title="Salin draft ke versi live yang ditampilkan ke pengunjung"
            >
              <Rocket className="size-3.5" />
              {publishing ? "Menerbitkan…" : "Terbitkan"}
              {hasUnpublishedChanges && !publishing && (
                <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-emerald-400 ring-2 ring-primary" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setRightCollapsed((v) => !v)}
              title={rightCollapsed ? "Tampilkan panel kanan" : "Sembunyikan panel kanan"}
            >
              {rightCollapsed ? (
                <PanelRightOpen className="size-3.5" />
              ) : (
                <PanelRightClose className="size-3.5" />
              )}
            </Button>
          </div>
        </div>

        {/* Canvas — browser-like frame. Outer wrapper paints dashboard chrome
            (browser top bar uses dashboard tokens); INNER .wb-canvas applies
            the site theme so blocks inside render in the user's palette/fonts.
            Position relative so the mini-map can pin to its edge. */}
        <div ref={canvasScrollRef} className="relative flex-1 overflow-auto bg-muted/30 p-4">
          {miniMapVisible && (
            <MiniMap
              blocks={blocks}
              keys={blockKeys}
              selectedIdx={selectedIdx}
              selectedIndices={selectedIndices}
              onJump={setSelectedIdx}
              scrollContainerRef={canvasScrollRef}
            />
          )}
          <div
            className="mx-auto overflow-hidden rounded-xl border border-foreground/10 shadow-lg transition-all duration-300 ease-out"
            style={{ width: previewWidth, maxWidth: "100%" }}
          >
            {/* Fake browser chrome (dashboard-tokened, not themed) */}
            <div className="flex items-center gap-1.5 border-b bg-muted/40 px-3 py-2">
              <span className="size-2.5 rounded-full bg-red-400" />
              <span className="size-2.5 rounded-full bg-amber-400" />
              <span className="size-2.5 rounded-full bg-emerald-400" />
              <div className="mx-3 flex-1 truncate rounded-md bg-background px-2.5 py-0.5 text-[10px] text-muted-foreground">
                {current ? `${current.slug === "home" ? "" : "/" + current.slug}` : "/"}
              </div>
            </div>
            <div className="wb-canvas" style={canvasStyle}>
              <Preview
                blocks={blocks}
                keys={blockKeys}
                onSelect={setSelectedIdx}
                selectedIdx={selectedIdx}
                onAdd={() => setPaletteOpen(true)}
                onUpdate={updateBlock}
                onMove={moveBlock}
                onDuplicate={duplicateBlock}
                onSaveSnippet={saveSnippet}
                onDelete={removeBlock}
                device={device}
              />
            </div>
          </div>
        </div>

        {/* Status bar: dirty state + keyboard hints */}
        <div className="flex items-center justify-between gap-3 border-t bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              {saving ? (
                <>
                  <Loader2 className="size-3 animate-spin" />
                  Menyimpan…
                </>
              ) : blocksDirty ? (
                <>
                  <span className="size-1.5 animate-pulse rounded-full bg-amber-500" />
                  Belum disimpan · autosave 3 dtk
                </>
              ) : (
                <>
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  <SavedAgo at={savedAt} />
                </>
              )}
            </span>
            <Separator orientation="vertical" className="h-3" />
            <span className="hidden sm:inline">
              {blocks.length} block · halaman {pages.length}
              {selectedIndices.size > 1 && (
                <>
                  {" · "}
                  <span className="font-medium text-primary">
                    {selectedIndices.size} dipilih
                  </span>
                </>
              )}
            </span>
            <Separator orientation="vertical" className="hidden h-3 sm:block" />
            <span className="hidden items-center gap-1.5 sm:inline-flex">
              {current?.published_at ? (
                hasUnpublishedChanges ? (
                  <>
                    <span className="size-1.5 rounded-full bg-amber-500" />
                    Live · ada draft baru
                  </>
                ) : (
                  <>
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    Live
                  </>
                )
              ) : (
                <>
                  <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                  Belum dipublikasikan
                </>
              )}
            </span>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <Kbd>⌘Z</Kbd>
            <span>Undo</span>
            <Separator orientation="vertical" className="h-3" />
            <Kbd>⌘D</Kbd>
            <span>Duplikat</span>
            <Separator orientation="vertical" className="h-3" />
            <Kbd>/</Kbd>
            <span>Tambah</span>
            <Separator orientation="vertical" className="h-3" />
            <Kbd>⌘S</Kbd>
            <span>Simpan</span>
          </div>
        </div>
      </section>

      {/* ---------- Sidebar kanan: Property editor ---------- */}
      <aside
        className={cn(
          "overflow-y-auto rounded-xl border bg-card p-4 shadow-sm transition-all",
          rightCollapsed && "pointer-events-none border-transparent bg-transparent p-0 opacity-0",
        )}
      >
        {selectedIdx >= 0 && blocks[selectedIdx] ? (
          <>
            <div className="mb-3 flex items-start gap-2">
              <span className="text-xl">
                {schemaFor(blocks[selectedIdx].type)?.emoji ?? "🧩"}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold">
                  {schemaFor(blocks[selectedIdx].type)?.label ?? blocks[selectedIdx].type}
                </h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Block #{selectedIdx + 1} ·{" "}
                  {schemaFor(blocks[selectedIdx].type)?.description ?? "Edit properti di bawah"}
                </p>
              </div>
            </div>
            <Separator className="mb-4" />
            <PropEditor
              block={blocks[selectedIdx]}
              onChange={(next) => updateBlock(selectedIdx, next)}
            />
            <Separator className="my-4" />
            <LayoutPanel
              block={blocks[selectedIdx]}
              onChange={(next) => updateBlock(selectedIdx, next)}
              device={device}
              onDeviceChange={setDevice}
            />
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <div className="grid size-12 place-items-center rounded-xl bg-muted">
              <Sparkles className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">Pilih block</p>
            <p className="text-xs text-muted-foreground">
              Klik block di sidebar atau di preview untuk mengedit propertinya.
            </p>
          </div>
        )}
      </aside>

      <ThemeDrawer
        open={themeOpen}
        onClose={() => setThemeOpen(false)}
        theme={theme}
        onChange={setTheme}
        onSave={saveTheme}
        saving={savingTheme}
        dirty={themeDirty}
      />

      <BlockPaletteDialog
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onPick={addBlock}
        onPickSnippet={(block) => addBlockFromData(block)}
      />

      <HistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        pageId={current?.id ?? null}
        onRestored={(p) => {
          setPages((ps) => ps.map((x) => (x.id === p.id ? p : x)));
          setBlocks(p.tree?.blocks ?? []);
          setSelectedIdx(p.tree?.blocks?.length ? 0 : -1);
          setHistoryOpen(false);
          toast.success("Versi berhasil dipulihkan");
        }}
      />

      <PageSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        page={current}
        onUpdated={(next) => {
          setPages((ps) =>
            ps.map((p) =>
              p.id === next.id
                ? {
                    ...p,
                    slug: next.slug,
                    title: next.title,
                    is_home: next.is_home ?? p.is_home,
                    published_at: next.published_at ?? null,
                    // seo is a free-form record; cast keeps the strict Page type
                    // happy without inventing nullable fields.
                    ...(next as unknown as Partial<Page>),
                  }
                : p,
            ),
          );
        }}
      />
    </div>
  );
}

// ---------- Block palette (categorized + searchable) ----------

type Snippet = {
  id: string;
  name: string;
  block_type: string;
  block: BlockData;
  created_at: string;
};

function BlockPaletteDialog({
  open,
  onOpenChange,
  onPick,
  onPickSnippet,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (type: string) => void;
  onPickSnippet: (block: BlockData) => void;
}) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "pro" | "standard" | "snippets">("all");
  const [snippets, setSnippets] = useState<Snippet[] | null>(null);
  const [snippetsLoading, setSnippetsLoading] = useState(false);
  useEffect(() => {
    if (!open) {
      setQ("");
      setTab("all");
    }
  }, [open]);
  // Lazy-load snippets only when tab is opened — avoids fetching for users
  // who never use this feature.
  useEffect(() => {
    if (!open || tab !== "snippets" || snippets !== null) return;
    setSnippetsLoading(true);
    api<Snippet[]>("/api/v1/snippets")
      .then(setSnippets)
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setSnippetsLoading(false));
  }, [open, tab, snippets]);

  // Filtered snippets based on search query.
  const filteredSnippets = useMemo(() => {
    if (!snippets) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return snippets;
    return snippets.filter(
      (s) =>
        s.name.toLowerCase().includes(needle) ||
        s.block_type.toLowerCase().includes(needle),
    );
  }, [snippets, q]);

  async function deleteSnippet(id: string) {
    if (!confirm("Hapus snippet ini?")) return;
    try {
      await api(`/api/v1/snippets/${id}`, { method: "DELETE" });
      setSnippets((s) => s?.filter((x) => x.id !== id) ?? null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const grouped = useMemo(() => blockSchemasByCategory(), []);
  const proCount = useMemo(
    () => grouped.find((g) => g.key === "pro")?.blocks.length ?? 0,
    [grouped],
  );
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let g = grouped;
    if (tab === "pro") g = g.filter((x) => x.key === "pro");
    if (tab === "standard") g = g.filter((x) => x.key !== "pro");
    if (!needle) return g;
    return g
      .map((cat) => ({
        ...cat,
        blocks: cat.blocks.filter(
          (b) =>
            b.label.toLowerCase().includes(needle) ||
            b.type.toLowerCase().includes(needle) ||
            (b.description ?? "").toLowerCase().includes(needle),
        ),
      }))
      .filter((cat) => cat.blocks.length > 0);
  }, [grouped, q, tab]);

  const totalShown = filtered.reduce((sum, g) => sum + g.blocks.length, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 p-0">
        <DialogHeader className="border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10">
              <Sparkles className="size-4 text-primary" />
            </div>
            <div>
              <DialogTitle>Tambah Block</DialogTitle>
              <DialogDescription className="mt-0.5">
                Pilih dari {blockSchemas.length} block ready-to-use. Cari nama atau ketegori.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="border-b px-6 py-3">
          {/* Tab filter — All / Pro / Standard */}
          <div className="mb-3 inline-flex items-center gap-0.5 rounded-md bg-muted p-0.5 shadow-inner">
            <PaletteTab
              active={tab === "all"}
              onClick={() => setTab("all")}
              label={`Semua · ${blockSchemas.length}`}
            />
            <PaletteTab
              active={tab === "pro"}
              onClick={() => setTab("pro")}
              label={
                <span className="inline-flex items-center gap-1">
                  <span
                    className="inline-block bg-gradient-to-r from-violet-500 via-pink-500 to-amber-500 bg-clip-text font-semibold text-transparent"
                  >
                    Pro ✨
                  </span>
                  <span className="text-muted-foreground">· {proCount}</span>
                </span>
              }
            />
            <PaletteTab
              active={tab === "standard"}
              onClick={() => setTab("standard")}
              label={`Standar · ${blockSchemas.length - proCount}`}
            />
            <PaletteTab
              active={tab === "snippets"}
              onClick={() => setTab("snippets")}
              label={
                <span className="inline-flex items-center gap-1">
                  <Bookmark className="size-3" />
                  Snippets
                  {snippets && (
                    <span className="text-muted-foreground">· {snippets.length}</span>
                  )}
                </span>
              }
            />
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari block (mis. hero, pricing, faq)…"
              className="h-9 pl-9"
            />
            {q && (
              <button
                onClick={() => setQ("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Clear"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="max-h-[60vh] space-y-6 overflow-y-auto p-6">
          {tab === "snippets" ? (
            // ----- Snippets tab -----
            snippetsLoading ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Memuat snippets…
              </p>
            ) : filteredSnippets.length === 0 ? (
              <div className="py-12 text-center">
                <Bookmark className="mx-auto size-8 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">
                  {snippets && snippets.length === 0
                    ? "Belum ada snippet. Klik 🔖 di toolbar block untuk simpan."
                    : `Tidak ada snippet cocok "${q}".`}
                </p>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {filteredSnippets.map((s) => {
                  const schema = schemaFor(s.block_type);
                  return (
                    <div
                      key={s.id}
                      className="group/sn relative flex items-start gap-3 rounded-lg border bg-card p-3 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                    >
                      <button
                        onClick={() => onPickSnippet(s.block)}
                        className="flex flex-1 items-start gap-3 text-left"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-lg group-hover/sn:bg-primary/10">
                          {schema?.emoji ?? "🧩"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{s.name}</div>
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                            {schema?.label ?? s.block_type} ·{" "}
                            {new Date(s.created_at).toLocaleDateString("id-ID")}
                          </p>
                        </div>
                      </button>
                      <button
                        onClick={() => deleteSnippet(s.id)}
                        className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover/sn:opacity-100"
                        title="Hapus snippet"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Tidak ada block yang cocok dengan &quot;{q}&quot;.
            </p>
          ) : (
            filtered.map((cat) => {
              const isPro = cat.key === "pro";
              return (
              <div key={cat.key}>
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className={cn(
                      "text-[10px] font-semibold uppercase tracking-widest",
                      isPro
                        ? "bg-gradient-to-r from-violet-500 via-pink-500 to-amber-500 bg-clip-text text-transparent"
                        : "text-muted-foreground",
                    )}
                  >
                    {cat.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    · {cat.blocks.length}
                  </span>
                  <div className={cn("ml-auto h-px flex-1", isPro ? "bg-gradient-to-r from-violet-500/40 via-pink-500/40 to-amber-500/40" : "bg-border")} />
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {cat.blocks.map((b) => (
                    <button
                      key={b.type}
                      onClick={() => onPick(b.type)}
                      className={cn(
                        "group/card flex items-start gap-3 rounded-lg border p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md",
                        isPro
                          ? "border-violet-500/20 bg-gradient-to-br from-violet-500/[0.04] via-card to-amber-500/[0.03] hover:border-violet-500/50"
                          : "bg-card hover:border-primary/40",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-9 shrink-0 place-items-center rounded-md text-lg transition-colors",
                          isPro
                            ? "bg-gradient-to-br from-violet-500/20 via-pink-500/15 to-amber-500/20"
                            : "bg-muted group-hover/card:bg-primary/10",
                        )}
                      >
                        {b.emoji ?? "🧩"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{b.label}</div>
                        {b.description ? (
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                            {b.description}
                          </p>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              );
            })
          )}
        </div>

        {q && tab !== "snippets" && totalShown > 0 && (
          <div className="border-t bg-muted/30 px-6 py-2 text-center text-[11px] text-muted-foreground">
            {totalShown} block ditemukan untuk &quot;{q}&quot;
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- History dialog ----------

function HistoryDialog({
  open,
  onOpenChange,
  pageId,
  onRestored,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pageId: string | null;
  onRestored: (p: Page) => void;
}) {
  const [versions, setVersions] = useState<PageVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !pageId) return;
    setLoading(true);
    api<PageVersion[]>(`/api/v1/pages/${pageId}/versions?limit=50`)
      .then(setVersions)
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  }, [open, pageId]);

  async function restore(v: PageVersion) {
    if (!pageId) return;
    if (
      !confirm(
        `Pulihkan ke versi v${v.version} (${new Date(v.created_at).toLocaleString("id-ID")})?\nVersi saat ini akan tetap tersimpan sebagai snapshot.`,
      )
    )
      return;
    setRestoring(v.id);
    try {
      const p = await api<Page>(`/api/v1/pages/${pageId}/restore/${v.id}`, {
        method: "POST",
      });
      onRestored(p);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRestoring(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Riwayat Halaman</DialogTitle>
          <DialogDescription>
            Setiap kali Anda menyimpan, snapshot otomatis dibuat. Pilih versi untuk dipulihkan.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          {loading && (
            <p className="py-8 text-center text-sm text-muted-foreground">Memuat riwayat…</p>
          )}
          {!loading && versions.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Belum ada riwayat. Snapshot dibuat saat Anda menyimpan perubahan konten.
            </p>
          )}
          <ul className="divide-y">
            {versions.map((v) => {
              const blockCount = v.tree?.blocks?.length ?? 0;
              return (
                <li key={v.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="text-sm font-medium">
                      v{v.version}
                      {v.title && <span className="ml-2 text-muted-foreground">{v.title}</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(v.created_at).toLocaleString("id-ID")} · {blockCount} block
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => restore(v)}
                    disabled={restoring === v.id}
                    className="gap-1.5"
                  >
                    <RotateCcw className="size-3.5" />
                    {restoring === v.id ? "Memulihkan…" : "Pulihkan"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Tiny helpers ----------

function PaletteTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-2.5 py-1 text-xs transition-all",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

// SavedAgo renders a live-updating "diperbarui Nm lalu" string. The clock
// ticks every 15s — granular enough for fresh saves (< 1m) but cheap enough
// that we don't risk render storms on a busy editor.
function SavedAgo({ at }: { at: number | null }) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!at) return;
    const t = window.setInterval(() => force((n) => n + 1), 15_000);
    return () => window.clearInterval(t);
  }, [at]);
  if (!at) return <>Tersimpan</>;
  const secs = Math.floor((Date.now() - at) / 1000);
  if (secs < 5) return <>Baru saja tersimpan</>;
  if (secs < 60) return <>Tersimpan {secs} dtk lalu</>;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return <>Tersimpan {mins} mnt lalu</>;
  return <>Tersimpan {Math.floor(mins / 60)} jam lalu</>;
}

// marked configured once — drop raw HTML so a malicious markdown like
// `<script>` can't leak through (same hardening blog editor uses).
marked.setOptions({ gfm: true, breaks: false });
marked.use({ renderer: { html: () => "" } });

function renderMarkdownInline(md: string): string {
  if (!md) return "";
  return marked.parse(md, { async: false }) as string;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border bg-background px-1.5 py-px font-mono text-[10px] font-medium text-foreground/70 shadow-sm">
      {children}
    </kbd>
  );
}

function DeviceBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "inline-flex h-7 items-center justify-center rounded px-2.5 text-xs transition-all",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" />
    </button>
  );
}

function Preview({
  blocks,
  keys,
  onSelect,
  selectedIdx,
  onAdd,
  onUpdate,
  onMove,
  onDuplicate,
  onSaveSnippet,
  onDelete,
  device,
}: {
  blocks: BlockData[];
  keys: string[];
  onSelect: (i: number) => void;
  selectedIdx: number;
  onAdd: () => void;
  onUpdate: (i: number, next: BlockData) => void;
  onMove: (i: number, dir: -1 | 1) => void;
  onDuplicate: (i: number) => void;
  onSaveSnippet: (i: number) => void;
  onDelete: (i: number) => void;
  device: "desktop" | "tablet" | "mobile";
}) {
  if (blocks.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-12 text-center">
        <div className="grid size-14 place-items-center rounded-2xl bg-muted">
          <Sparkles className="size-6 text-muted-foreground" />
        </div>
        <h3 className="text-base font-semibold">Halaman masih kosong</h3>
        <p className="max-w-xs text-sm text-muted-foreground">
          Mulai membangun dengan menambah block pertama dari palette.
        </p>
        <Button onClick={onAdd} className="mt-2 gap-2 shadow-sm">
          <Plus className="size-4" />
          Tambah Block
        </Button>
      </div>
    );
  }
  return (
    <div className="animate-in fade-in duration-200">
      {blocks.map((b, i) => {
        // Resolve the layout for the device the user is previewing. mobile =
        // base; tablet/desktop = base + that breakpoint's patch (merged).
        // This way the canvas preview matches what the renderer will paint
        // via @media rules in production.
        const effectiveLayout = layoutForBreakpoint(b.layout, device);
        // Block hidden on this device → don't render at all (but keep selection
        // available via sidebar so user can un-hide).
        if (b.layout?.hidden?.[device]) {
          return (
            <div
              key={keys[i] ?? i}
              data-block-key={keys[i] ?? String(i)}
              onClick={() => onSelect(i)}
              className={cn(
                "flex cursor-pointer items-center gap-2 border border-dashed border-muted-foreground/30 bg-muted/20 px-4 py-2 text-xs text-muted-foreground",
                selectedIdx === i && "border-primary/60 bg-primary/5",
              )}
            >
              <EyeOff className="size-3" />
              Block disembunyikan di {device} · klik untuk pilih
            </div>
          );
        }
        const wrapperStyle = buildLayoutStyle({
          layout: effectiveLayout,
          themeOverride: b.themeOverride,
        });
        const innerStyle = buildMaxWidthStyle({ layout: effectiveLayout });
        // CRITICAL: the colour override must apply to BLOCK CONTENT only.
        // Keeping the toolbar inside the themed wrapper made it inherit the
        // user's --background / --primary overrides — turning the chrome
        // unreadable. So we render two siblings: the themed content div
        // (where wrapper styles live) and the toolbar (which stays in
        // dashboard chrome).
        return (
          <div
            key={keys[i] ?? i}
            data-block-key={keys[i] ?? String(i)}
            onClick={() => onSelect(i)}
            className={cn(
              "group/blk relative cursor-pointer transition-all duration-150",
              selectedIdx === i
                ? "outline outline-2 outline-primary"
                : "hover:outline hover:outline-1 hover:outline-muted-foreground/40",
            )}
          >
            {/* Themed content — block markup inherits the override */}
            <div style={wrapperStyle}>
              {innerStyle ? (
                <div style={innerStyle}>
                  <BlockView
                    block={b}
                    onUpdate={(next) => onUpdate(i, next)}
                    editable={selectedIdx === i}
                  />
                </div>
              ) : (
                <BlockView
                  block={b}
                  onUpdate={(next) => onUpdate(i, next)}
                  editable={selectedIdx === i}
                />
              )}
            </div>
            {/* Toolbar — sibling, OUTSIDE the themed div, so its bg/border
                stay on dashboard chrome regardless of block colour override. */}
            {selectedIdx === i && (
              <CanvasBlockToolbar
                block={b}
                index={i}
                total={blocks.length}
                onMove={(dir) => onMove(i, dir)}
                onDuplicate={() => onDuplicate(i)}
                onSaveSnippet={() => onSaveSnippet(i)}
                onDelete={() => onDelete(i)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- Inline block preview ----------

function BlockView({
  block,
  onUpdate,
  editable,
}: {
  block: BlockData;
  onUpdate?: (next: BlockData) => void;
  editable?: boolean;
}) {
  const p = block.props ?? {};
  // setProp commits a single field back to the block tree. Only used by the
  // inline-edit branches — most block types still read-only in the canvas and
  // are edited via the side panel.
  function setProp(name: string, value: unknown) {
    if (!onUpdate) return;
    onUpdate({ ...block, props: { ...p, [name]: value } });
  }
  // setItemProp updates one field of one item inside an `items`-shaped array
  // prop. Used by blocks with item-shaped data (FeatureList, PricingTable,
  // testimonials, etc.) so the inline canvas edit can target a deep field.
  function setItemProp(arrName: string, idx: number, key: string, value: unknown) {
    if (!onUpdate) return;
    const arr = Array.isArray(p[arrName])
      ? (p[arrName] as Array<Record<string, unknown>>)
      : [];
    const next = [...arr];
    next[idx] = { ...next[idx], [key]: value };
    onUpdate({ ...block, props: { ...p, [arrName]: next } });
  }
  switch (block.type) {
    case "Navbar":
      return (
        <div className="flex items-center justify-between border-b px-6 py-4">
          <strong>{String(p.brand ?? "")}</strong>
          <div className="flex gap-4 text-sm">
            {(p.links as Array<{ label: string; href: string }> | undefined)?.map((l, i) => (
              <span key={i} className="text-muted-foreground">
                {l.label}
              </span>
            ))}
          </div>
        </div>
      );
    case "Hero":
      return (
        <div className="px-6 py-16 text-center">
          {editable ? (
            <EditableText
              as="h1"
              className="text-3xl font-bold"
              value={String(p.title ?? "")}
              onChange={(v) => setProp("title", v)}
              placeholder="Judul hero…"
            />
          ) : (
            <h1 className="text-3xl font-bold">{String(p.title ?? "")}</h1>
          )}
          {editable ? (
            <EditableText
              as="p"
              className="mt-2 text-muted-foreground"
              value={String(p.subtitle ?? "")}
              onChange={(v) => setProp("subtitle", v)}
              placeholder="Subjudul…"
              multiline
            />
          ) : (
            <p className="mt-2 text-muted-foreground">{String(p.subtitle ?? "")}</p>
          )}
          {p.ctaLabel ? (
            <button className="mt-4 rounded-lg bg-primary px-4 py-2 text-primary-foreground">
              {String(p.ctaLabel)}
            </button>
          ) : null}
        </div>
      );
    case "HeroSpotlight":
      return (
        <div className="relative overflow-hidden bg-gradient-to-b from-primary/5 via-background to-background px-6 py-20 text-center">
          <div className="pointer-events-none absolute left-1/2 top-0 size-[400px] -translate-x-1/2 rounded-full bg-primary/20 opacity-40 blur-3xl wb-spotlight-anim" />
          {p.eyebrow ? (
            <div className="relative mb-4 inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              {String(p.eyebrow)}
            </div>
          ) : null}
          {editable ? (
            <EditableText
              as="h1"
              className="relative text-4xl font-bold tracking-tight"
              value={String(p.title ?? "")}
              onChange={(v) => setProp("title", v)}
              placeholder="Judul…"
            />
          ) : (
            <h1 className="relative text-4xl font-bold tracking-tight">{String(p.title ?? "")}</h1>
          )}
          {editable ? (
            <EditableText
              as="p"
              className="relative mx-auto mt-3 max-w-xl text-sm text-muted-foreground"
              value={String(p.subtitle ?? "")}
              onChange={(v) => setProp("subtitle", v)}
              placeholder="Subjudul…"
              multiline
            />
          ) : (
            <p className="relative mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
              {String(p.subtitle ?? "")}
            </p>
          )}
          <div className="relative mt-6 flex justify-center gap-2">
            {p.ctaLabel ? (
              <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md">
                {String(p.ctaLabel)} →
              </button>
            ) : null}
            {p.ctaSecondaryLabel ? (
              <button className="rounded-lg border px-4 py-2 text-sm font-medium">
                {String(p.ctaSecondaryLabel)}
              </button>
            ) : null}
          </div>
        </div>
      );
    case "Heading":
      return editable ? (
        <EditableText
          as="h2"
          className="px-6 py-4 text-2xl font-bold"
          value={String(p.text ?? "")}
          onChange={(v) => setProp("text", v)}
          placeholder="Judul…"
        />
      ) : (
        <h2 className="px-6 py-4 text-2xl font-bold">{String(p.text ?? "")}</h2>
      );
    case "Text":
      return editable ? (
        <EditableText
          as="p"
          className="whitespace-pre-line px-6 py-2"
          value={String(p.body ?? "")}
          onChange={(v) => setProp("body", v)}
          placeholder="Paragraf…"
          multiline
        />
      ) : (
        <p className="whitespace-pre-line px-6 py-2">{String(p.body ?? "")}</p>
      );
    case "RichText": {
      // Markdown → HTML inline. We use the same `marked` lib + `wb-prose` class
      // as the blog renderer so the preview matches production styling.
      const html = renderMarkdownInline(String(p.body ?? ""));
      return (
        <div className="wb-prose px-6 py-4" dangerouslySetInnerHTML={{ __html: html }} />
      );
    }
    case "Section":
      return (
        <div className="px-6 py-6">
          {editable ? (
            <EditableText
              as="h3"
              className="text-lg font-semibold"
              value={String(p.title ?? "")}
              onChange={(v) => setProp("title", v)}
              placeholder="Judul section…"
            />
          ) : p.title ? (
            <h3 className="text-lg font-semibold">{String(p.title)}</h3>
          ) : null}
          {editable ? (
            <EditableText
              as="p"
              className="mt-1 whitespace-pre-line"
              value={String(p.body ?? "")}
              onChange={(v) => setProp("body", v)}
              placeholder="Isi…"
              multiline
            />
          ) : (
            <p className="mt-1 whitespace-pre-line">{String(p.body ?? "")}</p>
          )}
        </div>
      );
    case "FeatureList":
      return (
        <div className="px-6 py-6">
          {editable ? (
            <EditableText
              as="h3"
              className="mb-3 text-lg font-semibold"
              value={String(p.title ?? "")}
              onChange={(v) => setProp("title", v)}
              placeholder="Judul…"
            />
          ) : p.title ? (
            <h3 className="mb-3 text-lg font-semibold">{String(p.title)}</h3>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3">
            {(p.items as Array<Record<string, unknown>> | undefined)?.map((it, i) => (
              <div key={i} className="rounded-lg border p-3">
                {editable ? (
                  <>
                    <EditableText
                      as="div"
                      className="font-medium"
                      value={String(it.title ?? "")}
                      onChange={(v) => setItemProp("items", i, "title", v)}
                      placeholder="Judul fitur…"
                    />
                    <EditableText
                      as="div"
                      className="text-sm text-muted-foreground"
                      value={String(it.desc ?? "")}
                      onChange={(v) => setItemProp("items", i, "desc", v)}
                      placeholder="Deskripsi…"
                      multiline
                    />
                  </>
                ) : (
                  <>
                    <div className="font-medium">{String(it.title ?? "")}</div>
                    <div className="text-sm text-muted-foreground">{String(it.desc ?? "")}</div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    case "BentoGrid":
      return (
        <div className="px-6 py-6">
          {p.title ? (
            <h3 className="mb-4 text-center text-xl font-bold">{String(p.title)}</h3>
          ) : null}
          <div className="grid auto-rows-[5rem] grid-cols-3 gap-2">
            {(p.items as Array<{ title: string; desc: string; size?: string }> | undefined)?.map(
              (it, i) => {
                const span =
                  it.size === "large"
                    ? "col-span-2 row-span-2"
                    : it.size === "wide"
                      ? "col-span-2"
                      : "";
                return (
                  <div
                    key={i}
                    className={`rounded-lg border bg-gradient-to-br from-foreground/[0.02] to-foreground/[0.06] p-3 ${span}`}
                  >
                    <div className="text-xs font-semibold">{it.title}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">{it.desc}</div>
                  </div>
                );
              },
            )}
          </div>
        </div>
      );
    case "StatsBar":
      return (
        <div className="px-6 py-6">
          <div className="grid grid-cols-2 gap-y-4 rounded-lg border p-4 sm:grid-cols-4">
            {(p.items as Array<{ value: string; label: string }> | undefined)?.map((it, i) => (
              <div key={i} className="text-center">
                <div className="text-2xl font-bold text-primary">{it.value}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {it.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    case "LogoCloud":
      return (
        <div className="px-6 py-6">
          {p.title ? (
            <p className="mb-3 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
              {String(p.title)}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 opacity-60">
            {(p.items as Array<{ name: string; image?: string }> | undefined)?.map((it, i) => (
              <span key={i} className="text-sm font-semibold">
                {it.name}
              </span>
            ))}
          </div>
        </div>
      );
    case "CTABanner":
      return (
        <div className="px-6 py-6">
          <div className="rounded-2xl bg-gradient-to-r from-primary to-primary/70 px-6 py-10 text-center text-white">
            <h2 className="text-2xl font-bold">{String(p.title ?? "")}</h2>
            <p className="mt-2 text-sm opacity-90">{String(p.subtitle ?? "")}</p>
            {p.ctaLabel ? (
              <button className="mt-4 rounded-full bg-white px-5 py-2 text-sm font-medium text-foreground">
                {String(p.ctaLabel)} →
              </button>
            ) : null}
          </div>
        </div>
      );
    case "PricingTable":
      return (
        <div className="px-6 py-6">
          {editable ? (
            <EditableText
              as="h3"
              className="text-center text-xl font-bold"
              value={String(p.title ?? "")}
              onChange={(v) => setProp("title", v)}
              placeholder="Judul pricing…"
            />
          ) : p.title ? (
            <h3 className="text-center text-xl font-bold">{String(p.title)}</h3>
          ) : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {(p.items as Array<Record<string, unknown>> | undefined)?.map((it, i) => {
              const featured = it.featured === "yes" || it.featured === "true";
              return (
                <div
                  key={i}
                  className={cn(
                    "rounded-lg border p-3",
                    featured && "border-2 border-primary",
                  )}
                >
                  {editable ? (
                    <>
                      <EditableText
                        as="div"
                        className="text-xs font-semibold"
                        value={String(it.title ?? "")}
                        onChange={(v) => setItemProp("items", i, "title", v)}
                        placeholder="Nama paket"
                      />
                      <EditableText
                        as="div"
                        className="mt-1 text-lg font-bold"
                        value={String(it.price ?? "")}
                        onChange={(v) => setItemProp("items", i, "price", v)}
                        placeholder="Harga"
                      />
                    </>
                  ) : (
                    <>
                      <div className="text-xs font-semibold">{String(it.title ?? "")}</div>
                      <div className="mt-1 text-lg font-bold">{String(it.price ?? "")}</div>
                    </>
                  )}
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {String(it.period ?? "")}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    case "FAQ":
      return (
        <div className="px-6 py-6">
          {p.title ? (
            <h3 className="mb-3 text-center text-xl font-bold">{String(p.title)}</h3>
          ) : null}
          <div className="space-y-1 rounded-lg border p-2">
            {(p.items as Array<{ question: string }> | undefined)?.map((it, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-md px-2 py-2 text-xs hover:bg-muted/50"
              >
                <span>{it.question}</span>
                <ChevronDown className="size-3 text-muted-foreground" />
              </div>
            ))}
          </div>
        </div>
      );
    case "TestimonialMarquee":
      return (
        <div className="px-6 py-6">
          {p.title ? (
            <h3 className="mb-3 text-center text-xl font-bold">{String(p.title)}</h3>
          ) : null}
          <div className="wb-marquee-mask overflow-hidden">
            <div className="flex gap-2">
              {(p.items as Array<{ name: string; text: string }> | undefined)
                ?.slice(0, 5)
                .map((t, i) => (
                  <div
                    key={i}
                    className="w-48 shrink-0 rounded-lg border bg-muted/30 p-3 text-[10px]"
                  >
                    <p className="line-clamp-2 opacity-80">&ldquo;{t.text}&rdquo;</p>
                    <div className="mt-2 text-[9px] font-semibold">— {t.name}</div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      );
    case "Testimonial":
      return (
        <div className="bg-muted/40 px-6 py-6">
          {(p.items as Array<{ name: string; text: string }> | undefined)?.map((t, i) => (
            <blockquote key={i} className="border-l-4 border-primary pl-4 italic">
              &ldquo;{t.text}&rdquo; —{" "}
              <span className="not-italic font-medium">{t.name}</span>
            </blockquote>
          ))}
        </div>
      );
    case "ProductGrid":
    case "ProjectGrid":
    case "BlogList":
      return (
        <div className="px-6 py-6">
          {p.title ? <h3 className="mb-3 text-lg font-semibold">{String(p.title)}</h3> : null}
          <div className="grid gap-3 sm:grid-cols-3">
            {(p.items as Array<Record<string, unknown>> | undefined)?.map((it, i) => (
              <div key={i} className="rounded-lg border p-3">
                <div className="font-medium">{String(it.title ?? it.name ?? "")}</div>
                <div className="text-sm text-muted-foreground">
                  {String(it.desc ?? it.excerpt ?? it.price ?? "")}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    case "Footer":
      return (
        <div className="border-t px-6 py-4 text-center text-sm text-muted-foreground">
          {String(p.copyright ?? "")}
        </div>
      );
    case "ProductGridDynamic":
      return (
        <div className="px-6 py-6">
          {p.title ? (
            <h3 className="mb-3 text-lg font-semibold">{String(p.title)}</h3>
          ) : null}
          <div className="rounded-md border border-dashed border-primary/30 bg-primary/5 p-4 text-center text-sm text-primary">
            🛍 Akan menampilkan {String(p.limit ?? 12)} produk aktif dari tab{" "}
            <strong>Produk</strong>.
          </div>
        </div>
      );
    case "BlogListDynamic":
      return (
        <div className="px-6 py-6">
          {p.title ? (
            <h3 className="mb-3 text-lg font-semibold">{String(p.title)}</h3>
          ) : null}
          <div className="rounded-md border border-dashed border-primary/30 bg-primary/5 p-4 text-center text-sm text-primary">
            📝 Akan menampilkan {String(p.limit ?? 10)} artikel published terbaru dari tab{" "}
            <strong>Blog</strong>.
          </div>
        </div>
      );

    // -------- New blocks (compact preview) --------

    case "HeroSplit": {
      const reversed = String(p.reversed ?? "") === "yes";
      return (
        <div className="px-6 py-10">
          <div className={cn("grid items-center gap-6 sm:grid-cols-2", reversed && "sm:[&>div:first-child]:order-2")}>
            <div>
              {p.eyebrow ? (
                <div className="mb-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {String(p.eyebrow)}
                </div>
              ) : null}
              <h1 className="text-2xl font-bold tracking-tight">{String(p.title ?? "")}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{String(p.subtitle ?? "")}</p>
              <div className="mt-4 flex gap-2">
                {p.ctaLabel ? (
                  <span className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
                    {String(p.ctaLabel)}
                  </span>
                ) : null}
                {p.ctaSecondaryLabel ? (
                  <span className="rounded-md border px-3 py-1.5 text-xs font-medium">
                    {String(p.ctaSecondaryLabel)}
                  </span>
                ) : null}
              </div>
            </div>
            {p.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={String(p.image)} alt="" className="w-full rounded-lg border" />
            ) : (
              <div className="aspect-video w-full rounded-lg bg-gradient-to-br from-primary/15 to-primary/5" />
            )}
          </div>
        </div>
      );
    }

    case "Banner":
      return (
        <div className="flex items-center justify-center gap-3 bg-primary px-6 py-2 text-center text-xs text-primary-foreground">
          <span>{String(p.text ?? "")}</span>
          {p.ctaLabel ? (
            <span className="font-semibold underline underline-offset-2">{String(p.ctaLabel)}</span>
          ) : null}
        </div>
      );

    case "Divider":
      return (
        <div className="px-6 py-4">
          {p.label ? (
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-foreground/15" />
              <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                {String(p.label)}
              </span>
              <div className="h-px flex-1 bg-foreground/15" />
            </div>
          ) : (
            <div className="h-px w-full bg-foreground/10" />
          )}
        </div>
      );

    case "Spacer":
      return (
        <div className="relative">
          <div
            style={{ height: Math.min(Number(p.size ?? 64), 160) + "px" }}
            className="border-y border-dashed border-foreground/15 bg-foreground/[0.02]"
          />
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
            {String(p.size ?? 64)}px spacer
          </span>
        </div>
      );

    case "Quote":
      return (
        <div className="px-8 py-8">
          <div className="text-3xl leading-none text-primary opacity-40">❝</div>
          {editable ? (
            <EditableText
              as="blockquote"
              className="mt-2 text-base font-medium leading-snug"
              value={String(p.text ?? "")}
              onChange={(v) => setProp("text", v)}
              placeholder="Tulis quote di sini…"
              multiline
            />
          ) : (
            <blockquote className="mt-2 text-base font-medium leading-snug">
              {String(p.text ?? "")}
            </blockquote>
          )}
          <div className="mt-3 text-xs font-semibold">
            —{" "}
            {editable ? (
              <EditableText
                as="span"
                value={String(p.author ?? "")}
                onChange={(v) => setProp("author", v)}
                placeholder="Nama"
              />
            ) : (
              <>{String(p.author ?? "")}</>
            )}{" "}
            {(p.role || editable) && (
              <span className="font-normal text-muted-foreground">
                ({editable ? (
                  <EditableText
                    as="span"
                    value={String(p.role ?? "")}
                    onChange={(v) => setProp("role", v)}
                    placeholder="Jabatan"
                  />
                ) : (
                  String(p.role)
                )})
              </span>
            )}
          </div>
        </div>
      );

    case "Alert": {
      const variant = String(p.variant ?? "info");
      const cls: Record<string, string> = {
        info: "border-blue-500/30 bg-blue-500/10",
        success: "border-emerald-500/30 bg-emerald-500/10",
        warning: "border-amber-500/30 bg-amber-500/10",
        danger: "border-red-500/30 bg-red-500/10",
      };
      const ic: Record<string, string> = {
        info: "ℹ️",
        success: "✅",
        warning: "⚠️",
        danger: "❗",
      };
      return (
        <div className="px-6 py-4">
          <div className={cn("flex gap-3 rounded-lg border p-3 text-xs", cls[variant] ?? cls.info)}>
            <span className="text-lg leading-none">{ic[variant] ?? ic.info}</span>
            <div>
              <div className="font-semibold">{String(p.title ?? "")}</div>
              <div className="mt-0.5 opacity-80">{String(p.body ?? "")}</div>
            </div>
          </div>
        </div>
      );
    }

    case "FeatureSide":
      return (
        <div className="space-y-6 px-6 py-6">
          {(p.items as Array<{ title: string; desc: string; image?: string }> | undefined)
            ?.slice(0, 2)
            .map((it, i) => (
              <div
                key={i}
                className={cn(
                  "grid items-center gap-4 sm:grid-cols-2",
                  i % 2 === 1 && "sm:[&>div:first-child]:order-2",
                )}
              >
                <div>
                  <h4 className="text-base font-bold">{it.title}</h4>
                  <p className="mt-1 text-xs text-muted-foreground">{it.desc}</p>
                </div>
                {it.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.image} alt="" className="w-full rounded-md border" />
                ) : (
                  <div className="aspect-video w-full rounded-md bg-gradient-to-br from-primary/15 to-primary/5" />
                )}
              </div>
            ))}
        </div>
      );

    case "Timeline":
      return (
        <div className="px-6 py-6">
          {p.title ? <h3 className="mb-4 text-base font-bold">{String(p.title)}</h3> : null}
          <ol className="relative space-y-3 border-l-2 border-primary/30 pl-5">
            {(p.items as Array<{ date: string; title: string }> | undefined)?.slice(0, 4).map((it, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[27px] grid size-4 place-items-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <div className="text-[10px] font-semibold uppercase text-primary">{it.date}</div>
                <div className="text-xs font-medium">{it.title}</div>
              </li>
            ))}
          </ol>
        </div>
      );

    case "ProcessSteps":
      return (
        <div className="px-6 py-6">
          {p.title ? <h3 className="text-center text-base font-bold">{String(p.title)}</h3> : null}
          <div className="mt-4 grid grid-cols-3 gap-3">
            {(p.items as Array<{ title: string; desc: string }> | undefined)?.slice(0, 3).map((it, i) => (
              <div key={i} className="text-center">
                <div className="mx-auto grid size-8 place-items-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
                  {i + 1}
                </div>
                <div className="mt-1.5 text-xs font-semibold">{it.title}</div>
              </div>
            ))}
          </div>
        </div>
      );

    case "TeamGrid":
      return (
        <div className="px-6 py-6">
          {p.title ? <h3 className="text-center text-base font-bold">{String(p.title)}</h3> : null}
          <div className="mt-4 grid grid-cols-4 gap-3">
            {(p.items as Array<{ name: string; role: string; image?: string }> | undefined)?.slice(0, 4).map((it, i) => (
              <div key={i} className="text-center">
                {it.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.image} alt={it.name} className="mx-auto size-12 rounded-full border-2 border-background object-cover" />
                ) : (
                  <div className="mx-auto grid size-12 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {it.name?.charAt(0) ?? "?"}
                  </div>
                )}
                <div className="mt-1.5 text-[10px] font-semibold">{it.name}</div>
                <div className="text-[9px] text-primary">{it.role}</div>
              </div>
            ))}
          </div>
        </div>
      );

    case "IconList":
      return (
        <div className="px-6 py-6">
          {p.title ? <h3 className="mb-2 text-sm font-bold">{String(p.title)}</h3> : null}
          <ul className="space-y-1.5">
            {(p.items as Array<{ icon: string; text: string }> | undefined)?.slice(0, 5).map((it, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground">
                  {it.icon}
                </span>
                <span>{it.text}</span>
              </li>
            ))}
          </ul>
        </div>
      );

    case "StatsCard":
      return (
        <div className="px-6 py-6">
          <div className="rounded-2xl border bg-muted/30 p-8 text-center">
            <div className="text-5xl font-bold text-primary">{String(p.value ?? "")}</div>
            <div className="mt-2 text-xs uppercase tracking-widest opacity-70">{String(p.label ?? "")}</div>
          </div>
        </div>
      );

    case "VideoEmbed":
      return (
        <div className="px-6 py-6">
          {p.title ? <h3 className="mb-3 text-center text-base font-bold">{String(p.title)}</h3> : null}
          <div className="grid aspect-video w-full place-items-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted text-3xl">
            ▶️
          </div>
          <p className="mt-1.5 truncate text-center font-mono text-[10px] text-muted-foreground">
            {String(p.src ?? "")}
          </p>
        </div>
      );

    case "Map":
      return (
        <div className="px-6 py-6">
          {p.title ? <h3 className="mb-3 text-base font-bold">{String(p.title)}</h3> : null}
          <div className="grid aspect-[16/9] w-full place-items-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted text-3xl">
            🗺️
          </div>
        </div>
      );

    case "Gallery":
      return (
        <div className="px-6 py-6">
          {p.title ? <h3 className="mb-3 text-base font-bold">{String(p.title)}</h3> : null}
          <div className="grid grid-cols-4 gap-1.5">
            {(p.items as Array<{ image?: string; caption?: string }> | undefined)?.slice(0, 8).map((it, i) =>
              it.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={it.image} alt="" className="aspect-square w-full rounded object-cover" />
              ) : (
                <div key={i} className="aspect-square w-full rounded bg-muted" />
              ),
            )}
          </div>
        </div>
      );

    case "SocialLinks":
      return (
        <div className="px-6 py-6 text-center">
          {p.title ? (
            <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              {String(p.title)}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {(p.items as Array<{ platform: string }> | undefined)?.slice(0, 8).map((it, i) => (
              <div
                key={i}
                className="grid size-8 place-items-center rounded-full border bg-card text-[10px] font-bold uppercase text-primary"
              >
                {it.platform.charAt(0)}
              </div>
            ))}
          </div>
        </div>
      );

    case "Newsletter":
      return (
        <div className="px-6 py-6">
          <div className="rounded-2xl border bg-muted/30 p-6 text-center">
            <h3 className="text-base font-bold">{String(p.title ?? "")}</h3>
            {p.subtitle ? <p className="mt-1 text-xs text-muted-foreground">{String(p.subtitle)}</p> : null}
            <div className="mx-auto mt-4 flex max-w-xs gap-1.5">
              <div className="flex-1 rounded-md border bg-background px-2 py-1.5 text-left text-[10px] text-muted-foreground">
                {String(p.placeholder ?? "nama@email.com")}
              </div>
              <span className="rounded-md bg-primary px-2 py-1.5 text-[10px] font-medium text-primary-foreground">
                {String(p.ctaLabel ?? "Subscribe")}
              </span>
            </div>
          </div>
        </div>
      );

    case "ContactForm":
      return (
        <div className="px-6 py-6">
          <div className="text-center">
            <h3 className="text-base font-bold">{String(p.title ?? "")}</h3>
            {p.subtitle ? <p className="mt-1 text-xs text-muted-foreground">{String(p.subtitle)}</p> : null}
          </div>
          <div className="mx-auto mt-3 max-w-xs space-y-1.5 rounded-lg border bg-card p-3">
            <div className="grid grid-cols-2 gap-1.5">
              <div className="rounded-md border bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground">Nama</div>
              <div className="rounded-md border bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground">Email</div>
            </div>
            <div className="rounded-md border bg-muted/40 px-2 py-3 text-[10px] text-muted-foreground">Pesan…</div>
            <div className="rounded-md bg-primary py-1.5 text-center text-[10px] font-medium text-primary-foreground">
              {String(p.ctaLabel ?? "Kirim")}
            </div>
          </div>
        </div>
      );

    case "Tabs":
      return (
        <div className="px-6 py-6">
          <div className="flex gap-1 border-b text-xs">
            {(p.items as Array<{ label: string }> | undefined)?.slice(0, 4).map((it, i) => (
              <span
                key={i}
                className={cn(
                  "border-b-2 px-3 py-1.5 text-xs font-medium",
                  i === 0 ? "border-primary text-foreground" : "border-transparent text-muted-foreground",
                )}
              >
                {it.label}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs opacity-80">
            {(p.items as Array<{ body: string }> | undefined)?.[0]?.body ?? ""}
          </p>
        </div>
      );

    case "TestimonialCard": {
      const rating = Number(p.rating ?? 0);
      return (
        <div className="px-6 py-6">
          <div className="rounded-2xl border bg-muted/30 p-6">
            {rating > 0 && (
              <div className="mb-2 text-sm">
                {Array.from({ length: 5 }).map((_, i) => (
                  <span key={i} className={i < rating ? "text-amber-400" : "text-muted-foreground/30"}>
                    ★
                  </span>
                ))}
              </div>
            )}
            <blockquote className="text-sm font-medium leading-snug">
              &ldquo;{String(p.quote ?? "")}&rdquo;
            </blockquote>
            <div className="mt-3 flex items-center gap-2">
              {p.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={String(p.avatar)} alt="" className="size-8 rounded-full object-cover" />
              ) : (
                <div className="grid size-8 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {String(p.name ?? "?").charAt(0)}
                </div>
              )}
              <div>
                <div className="text-xs font-semibold">{String(p.name ?? "")}</div>
                {p.role ? <div className="text-[10px] text-muted-foreground">{String(p.role)}</div> : null}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // ============================================================
    // PRO blocks — markup matches renderer 1:1 so editor preview is
    // an honest WYSIWYG. Animations come from globals.css (.wb-pro-*).
    // ============================================================

    case "AuroraHero":
      return (
        <div className="wb-pro-aurora">
          {p.eyebrow ? <div className="wb-pro-eyebrow">{String(p.eyebrow)}</div> : null}
          <h1>{String(p.title ?? "")}</h1>
          {p.subtitle ? <p className="wb-pro-sub">{String(p.subtitle)}</p> : null}
          {p.ctaLabel ? <a href={String(p.ctaHref ?? "#")} className="wb-pro-cta">{String(p.ctaLabel)}</a> : null}
        </div>
      );

    case "SpotlightHero":
      return (
        <div className="wb-pro-spotlight">
          <h1>{String(p.title ?? "")}</h1>
          {p.subtitle ? <p className="wb-pro-sub">{String(p.subtitle)}</p> : null}
          {p.ctaLabel ? <a href={String(p.ctaHref ?? "#")} className="wb-pro-cta">{String(p.ctaLabel)}</a> : null}
        </div>
      );

    case "HighlightHero":
      return (
        <div className="wb-pro-highlight">
          <h1>
            {String(p.title ?? "")} <span className="wb-pro-mark">{String(p.highlight ?? "")}</span> {String(p.titleAfter ?? "")}
          </h1>
          {p.subtitle ? <p className="wb-pro-sub">{String(p.subtitle)}</p> : null}
          {p.ctaLabel ? <a href={String(p.ctaHref ?? "#")} className="wb-pro-cta">{String(p.ctaLabel)}</a> : null}
        </div>
      );

    case "LampHero":
      return (
        <div className="wb-pro-lamp">
          <h1>{String(p.title ?? "")}</h1>
          {p.subtitle ? <p className="wb-pro-sub">{String(p.subtitle)}</p> : null}
          {p.ctaLabel ? <a href={String(p.ctaHref ?? "#")} className="wb-pro-cta">{String(p.ctaLabel)}</a> : null}
        </div>
      );

    case "TypewriterHero":
      return (
        <div className="wb-pro-typewriter">
          <h1>
            {String(p.prefix ?? "")} <span className="wb-pro-typed">{String(p.typed ?? "")}</span>
          </h1>
          {p.subtitle ? <p className="wb-pro-sub">{String(p.subtitle)}</p> : null}
          {p.ctaLabel ? <a href={String(p.ctaHref ?? "#")} className="wb-pro-cta">{String(p.ctaLabel)}</a> : null}
        </div>
      );

    case "GradientTextHero":
      return (
        <div className="wb-pro-gtext">
          {p.eyebrow ? <div className="wb-pro-eyebrow">{String(p.eyebrow)}</div> : null}
          <h1>{String(p.title ?? "")}</h1>
          {p.subtitle ? <p className="wb-pro-sub">{String(p.subtitle)}</p> : null}
          {p.ctaLabel ? <a href={String(p.ctaHref ?? "#")} className="wb-pro-cta">{String(p.ctaLabel)}</a> : null}
        </div>
      );

    case "BeamsSection":
      return (
        <div className="wb-pro-beams">
          <h2>{String(p.title ?? "")}</h2>
          {p.subtitle ? <p className="wb-pro-sub">{String(p.subtitle)}</p> : null}
        </div>
      );

    case "MeteorsSection":
      return (
        <div className="wb-pro-meteors">
          <span className="wb-pro-meteor" />
          <span className="wb-pro-meteor" />
          <span className="wb-pro-meteor" />
          <span className="wb-pro-meteor" />
          <span className="wb-pro-meteor" />
          <h2>{String(p.title ?? "")}</h2>
          {p.subtitle ? <p className="wb-pro-sub">{String(p.subtitle)}</p> : null}
        </div>
      );

    case "GradientMeshSection":
      return (
        <div className="wb-pro-mesh">
          <span className="wb-pro-mesh-blob" />
          <span className="wb-pro-mesh-blob" />
          <span className="wb-pro-mesh-blob" />
          <h2>{String(p.title ?? "")}</h2>
          {p.subtitle ? <p className="wb-pro-sub">{String(p.subtitle)}</p> : null}
        </div>
      );

    case "WavyDivider":
      return (
        <div className="wb-pro-wave">
          <div className="wb-pro-wave-track">
            <svg viewBox="0 0 1200 60" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M0 30 Q 150 0 300 30 T 600 30 T 900 30 T 1200 30 V60 H0 Z"
                fill="currentColor"
                opacity="0.15"
              />
            </svg>
          </div>
          {p.label ? <div className="wb-pro-wave-label">{String(p.label)}</div> : null}
        </div>
      );

    case "DotPatternSection":
      return (
        <div className="wb-pro-dots">
          <h2>{String(p.title ?? "")}</h2>
          {p.subtitle ? <p className="wb-pro-sub">{String(p.subtitle)}</p> : null}
        </div>
      );

    case "GlowCardGrid":
      return (
        <div className="wb-pro-glow-grid">
          {p.title ? <h2>{String(p.title)}</h2> : null}
          <div className="wb-pro-grid">
            {(p.items as Array<{ title: string; desc: string }> | undefined)?.map((it, i) => (
              <div key={i} className="wb-pro-glow-card">
                <div className="wb-pro-glow-inner">
                  <h3>{it.title}</h3>
                  <p>{it.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      );

    case "TiltCardGrid":
      return (
        <div className="wb-pro-tilt-grid">
          {p.title ? <h2>{String(p.title)}</h2> : null}
          <div className="wb-pro-grid">
            {(p.items as Array<{ title: string; desc: string }> | undefined)?.map((it, i) => (
              <div key={i} className="wb-pro-tilt-card">
                <h3>{it.title}</h3>
                <p>{it.desc}</p>
              </div>
            ))}
          </div>
        </div>
      );

    case "BorderBeamCard":
      return (
        <div className="wb-pro-beam-card">
          <div className="wb-pro-beam-wrap">
            <div className="wb-pro-beam-inner">
              <div className="text-xs uppercase tracking-widest opacity-60">{String(p.subtitle ?? "")}</div>
              <h3 className="mt-1 text-lg font-bold">{String(p.title ?? "")}</h3>
              <div className="wb-pro-beam-price">
                {String(p.price ?? "")}
                <span className="wb-pro-beam-period">{String(p.period ?? "")}</span>
              </div>
              <ul>
                {(p.bullets as Array<{ text: string }> | undefined)?.map((b, i) => (
                  <li key={i}>{b.text}</li>
                ))}
              </ul>
              {p.ctaLabel ? (
                <a href={String(p.ctaHref ?? "#")} className="wb-pro-cta">
                  {String(p.ctaLabel)}
                </a>
              ) : null}
            </div>
          </div>
        </div>
      );

    case "CardStackShowcase":
      return (
        <div className="wb-pro-stack">
          {p.title ? <h2>{String(p.title)}</h2> : null}
          <div className="wb-pro-stack-wrap">
            {(p.items as Array<{ quote: string; name: string; role: string }> | undefined)
              ?.slice(0, 3)
              .map((it, i) => (
                <div key={i} className="wb-pro-stack-card">
                  <blockquote>&ldquo;{it.quote}&rdquo;</blockquote>
                  <div className="wb-pro-stack-meta">
                    <div className="wb-pro-stack-name">{it.name}</div>
                    <div className="wb-pro-stack-role">{it.role}</div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      );

    case "HoverGlowGrid":
      return (
        <div className="wb-pro-hover-grid">
          {p.title ? <h2>{String(p.title)}</h2> : null}
          <div className="wb-pro-grid">
            {(p.items as Array<{ title: string; desc: string }> | undefined)?.map((it, i) => (
              <div key={i} className="wb-pro-hover-card">
                <h3>{it.title}</h3>
                <p>{it.desc}</p>
              </div>
            ))}
          </div>
        </div>
      );

    case "AnimatedCounterStats":
      return (
        <div className="wb-pro-counters">
          {p.title ? <h2>{String(p.title)}</h2> : null}
          <div className="wb-pro-grid">
            {(p.items as Array<{ value: string; label: string }> | undefined)?.map((it, i) => (
              <div key={i} className="wb-pro-counter-cell">
                <div className="wb-pro-counter-value" style={{ animationDelay: `${i * 0.15}s` }}>
                  {it.value}
                </div>
                <div className="wb-pro-counter-label">{it.label}</div>
              </div>
            ))}
          </div>
        </div>
      );

    case "MovingBorderCTA":
      return (
        <div className="wb-pro-mb-cta">
          <h2>{String(p.title ?? "")}</h2>
          {p.subtitle ? <p className="wb-pro-sub">{String(p.subtitle)}</p> : null}
          {p.ctaLabel ? (
            <a href={String(p.ctaHref ?? "#")} className="wb-pro-mb-btn">
              <span className="wb-pro-mb-inner">{String(p.ctaLabel)}</span>
            </a>
          ) : null}
        </div>
      );

    case "InfiniteMarqueeLogos": {
      // Duplicate items so the marquee loop is seamless.
      const top = (p.itemsTop as Array<{ name: string }> | undefined) ?? [];
      const bottom = (p.itemsBottom as Array<{ name: string }> | undefined) ?? [];
      return (
        <div className="wb-pro-marquee">
          {p.title ? <h2>{String(p.title)}</h2> : null}
          <div className="wb-pro-marquee-row">
            {[...top, ...top].map((it, i) => (
              <span key={"t" + i}>{it.name}</span>
            ))}
          </div>
          <div className="wb-pro-marquee-row">
            {[...bottom, ...bottom].map((it, i) => (
              <span key={"b" + i}>{it.name}</span>
            ))}
          </div>
        </div>
      );
    }

    case "OrbitFeatures": {
      const items = (p.items as Array<{ icon: string; label: string }> | undefined) ?? [];
      // Position items around the ring using a per-item rotate.
      return (
        <div className="wb-pro-orbit">
          <h2>{String(p.title ?? "")}</h2>
          {p.subtitle ? <p className="wb-pro-sub">{String(p.subtitle)}</p> : null}
          <div className="wb-pro-orbit-stage">
            <div className="wb-pro-orbit-center">{String(p.brand ?? "B")}</div>
            <div className="wb-pro-orbit-ring">
              {items.map((it, i) => {
                const angle = (360 / Math.max(items.length, 1)) * i;
                return (
                  <div
                    key={i}
                    className="wb-pro-orbit-item"
                    style={{ transform: `rotate(${angle}deg) translateY(-160px) rotate(${-angle}deg)` }}
                  >
                    <span>{it.icon}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    default:
      return (
        <div className="px-6 py-2 text-xs text-muted-foreground">[block: {block.type}]</div>
      );
  }
}
