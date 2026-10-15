"use client";

// Pembelajaran list — tampil hirarkis (parents + indented children) sesuai
// struktur baru 1-level. Reorder lewat tombol ↑↓ per row.
// Wired ke /api/v1/sites/:id/learning-materials.

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Loader2,
  MoveDown,
  MoveUp,
  Plus,
  PlusCircle,
} from "lucide-react";
import { toast } from "sonner";
import { api, type LearningMaterial } from "@/lib/api";
import type { PaginatedResult } from "@/components/Pagination";

type ChipTone = "green" | "gray";

function Chip({ tone, children }: { tone: ChipTone; children: React.ReactNode }) {
  const tones: Record<ChipTone, string> = {
    green: "bg-emerald-100 text-emerald-800",
    gray: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${tones[tone]}`}>
      {children}
    </span>
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Group materi jadi parents + children untuk display.
// Orphan children (parent_id punya nilai tapi parent-nya tidak ketemu, misal
// karena di-draft/di-hapus) jadi top-level biar tetap bisa diedit.
type Grouped = {
  parent: LearningMaterial;
  children: LearningMaterial[];
};

function groupTree(items: LearningMaterial[]): Grouped[] {
  // Sort: sort_order asc, created_at asc as tiebreak.
  const sorted = [...items].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.created_at.localeCompare(b.created_at);
  });
  const topLevel = sorted.filter((m) => !m.parent_id);
  const byParent: Record<string, LearningMaterial[]> = {};
  for (const m of sorted) {
    if (m.parent_id) {
      (byParent[m.parent_id] ??= []).push(m);
    }
  }
  const topIds = new Set(topLevel.map((p) => p.id));
  const groups: Grouped[] = topLevel.map((p) => ({ parent: p, children: byParent[p.id] ?? [] }));
  // Orphan children — parent sudah tidak ada di top-level (mungkin draft).
  // Promote jadi top-level standalone.
  for (const [pid, kids] of Object.entries(byParent)) {
    if (!topIds.has(pid)) {
      for (const k of kids) groups.push({ parent: k, children: [] });
    }
  }
  return groups;
}

export default function PembelajaranListPage() {
  const params = useParams<{ id: string }>();
  const sid = params.id;
  const [items, setItems] = useState<LearningMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reorderBusyId, setReorderBusyId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  async function refresh() {
    setLoading(true);
    try {
      // Ambil banyak sekaligus (max 200) supaya tree lengkap tanpa pagination.
      // Guru jarang > 200 materi; kalau tembus, upgrade ke paginated tree.
      const r = await api<PaginatedResult<LearningMaterial>>(
        `/api/v1/sites/${sid}/learning-materials?sort=newest&page_size=200`,
      );
      setItems(r.items);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid]);

  async function remove(m: LearningMaterial) {
    const extra = items.some((x) => x.parent_id === m.id)
      ? "\n\nMateri ini punya sub-materi. Sub-materi akan jadi topik utama (tidak terhapus)."
      : "";
    if (!confirm(`Hapus materi "${m.title}"?${extra}`)) return;
    setBusyId(m.id);
    try {
      await api(`/api/v1/learning-materials/${m.id}`, { method: "DELETE" });
      toast.success("Materi dihapus");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function reorder(m: LearningMaterial, direction: "up" | "down") {
    setReorderBusyId(m.id);
    try {
      await api(`/api/v1/learning-materials/${m.id}/reorder`, {
        method: "POST",
        body: JSON.stringify({ direction }),
      });
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setReorderBusyId(null);
    }
  }

  const groups = useMemo(() => groupTree(items), [items]);
  const hasHierarchy = useMemo(
    () => items.some((m) => m.parent_id || items.some((x) => x.parent_id === m.id)),
    [items],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            Materi Pembelajaran
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Kelola bahan pembelajaran. Materi bisa dikelompokkan jadi sub-materi
            dengan memilih <strong>Materi Induk</strong> di form edit.
          </p>
        </div>
        <Link
          href={`/sites/${sid}/pembelajaran/new`}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
        >
          <Plus className="size-4" />
          Tambah Materi
        </Link>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className={`overflow-x-auto ${loading ? "opacity-60" : ""}`}>
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr>
                {["Materi", "Status", "Tanggal", "Aksi"].map((h) => (
                  <th
                    key={h}
                    className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const isCollapsed = collapsed[g.parent.id];
                const hasKids = g.children.length > 0;
                return (
                  <RowFragment
                    key={g.parent.id}
                    group={g}
                    sid={sid}
                    hasKids={hasKids}
                    collapsed={isCollapsed}
                    hasHierarchy={hasHierarchy}
                    busyId={busyId}
                    reorderBusyId={reorderBusyId}
                    onToggle={() =>
                      setCollapsed((c) => ({ ...c, [g.parent.id]: !isCollapsed }))
                    }
                    onReorder={reorder}
                    onRemove={remove}
                  />
                );
              })}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-sm text-slate-500">
                    Belum ada materi. Klik &quot;Tambah Materi&quot; untuk mulai.
                  </td>
                </tr>
              )}
              {loading && items.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-500">
                    <Loader2 className="mx-auto size-4 animate-spin" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function RowFragment({
  group,
  sid,
  hasKids,
  collapsed,
  hasHierarchy,
  busyId,
  reorderBusyId,
  onToggle,
  onReorder,
  onRemove,
}: {
  group: Grouped;
  sid: string;
  hasKids: boolean;
  collapsed: boolean;
  hasHierarchy: boolean;
  busyId: string | null;
  reorderBusyId: string | null;
  onToggle: () => void;
  onReorder: (m: LearningMaterial, dir: "up" | "down") => void;
  onRemove: (m: LearningMaterial) => void;
}) {
  const { parent, children } = group;
  return (
    <>
      <MateriRow
        m={parent}
        sid={sid}
        isChild={false}
        hasKids={hasKids}
        collapsed={collapsed}
        hasHierarchy={hasHierarchy}
        busyId={busyId}
        reorderBusyId={reorderBusyId}
        onToggle={hasKids ? onToggle : undefined}
        onReorder={onReorder}
        onRemove={onRemove}
      />
      {!collapsed &&
        children.map((c) => (
          <MateriRow
            key={c.id}
            m={c}
            sid={sid}
            isChild
            hasKids={false}
            collapsed={false}
            hasHierarchy={hasHierarchy}
            busyId={busyId}
            reorderBusyId={reorderBusyId}
            onReorder={onReorder}
            onRemove={onRemove}
          />
        ))}
    </>
  );
}

function MateriRow({
  m,
  sid,
  isChild,
  hasKids,
  collapsed,
  hasHierarchy,
  busyId,
  reorderBusyId,
  onToggle,
  onReorder,
  onRemove,
}: {
  m: LearningMaterial;
  sid: string;
  isChild: boolean;
  hasKids: boolean;
  collapsed: boolean;
  hasHierarchy: boolean;
  busyId: string | null;
  reorderBusyId: string | null;
  onToggle?: () => void;
  onReorder: (m: LearningMaterial, dir: "up" | "down") => void;
  onRemove: (m: LearningMaterial) => void;
}) {
  return (
    <tr className={`border-b border-slate-100 last:border-0 ${isChild ? "bg-slate-50/50" : ""}`}>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2.5" style={{ paddingLeft: isChild ? 28 : 0 }}>
          {hasKids && onToggle ? (
            <button
              type="button"
              onClick={onToggle}
              className="grid size-5 place-items-center rounded hover:bg-slate-100"
              title={collapsed ? "Expand" : "Collapse"}
            >
              {collapsed ? (
                <ChevronRight className="size-3.5 text-slate-500" />
              ) : (
                <ChevronDown className="size-3.5 text-slate-500" />
              )}
            </button>
          ) : (
            <span className="w-5" aria-hidden />
          )}
          <div
            className={`grid h-9 w-11 place-items-center rounded-lg ${
              isChild
                ? "bg-slate-100 text-slate-400"
                : "bg-gradient-to-br from-slate-200 to-slate-300 text-slate-500"
            }`}
          >
            <BookOpen className="size-4" />
          </div>
          <div>
            <div className="text-[13px] font-semibold text-slate-900">
              {m.title}
              {hasKids && (
                <span className="ml-2 inline-flex items-center rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                  TOPIK UTAMA
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-500">{m.slug}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3.5">
        <Chip tone={m.status === "published" ? "green" : "gray"}>
          {m.status === "published" ? "Published" : "Draft"}
        </Chip>
      </td>
      <td className="px-4 py-3.5 text-[13px] text-slate-600">{fmtDate(m.updated_at)}</td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-1.5">
          {hasHierarchy && (
            <>
              <button
                onClick={() => onReorder(m, "up")}
                disabled={reorderBusyId === m.id}
                title="Pindah ke atas"
                className="grid size-7 place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
              >
                <MoveUp className="size-3.5" />
              </button>
              <button
                onClick={() => onReorder(m, "down")}
                disabled={reorderBusyId === m.id}
                title="Pindah ke bawah"
                className="grid size-7 place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
              >
                <MoveDown className="size-3.5" />
              </button>
            </>
          )}
          {!isChild && (
            <Link
              href={`/sites/${sid}/pembelajaran/new?parent=${m.id}`}
              title="Tambah sub-materi di bawah topik ini"
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[12px] font-bold text-emerald-700 hover:bg-emerald-100"
            >
              <PlusCircle className="size-3.5" />
              Sub
            </Link>
          )}
          <Link
            href={`/sites/${sid}/pembelajaran/${m.id}/edit`}
            className="rounded-lg bg-blue-50 px-3 py-1.5 text-[12px] font-bold text-blue-700 hover:bg-blue-100"
          >
            Edit
          </Link>
          <button
            onClick={() => onRemove(m)}
            disabled={busyId === m.id}
            className="rounded-lg bg-rose-50 px-3 py-1.5 text-[12px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
          >
            {busyId === m.id ? "…" : "Hapus"}
          </button>
        </div>
      </td>
    </tr>
  );
}
