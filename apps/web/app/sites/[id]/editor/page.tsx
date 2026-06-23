"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  History,
  Monitor,
  Plus,
  RotateCcw,
  Smartphone,
  Tablet,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { blockSchemas, schemaFor } from "@/lib/blocks";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [showAdd, setShowAdd] = useState(false);
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

  const current = useMemo(() => pages.find((p) => p.id === currentId) ?? null, [pages, currentId]);

  function selectPage(p: Page) {
    setCurrentId(p.id);
    const bs = p.tree?.blocks ?? [];
    setBlocks(bs);
    setSelectedIdx(bs.length ? 0 : -1);
  }

  function addBlock(type: string) {
    const schema = schemaFor(type);
    if (!schema) return;
    const next = [...blocks, { type, props: structuredClone(schema.defaults) }];
    setBlocks(next);
    setSelectedIdx(next.length - 1);
    setShowAdd(false);
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
      toast.success("Tersimpan");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const previewWidth = device === "mobile" ? 375 : device === "tablet" ? 768 : "100%";

  return (
    <div className="grid h-[calc(100vh-140px)] gap-3 lg:grid-cols-[220px_1fr_320px]">
      {/* Sidebar kiri: pages + blocks */}
      <Card className="flex flex-col overflow-hidden p-0">
        <div className="border-b p-2">
          <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Halaman
          </div>
          <ul className="mt-1 space-y-0.5">
            {pages.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => selectPage(p)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition",
                    currentId === p.id
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50",
                  )}
                >
                  <span className="truncate">{p.title || p.slug}</span>
                  {p.is_home && (
                    <span className="ml-2 text-[10px] uppercase text-muted-foreground">home</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Block
            </span>
            <Button
              size="sm"
              onClick={() => setShowAdd((s) => !s)}
              className="h-7 gap-1 px-2"
            >
              <Plus className="size-3" />
              Tambah
            </Button>
          </div>
          {showAdd && (
            <div className="my-2 rounded-md border bg-muted/30 p-2">
              <div className="grid grid-cols-2 gap-1">
                {blockSchemas.map((s) => (
                  <button
                    key={s.type}
                    onClick={() => addBlock(s.type)}
                    className="rounded border bg-background px-2 py-1 text-left text-xs transition hover:border-primary hover:text-primary"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <ul className="space-y-0.5">
            {blocks.map((b, i) => (
              <li
                key={i}
                onClick={() => setSelectedIdx(i)}
                className={cn(
                  "flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm transition",
                  selectedIdx === i ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                )}
              >
                <span className="truncate">
                  <span className="text-muted-foreground">#{i + 1}</span> {b.type}
                </span>
                <span className="flex gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      moveBlock(i, -1);
                    }}
                  >
                    <ChevronUp className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      moveBlock(i, 1);
                    }}
                  >
                    <ChevronDown className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Hapus block?")) removeBlock(i);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </span>
              </li>
            ))}
            {blocks.length === 0 && (
              <li className="px-2 py-3 text-xs text-muted-foreground">Belum ada block.</li>
            )}
          </ul>
        </div>
      </Card>

      {/* Center: preview */}
      <Card className="flex flex-col overflow-hidden p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="inline-flex items-center gap-0.5 rounded-md bg-muted p-0.5">
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHistoryOpen(true)}
              disabled={!current}
            >
              <History />
              Riwayat
            </Button>
            <Button onClick={save} disabled={saving || !current} size="sm">
              {saving ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-muted/30 p-4">
          <div
            className="mx-auto overflow-hidden rounded-lg border bg-background shadow-sm"
            style={{ width: previewWidth, maxWidth: "100%" }}
          >
            <Preview blocks={blocks} onSelect={setSelectedIdx} selectedIdx={selectedIdx} />
          </div>
        </div>
      </Card>

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

      {/* Sidebar kanan: property editor */}
      <Card className="overflow-y-auto p-4">
        {selectedIdx >= 0 && blocks[selectedIdx] ? (
          <>
            <h3 className="text-sm font-semibold">
              Edit Block: <span className="text-primary">{blocks[selectedIdx].type}</span>
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Posisi #{selectedIdx + 1}</p>
            <Separator className="my-3" />
            <PropEditor
              block={blocks[selectedIdx]}
              onChange={(next) => updateBlock(selectedIdx, next)}
            />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Pilih block untuk mengedit.</p>
        )}
      </Card>
    </div>
  );
}

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
    if (!confirm(`Pulihkan ke versi v${v.version} (${new Date(v.created_at).toLocaleString("id-ID")})?\nVersi saat ini akan tetap tersimpan sebagai snapshot.`))
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
                  >
                    <RotateCcw />
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
        "inline-flex h-7 items-center justify-center rounded px-2 text-xs transition",
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
}: {
  blocks: BlockData[];
  onSelect: (i: number) => void;
  selectedIdx: number;
}) {
  if (blocks.length === 0) {
    return (
      <div className="p-12 text-center text-sm text-muted-foreground">
        Belum ada block. Klik <span className="font-medium">+ Tambah</span> di sidebar.
      </div>
    );
  }
  return (
    <>
      {blocks.map((b, i) => (
        <div
          key={i}
          onClick={() => onSelect(i)}
          className={cn(
            "cursor-pointer transition",
            selectedIdx === i
              ? "outline outline-2 outline-primary"
              : "hover:outline hover:outline-1 hover:outline-muted-foreground/40",
          )}
        >
          <BlockView block={b} />
        </div>
      ))}
    </>
  );
}

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
    case "Testimonial":
      return (
        <div className="bg-muted/40 px-6 py-6">
          {(p.items as Array<{ name: string; text: string }> | undefined)?.map((t, i) => (
            <blockquote
              key={i}
              className="border-l-4 border-primary pl-4 italic"
            >
              “{t.text}” — <span className="not-italic font-medium">{t.name}</span>
            </blockquote>
          ))}
        </div>
      );
    case "Footer":
      return (
        <div className="border-t px-6 py-4 text-center text-sm text-muted-foreground">
          {String(p.copyright ?? "")}
        </div>
      );
    default:
      return (
        <div className="px-6 py-2 text-xs text-muted-foreground">[block: {block.type}]</div>
      );
  }
}
