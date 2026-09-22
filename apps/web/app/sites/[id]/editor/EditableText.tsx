"use client";

import { createElement, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * EditableText turns any text-bearing element in the canvas into a click-to-edit
 * field. Single-click selects the block (handled by parent); double-click puts
 * the element into edit mode (contentEditable). Blur or Escape commits.
 *
 * Why contentEditable (not an input swap)? Layout matches the surrounding
 * styles 1:1 — line-height, font-weight, gradient-clip, etc. all preserved. A
 * swapped <input> would lose the look.
 *
 * Why DOM ref reads on blur (not controlled value)? React + contentEditable +
 * controlled is a famous pain point — caret jumps on every re-render. We only
 * read on blur/Enter, parent commits to props, and React re-mounts with the
 * fresh value.
 *
 * `as` is a narrow union of the text-bearing tags we actually use — TS chokes
 * on the full `keyof JSX.IntrinsicElements` union.
 */
type EditableTag = "span" | "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "div" | "blockquote";

export function EditableText({
  value,
  onChange,
  as = "span",
  className,
  multiline = false,
  placeholder = "Klik untuk edit…",
}: {
  value: string;
  onChange: (next: string) => void;
  as?: EditableTag;
  className?: string;
  multiline?: boolean;
  placeholder?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);

  // Keep DOM text in sync when the parent updates externally (undo/redo,
  // remote change, side-panel PropEditor edit). Kalau caret user lagi berada
  // di dalam node ini, preserve offset supaya tidak lompat ke akhir tiap
  // external update. Tanpa ini: user ketik di header, buka side panel edit
  // field lain, kembali ke inline — caret lompat.
  useEffect(() => {
    if (!ref.current || ref.current.textContent === value) return;
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    const focusedInside =
      sel && sel.anchorNode && ref.current.contains(sel.anchorNode);
    const savedOffset = focusedInside ? sel.anchorOffset : null;
    ref.current.textContent = value;
    if (savedOffset != null && ref.current.firstChild) {
      const maxOffset = Math.min(savedOffset, value.length);
      try {
        const range = document.createRange();
        range.setStart(ref.current.firstChild, maxOffset);
        range.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(range);
      } catch {
        // Selection API may throw kalau node type unsupported — biarkan
        // caret default (browser jump to end). Non-fatal.
      }
    }
  }, [value]);

  function commit() {
    const next = ref.current?.textContent ?? "";
    if (next !== value) onChange(next);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    if (e.key === "Escape") {
      if (ref.current) ref.current.textContent = value; // revert
      ref.current?.blur();
      e.preventDefault();
      return;
    }
    if (!multiline && e.key === "Enter") {
      e.preventDefault();
      ref.current?.blur();
    }
  }

  // Paste sanitize — cegah bloat dari Word/Excel/HTML editor lain. Strip
  // semua formatting, insert plain text saja. execCommand deprecated tapi
  // masih widely supported dan integrasi ke undo stack browser. Fallback ke
  // Selection API kalau tidak available.
  function onPaste(e: React.ClipboardEvent<HTMLElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    // Coba execCommand dulu (best UX: masuk ke browser undo stack).
    try {
      if (document.execCommand("insertText", false, text)) return;
    } catch {
      // Fall through ke manual Selection API.
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // Block the canvas click handler so editing doesn't deselect on every
  // keystroke or accidental drag.
  function stop(e: React.MouseEvent) {
    e.stopPropagation();
  }

  return createElement(
    as,
    {
      ref,
      contentEditable: true,
      suppressContentEditableWarning: true,
      "data-placeholder": placeholder,
      onBlur: commit,
      onKeyDown,
      onPaste,
      onClick: stop,
      onMouseDown: stop,
      className: cn(
        "wb-editable outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-transparent rounded-sm transition-shadow",
        "hover:shadow-[inset_0_0_0_1px_rgba(99,102,241,0.25)]",
        className,
      ),
    },
    value,
  );
}
