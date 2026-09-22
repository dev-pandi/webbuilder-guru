"use client";

// Shared header/footer editor per site. Data live di `sites.layout_json`
// (kolom JSONB) — dipakai renderer untuk prepend/append ke setiap page. UI
// sengaja standalone (bukan bagian dari editor blocks besar) supaya guru
// bisa edit sekali dan berlaku ke seluruh page tanpa navigasi ke editor.

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { PropEditor, type BlockData } from "../editor/PropEditor";
import { blockSchemas, schemaFor, type BlockSchema } from "@/lib/blocks";
import { cn } from "@/lib/utils";

type SiteLayoutData = {
  header?: BlockData[];
  footer?: BlockData[];
};

type SiteResp = {
  id: string;
  name: string;
  layout?: SiteLayoutData | null;
};

// Rekomendasi block untuk header/footer — muncul di atas palette biar guru
// nggak harus scroll. Sisanya tetap accessible via search.
const HEADER_SUGGESTIONS = ["GuruNavbar", "Navbar"];
const FOOTER_SUGGESTIONS = ["GuruFooter", "Footer"];

type Section = "header" | "footer";

export default function LayoutEditorPage() {
  const params = useParams<{ id: string }>();
  const sid = params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [header, setHeader] = useState<BlockData[]>([]);
  const [footer, setFooter] = useState<BlockData[]>([]);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<{ section: Section; index: number } | null>(null);
  const [pickerFor, setPickerFor] = useState<Section | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const s = await api<SiteResp>(`/api/v1/sites/${sid}`);
        if (!mounted) return;
        setHeader(s.layout?.header ?? []);
        setFooter(s.layout?.footer ?? []);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [sid]);

  function mutate(section: Section, next: BlockData[]) {
    setDirty(true);
    if (section === "header") setHeader(next);
    else setFooter(next);
  }

  function addBlock(section: Section, type: string) {
    const schema = schemaFor(type);
    if (!schema) return;
    const block: BlockData = {
      type,
      props: structuredClone(schema.defaults),
    };
    const current = section === "header" ? header : footer;
    mutate(section, [...current, block]);
    setSelected({ section, index: current.length });
    setPickerFor(null);
  }

  function updateBlock(section: Section, index: number, next: BlockData) {
    const current = section === "header" ? header : footer;
    const arr = [...current];
    arr[index] = next;
    mutate(section, arr);
  }

  function removeBlock(section: Section, index: number) {
    if (!confirm("Hapus block ini dari layout?")) return;
    const current = section === "header" ? header : footer;
    const arr = current.filter((_, i) => i !== index);
    mutate(section, arr);
    if (selected?.section === section && selected.index === index) setSelected(null);
    else if (selected?.section === section && selected.index > index) {
      setSelected({ section, index: selected.index - 1 });
    }
  }

  function moveBlock(section: Section, index: number, dir: -1 | 1) {
    const current = section === "header" ? header : footer;
    const j = index + dir;
    if (j < 0 || j >= current.length) return;
    const arr = [...current];
    [arr[index], arr[j]] = [arr[j], arr[index]];
    mutate(section, arr);
    if (selected?.section === section && selected.index === index) {
      setSelected({ section, index: j });
    }
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await api(`/api/v1/sites/${sid}`, {
        method: "PATCH",
        body: JSON.stringify({ layout: { header, footer } }),
      });
      setDirty(false);
      toast.success("Layout tersimpan. Semua halaman ikut update.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const selectedBlock = useMemo(() => {
    if (!selected) return null;
    const arr = selected.section === "header" ? header : footer;
    return arr[selected.index] ?? null;
  }, [selected, header, footer]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Memuat layout…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white px-5 py-4 shadow-sm">
        <div>
          <div className="text-sm font-semibold text-slate-900">Layout Situs</div>
          <div className="text-xs text-slate-500">
            Header & footer di sini berlaku untuk <b>semua halaman</b>. Edit sekali,
            berubah di seluruh situs.
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="text-xs font-medium text-amber-600">
              Ada perubahan belum tersimpan
            </span>
          )}
          <Button onClick={save} disabled={!dirty || saving} size="sm">
            {saving ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Menyimpan…
              </>
            ) : (
              <>
                <Save className="mr-2 size-4" />
                Simpan
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <div className="space-y-6">
          <SectionPanel
            title="Header"
            hint="Muncul di bagian atas setiap halaman."
            section="header"
            blocks={header}
            selected={selected}
            onSelect={(idx) => setSelected({ section: "header", index: idx })}
            onAdd={() => setPickerFor("header")}
            onRemove={(idx) => removeBlock("header", idx)}
            onMove={(idx, dir) => moveBlock("header", idx, dir)}
          />
          <SectionPanel
            title="Footer"
            hint="Muncul di bagian bawah setiap halaman."
            section="footer"
            blocks={footer}
            selected={selected}
            onSelect={(idx) => setSelected({ section: "footer", index: idx })}
            onAdd={() => setPickerFor("footer")}
            onRemove={(idx) => removeBlock("footer", idx)}
            onMove={(idx, dir) => moveBlock("footer", idx, dir)}
          />
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          {selectedBlock && selected ? (
            <div className="rounded-xl border bg-white shadow-sm">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {selected.section === "header" ? "Header" : "Footer"} · Block
                  </div>
                  <div className="text-sm font-semibold">
                    {schemaFor(selectedBlock.type)?.label ?? selectedBlock.type}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Tutup"
                >
                  <ChevronDown className="size-4" />
                </button>
              </div>
              <div className="max-h-[70vh] space-y-3 overflow-y-auto p-4">
                <PropEditor
                  block={selectedBlock}
                  onChange={(next) => updateBlock(selected.section, selected.index, next)}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
              Pilih block di panel kiri untuk mengedit propertinya.
            </div>
          )}
        </div>
      </div>

      <BlockPickerDialog
        section={pickerFor}
        onClose={() => setPickerFor(null)}
        onPick={(type) => pickerFor && addBlock(pickerFor, type)}
      />
    </div>
  );
}

function SectionPanel({
  title,
  hint,
  section,
  blocks,
  selected,
  onSelect,
  onAdd,
  onRemove,
  onMove,
}: {
  title: string;
  hint: string;
  section: Section;
  blocks: BlockData[];
  selected: { section: Section; index: number } | null;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onMove: (index: number, dir: -1 | 1) => void;
}) {
  return (
    <div className="rounded-xl border bg-white shadow-sm">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <div className="text-xs text-slate-500">{hint}</div>
        </div>
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="mr-1.5 size-3.5" />
          Tambah Block
        </Button>
      </div>
      <div className="p-4">
        {blocks.length === 0 ? (
          <div className="rounded-lg border border-dashed py-8 text-center text-xs text-slate-500">
            Belum ada block di {title.toLowerCase()}. Klik <b>Tambah Block</b> untuk mulai.
          </div>
        ) : (
          <ul className="space-y-2">
            {blocks.map((b, i) => {
              const schema = schemaFor(b.type);
              const isSelected =
                selected?.section === section && selected.index === i;
              return (
                <li
                  key={i}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border bg-white px-3 py-2 transition",
                    isSelected
                      ? "border-blue-400 shadow-sm ring-2 ring-blue-100"
                      : "border-slate-200 hover:border-slate-300",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(i)}
                    className="flex flex-1 items-center gap-3 text-left"
                  >
                    <span className="grid size-8 place-items-center rounded-md bg-slate-100 text-base">
                      {schema?.emoji ?? "🧩"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {schema?.label ?? b.type}
                      </span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {schema?.description ?? b.type}
                      </span>
                    </span>
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onMove(i, -1)}
                      disabled={i === 0}
                      className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                      aria-label="Pindah naik"
                    >
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onMove(i, 1)}
                      disabled={i === blocks.length - 1}
                      className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                      aria-label="Pindah turun"
                    >
                      <ArrowDown className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(i)}
                      className="rounded p-1 text-red-500 hover:bg-red-50"
                      aria-label="Hapus"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function BlockPickerDialog({
  section,
  onClose,
  onPick,
}: {
  section: Section | null;
  onClose: () => void;
  onPick: (type: string) => void;
}) {
  const [q, setQ] = useState("");
  useEffect(() => {
    if (section) setQ("");
  }, [section]);

  const suggested = useMemo(() => {
    if (!section) return [] as BlockSchema[];
    const wanted = section === "header" ? HEADER_SUGGESTIONS : FOOTER_SUGGESTIONS;
    return wanted
      .map((t) => blockSchemas.find((s) => s.type === t))
      .filter((s): s is BlockSchema => Boolean(s));
  }, [section]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return blockSchemas;
    return blockSchemas.filter(
      (s) =>
        s.label.toLowerCase().includes(needle) ||
        s.type.toLowerCase().includes(needle) ||
        (s.description ?? "").toLowerCase().includes(needle),
    );
  }, [q]);

  return (
    <Dialog open={Boolean(section)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Tambah Block ke {section === "header" ? "Header" : "Footer"}</DialogTitle>
          <DialogDescription>
            {section === "header"
              ? "Umumnya guru pakai Guru Navbar / Navbar di header."
              : "Umumnya guru pakai Guru Footer / Footer di footer."}
          </DialogDescription>
        </DialogHeader>
        <div className="border-b px-5 py-3">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari block…"
            className="h-9 text-sm"
            autoFocus
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {!q && suggested.length > 0 && (
            <div className="mb-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Rekomendasi
              </div>
              <BlockGrid schemas={suggested} onPick={onPick} />
            </div>
          )}
          <div>
            {!q && (
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Semua Block
              </div>
            )}
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Tidak ada block cocok dengan &quot;{q}&quot;.
              </div>
            ) : (
              <BlockGrid schemas={filtered} onPick={onPick} />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BlockGrid({
  schemas,
  onPick,
}: {
  schemas: BlockSchema[];
  onPick: (type: string) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {schemas.map((s) => (
        <button
          key={s.type}
          type="button"
          onClick={() => onPick(s.type)}
          className="flex items-start gap-3 rounded-lg border bg-white p-3 text-left transition hover:border-blue-400 hover:shadow-sm"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-slate-100 text-base">
            {s.emoji ?? "🧩"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-slate-900">
              {s.label}
            </span>
            <span className="line-clamp-2 text-[11px] text-slate-500">
              {s.description ?? s.type}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

