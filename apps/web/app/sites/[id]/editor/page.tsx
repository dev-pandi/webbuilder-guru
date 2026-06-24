"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  History,
  Layers,
  Monitor,
  Plus,
  RotateCcw,
  Save,
  Search,
  Smartphone,
  Sparkles,
  Tablet,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
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
import { PropEditor, type BlockData } from "./PropEditor";

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
};

export default function EditorPage() {
  const params = useParams<{ id: string }>();
  const [pages, setPages] = useState<Page[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<BlockData[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number>(-1);
  const [saving, setSaving] = useState(false);
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    api<Page[]>(`/api/v1/sites/${params.id}/pages`)
      .then((list) => {
        setPages(list);
        const home = list.find((p) => p.is_home) ?? list[0] ?? null;
        if (home) {
          setCurrentId(home.id);
          setBlocks(home.tree?.blocks ?? []);
          setSelectedIdx(home.tree?.blocks?.length ? 0 : -1);
        }
      })
      .catch((e) => toast.error((e as Error).message));
  }, [params.id]);

  const current = useMemo(
    () => pages.find((p) => p.id === currentId) ?? null,
    [pages, currentId],
  );

  function selectPage(p: Page) {
    setCurrentId(p.id);
    const bs = p.tree?.blocks ?? [];
    setBlocks(bs);
    setSelectedIdx(bs.length ? 0 : -1);
  }

  function addBlock(type: string, atIdx?: number) {
    const schema = schemaFor(type);
    if (!schema) return;
    const newBlock: BlockData = { type, props: structuredClone(schema.defaults) };
    const insertIdx = atIdx ?? blocks.length;
    const next = [...blocks.slice(0, insertIdx), newBlock, ...blocks.slice(insertIdx)];
    setBlocks(next);
    setSelectedIdx(insertIdx);
    setPaletteOpen(false);
  }

  function updateBlock(i: number, next: BlockData) {
    const arr = [...blocks];
    arr[i] = next;
    setBlocks(arr);
  }

  function removeBlock(i: number) {
    const arr = blocks.filter((_, idx) => idx !== i);
    setBlocks(arr);
    if (selectedIdx >= arr.length) setSelectedIdx(arr.length - 1);
  }

  function moveBlock(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const arr = [...blocks];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setBlocks(arr);
    if (selectedIdx === i) setSelectedIdx(j);
    else if (selectedIdx === j) setSelectedIdx(i);
  }

  async function save() {
    if (!current) return;
    setSaving(true);
    try {
      const updated = await api<Page>(`/api/v1/pages/${current.id}`, {
        method: "PATCH",
        body: JSON.stringify({ tree: { blocks } }),
      });
      setPages((ps) => ps.map((p) => (p.id === updated.id ? updated : p)));
      toast.success("Halaman tersimpan");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // Keyboard shortcut: Cmd+S / Ctrl+S → save
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        save();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, current]);

  const previewWidth = device === "mobile" ? 375 : device === "tablet" ? 768 : "100%";

  return (
    <div className="grid h-[calc(100vh-140px)] gap-3 lg:grid-cols-[240px_1fr_320px]">
      {/* ---------- Sidebar kiri: Pages + Block tree ---------- */}
      <aside className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
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

          <ul className="space-y-1">
            {blocks.map((b, i) => {
              const schema = schemaFor(b.type);
              const active = selectedIdx === i;
              return (
                <li
                  key={i}
                  onClick={() => setSelectedIdx(i)}
                  className={cn(
                    "group flex cursor-pointer items-center gap-2 rounded-md border px-2 py-2 text-sm transition-all",
                    active
                      ? "border-primary/40 bg-primary/5 shadow-sm"
                      : "border-transparent hover:border-input hover:bg-muted/50",
                  )}
                >
                  <span className="text-xs">{schema?.emoji ?? "🧩"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">
                      {schema?.label ?? b.type}
                    </div>
                  </div>
                  <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        moveBlock(i, -1);
                      }}
                      disabled={i === 0}
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
                        moveBlock(i, 1);
                      }}
                      disabled={i === blocks.length - 1}
                      title="Turun"
                    >
                      <ChevronDown className="size-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Hapus block "${schema?.label ?? b.type}"?`)) removeBlock(i);
                      }}
                      title="Hapus"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </span>
                </li>
              );
            })}
            {blocks.length === 0 && (
              <li>
                <button
                  onClick={() => setPaletteOpen(true)}
                  className="flex w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-input py-8 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                >
                  <Plus className="size-4" />
                  Tambah block pertama
                </button>
              </li>
            )}
          </ul>
        </div>
      </aside>

      {/* ---------- Center: Preview ---------- */}
      <section className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 border-b bg-card px-3 py-2">
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

          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {current?.slug ? `/${current.slug}` : "—"}
            </span>
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
              onClick={save}
              disabled={saving || !current}
              size="sm"
              className="gap-1.5 shadow-sm"
            >
              <Save className="size-3.5" />
              {saving ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </div>

        {/* Canvas — browser-like frame */}
        <div className="flex-1 overflow-auto bg-muted/30 p-4">
          <div
            className="mx-auto overflow-hidden rounded-xl border border-foreground/10 bg-background shadow-lg transition-all duration-300 ease-out"
            style={{ width: previewWidth, maxWidth: "100%" }}
          >
            {/* Fake browser chrome */}
            <div className="flex items-center gap-1.5 border-b bg-muted/40 px-3 py-2">
              <span className="size-2.5 rounded-full bg-red-400" />
              <span className="size-2.5 rounded-full bg-amber-400" />
              <span className="size-2.5 rounded-full bg-emerald-400" />
              <div className="mx-3 flex-1 truncate rounded-md bg-background px-2.5 py-0.5 text-[10px] text-muted-foreground">
                {current ? `${current.slug === "home" ? "" : "/" + current.slug}` : "/"}
              </div>
            </div>
            <Preview
              blocks={blocks}
              onSelect={setSelectedIdx}
              selectedIdx={selectedIdx}
              onAdd={() => setPaletteOpen(true)}
            />
          </div>
        </div>
      </section>

      {/* ---------- Sidebar kanan: Property editor ---------- */}
      <aside className="overflow-y-auto rounded-xl border bg-card p-4 shadow-sm">
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

      <BlockPaletteDialog
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onPick={addBlock}
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
    </div>
  );
}

// ---------- Block palette (categorized + searchable) ----------

function BlockPaletteDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (type: string) => void;
}) {
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const grouped = useMemo(() => blockSchemasByCategory(), []);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return grouped;
    return grouped
      .map((g) => ({
        ...g,
        blocks: g.blocks.filter(
          (b) =>
            b.label.toLowerCase().includes(needle) ||
            b.type.toLowerCase().includes(needle) ||
            (b.description ?? "").toLowerCase().includes(needle),
        ),
      }))
      .filter((g) => g.blocks.length > 0);
  }, [grouped, q]);

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
          {filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Tidak ada block yang cocok dengan &quot;{q}&quot;.
            </p>
          ) : (
            filtered.map((cat) => (
              <div key={cat.key}>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {cat.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    · {cat.blocks.length}
                  </span>
                  <div className="ml-auto h-px flex-1 bg-border" />
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {cat.blocks.map((b) => (
                    <button
                      key={b.type}
                      onClick={() => onPick(b.type)}
                      className="group/card flex items-start gap-3 rounded-lg border bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-lg transition-colors group-hover/card:bg-primary/10">
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
            ))
          )}
        </div>

        {q && totalShown > 0 && (
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
  onSelect,
  selectedIdx,
  onAdd,
}: {
  blocks: BlockData[];
  onSelect: (i: number) => void;
  selectedIdx: number;
  onAdd: () => void;
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
      {blocks.map((b, i) => (
        <div
          key={i}
          onClick={() => onSelect(i)}
          className={cn(
            "relative cursor-pointer transition-all duration-150",
            selectedIdx === i
              ? "outline outline-2 outline-primary"
              : "hover:outline hover:outline-1 hover:outline-muted-foreground/40",
          )}
        >
          {selectedIdx === i && (
            <span className="pointer-events-none absolute right-2 top-2 z-10 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground shadow-sm">
              {schemaFor(b.type)?.label ?? b.type}
            </span>
          )}
          <BlockView block={b} />
        </div>
      ))}
    </div>
  );
}

// ---------- Inline block preview ----------

function BlockView({ block }: { block: BlockData }) {
  const p = block.props ?? {};
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
          <h1 className="text-3xl font-bold">{String(p.title ?? "")}</h1>
          <p className="mt-2 text-muted-foreground">{String(p.subtitle ?? "")}</p>
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
          <h1 className="relative text-4xl font-bold tracking-tight">{String(p.title ?? "")}</h1>
          <p className="relative mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
            {String(p.subtitle ?? "")}
          </p>
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
      return <h2 className="px-6 py-4 text-2xl font-bold">{String(p.text ?? "")}</h2>;
    case "Text":
      return <p className="whitespace-pre-line px-6 py-2">{String(p.body ?? "")}</p>;
    case "Section":
      return (
        <div className="px-6 py-6">
          {p.title ? <h3 className="text-lg font-semibold">{String(p.title)}</h3> : null}
          <p className="mt-1 whitespace-pre-line">{String(p.body ?? "")}</p>
        </div>
      );
    case "FeatureList":
      return (
        <div className="px-6 py-6">
          {p.title ? <h3 className="mb-3 text-lg font-semibold">{String(p.title)}</h3> : null}
          <div className="grid gap-3 sm:grid-cols-3">
            {(p.items as Array<Record<string, unknown>> | undefined)?.map((it, i) => (
              <div key={i} className="rounded-lg border p-3">
                <div className="font-medium">{String(it.title ?? "")}</div>
                <div className="text-sm text-muted-foreground">{String(it.desc ?? "")}</div>
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
          {p.title ? (
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
                  <div className="text-xs font-semibold">{String(it.title ?? "")}</div>
                  <div className="mt-1 text-lg font-bold">{String(it.price ?? "")}</div>
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
    default:
      return (
        <div className="px-6 py-2 text-xs text-muted-foreground">[block: {block.type}]</div>
      );
  }
}
