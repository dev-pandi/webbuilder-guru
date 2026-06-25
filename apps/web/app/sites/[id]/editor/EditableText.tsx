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
  // remote change). Only re-write when the value genuinely diverges, otherwise
  // typing would race with the rewrite and reset the caret.
  useEffect(() => {
    if (ref.current && ref.current.textContent !== value) {
      ref.current.textContent = value;
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
