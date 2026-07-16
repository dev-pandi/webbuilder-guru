// Path-based navigation into a nested BlockData tree.
//
// A path is an array of sibling indices:
//   [3]        = top-level block #3
//   [3, 0]     = first child of top-level block #3
//   [3, 0, 1]  = second grandchild via that path
//
// All operations are IMMUTABLE — they return a fresh top-level array with
// only the changed spine copied. The rest of the tree keeps identity so
// React memoisation still works.

import type { BlockData } from "./PropEditor";

export type Path = number[];

// String form for Set<string> membership (multi-select) + React keys.
export function pathKey(p: Path): string {
  return p.join(".");
}
export function keyToPath(k: string): Path {
  if (k === "") return [];
  return k.split(".").map((n) => parseInt(n, 10));
}

export function samePath(a: Path, b: Path): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function isChildOf(child: Path, parent: Path): boolean {
  if (child.length <= parent.length) return false;
  for (let i = 0; i < parent.length; i++) if (child[i] !== parent[i]) return false;
  return true;
}

/**
 * Fetch the block at `path`, or undefined if the path is invalid.
 */
export function getAt(blocks: BlockData[], path: Path): BlockData | undefined {
  if (path.length === 0) return undefined;
  let cur: BlockData | undefined = blocks[path[0]];
  for (let i = 1; i < path.length && cur; i++) {
    cur = cur.children?.[path[i]];
  }
  return cur;
}

/**
 * Apply an immutable update at `path`. Copies only the spine down to the
 * changed node. Returns the updated top-level array; returns the original
 * unchanged when path is invalid so callers can safely no-op.
 */
export function updateAt(
  blocks: BlockData[],
  path: Path,
  updater: (b: BlockData) => BlockData,
): BlockData[] {
  if (path.length === 0) return blocks;
  return blocks.map((b, i) => {
    if (i !== path[0]) return b;
    if (path.length === 1) return updater(b);
    const nextChildren = updateAt(b.children ?? [], path.slice(1), updater);
    return { ...b, children: nextChildren };
  });
}

/**
 * Remove blocks at each of `paths`. Paths must be sorted DEEPEST-FIRST +
 * LAST-INDEX-FIRST within a level so earlier removals don't invalidate
 * later indices. The exported `removeMany` handles that sorting itself.
 */
export function removeAt(blocks: BlockData[], path: Path): BlockData[] {
  if (path.length === 0) return blocks;
  if (path.length === 1) {
    return blocks.filter((_, i) => i !== path[0]);
  }
  return blocks.map((b, i) => {
    if (i !== path[0]) return b;
    const nextChildren = removeAt(b.children ?? [], path.slice(1));
    return { ...b, children: nextChildren };
  });
}

/**
 * Bulk-remove — sorts paths so later removes don't drift earlier ones.
 * Removal happens right-to-left / deep-to-shallow.
 */
export function removeMany(blocks: BlockData[], paths: Path[]): BlockData[] {
  const sorted = [...paths].sort(comparePathsDesc);
  let cur = blocks;
  for (const p of sorted) cur = removeAt(cur, p);
  return cur;
}

/**
 * Insert `block` INSIDE the parent identified by `parentPath` at position
 * `at`. `parentPath = []` targets the top-level array.
 */
export function insertAt(
  blocks: BlockData[],
  parentPath: Path,
  at: number,
  block: BlockData,
): BlockData[] {
  if (parentPath.length === 0) {
    const arr = [...blocks];
    const idx = Math.max(0, Math.min(at, arr.length));
    arr.splice(idx, 0, block);
    return arr;
  }
  return updateAt(blocks, parentPath, (parent) => {
    const kids = parent.children ?? [];
    const arr = [...kids];
    const idx = Math.max(0, Math.min(at, arr.length));
    arr.splice(idx, 0, block);
    return { ...parent, children: arr };
  });
}

/**
 * Duplicate the block at `path`, inserting the clone right after it.
 * Returns the fresh tree AND the new path (parent + originalIndex+1).
 */
export function duplicateAtPath(
  blocks: BlockData[],
  path: Path,
): { tree: BlockData[]; newPath: Path } {
  const target = getAt(blocks, path);
  if (!target) return { tree: blocks, newPath: path };
  const clone: BlockData = structuredClone(target);
  const parentPath = path.slice(0, -1);
  const at = path[path.length - 1] + 1;
  const tree = insertAt(blocks, parentPath, at, clone);
  return { tree, newPath: [...parentPath, at] };
}

/**
 * Move the block at `path` up (dir=-1) or down (dir=1) within its siblings.
 * Returns the new tree + updated path. No-op if move would go out of bounds.
 */
export function moveAtPath(
  blocks: BlockData[],
  path: Path,
  dir: -1 | 1,
): { tree: BlockData[]; newPath: Path } {
  if (path.length === 0) return { tree: blocks, newPath: path };
  const parentPath = path.slice(0, -1);
  const i = path[path.length - 1];
  const j = i + dir;
  const parentChildren =
    parentPath.length === 0 ? blocks : getAt(blocks, parentPath)?.children ?? [];
  if (j < 0 || j >= parentChildren.length) return { tree: blocks, newPath: path };
  const newTree = updateSiblings(blocks, parentPath, (arr) => {
    const next = [...arr];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  return { tree: newTree, newPath: [...parentPath, j] };
}

/**
 * Reorder within siblings — used by DnD (drag from idx `from` to `to`) at a
 * given parent. Handles the drag-past-self case where dnd-kit sends
 * from<to and we want the target to end up AT position `to`.
 */
export function reorderSiblings(
  blocks: BlockData[],
  parentPath: Path,
  from: number,
  to: number,
): BlockData[] {
  return updateSiblings(blocks, parentPath, (arr) => {
    if (from === to) return arr;
    const next = [...arr];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  });
}

function updateSiblings(
  blocks: BlockData[],
  parentPath: Path,
  updater: (arr: BlockData[]) => BlockData[],
): BlockData[] {
  if (parentPath.length === 0) return updater(blocks);
  return updateAt(blocks, parentPath, (parent) => ({
    ...parent,
    children: updater(parent.children ?? []),
  }));
}

/**
 * Deepest-first path ordering. Used by removeMany so we peel leaves before
 * their ancestors — otherwise removing [1] would shift [1,0] to [0,0] and
 * a subsequent remove of the original [1,0] would target the wrong node.
 */
function comparePathsDesc(a: Path, b: Path): number {
  // Longer paths first (deepest).
  if (a.length !== b.length) return b.length - a.length;
  // Same depth → higher index first.
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return b[i] - a[i];
  }
  return 0;
}

/**
 * Get the flat list of siblings for a given path (its parent's children).
 * Empty parent path returns the top-level array.
 */
export function siblingsOf(blocks: BlockData[], path: Path): BlockData[] {
  if (path.length <= 1) return blocks;
  const parentPath = path.slice(0, -1);
  return getAt(blocks, parentPath)?.children ?? [];
}
