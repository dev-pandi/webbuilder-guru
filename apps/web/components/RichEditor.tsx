"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import LinkExt from "@tiptap/extension-link";
import ImageExt from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { marked } from "marked";
import TurndownService from "turndown";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Link as LinkIcon,
  Image as ImageIcon,
  Undo,
  Redo,
  Strikethrough,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// HTML ↔ Markdown roundtrip. Editor edits HTML internally; DB stores markdown.
const td = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

// Make GFM-friendly: turndown handles strikethrough/strike out of the box w/ gfm plugin,
// but for v7 we keep the defaults which are already solid enough for our purposes.

marked.setOptions({ gfm: true, breaks: false });

function mdToHtml(md: string): string {
  if (!md) return "";
  const out = marked.parse(md);
  return typeof out === "string" ? out : "";
}

export function RichEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (md: string) => void;
  placeholder?: string;
}) {
  // Track the markdown we're emitting, so we don't reset the editor when the
  // parent re-renders with the same content we just produced.
  const lastEmitted = useRef<string>(value);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      LinkExt.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer nofollow" },
      }),
      ImageExt.configure({ inline: false }),
      Placeholder.configure({ placeholder: placeholder ?? "Mulai menulis…" }),
    ],
    content: mdToHtml(value),
    immediatelyRender: false, // avoid SSR hydration mismatch in Next.js
    editorProps: {
      attributes: {
        class:
          "wb-prose prose-tight min-h-[400px] max-w-none p-4 focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => {
      const md = td.turndown(editor.getHTML());
      lastEmitted.current = md;
      onChange(md);
    },
  });

  // External value change (e.g. form reset, async load) → re-sync editor.
  useEffect(() => {
    if (!editor) return;
    if (value === lastEmitted.current) return;
    const html = mdToHtml(value);
    if (editor.getHTML() !== html) {
      // 2nd arg `false` = don't fire onUpdate (TipTap v2 signature).
      editor.commands.setContent(html, false);
      lastEmitted.current = value;
    }
  }, [value, editor]);

  if (!editor) {
    return (
      <div className="min-h-[400px] animate-pulse rounded-lg border bg-muted/40" />
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <Toolbar editor={editor} />
      <div className="border-t">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const [, force] = useState(0);
  // Re-render toolbar buttons when selection/state changes so isActive checks update.
  useEffect(() => {
    const update = () => force((n) => n + 1);
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
    };
  }, [editor]);

  return (
    <div className="flex flex-wrap items-center gap-0.5 bg-muted/30 px-2 py-1.5">
      <Btn
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        title="Bold (Cmd+B)"
        icon={Bold}
      />
      <Btn
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        title="Italic (Cmd+I)"
        icon={Italic}
      />
      <Btn
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive("strike")}
        title="Strikethrough"
        icon={Strikethrough}
      />
      <Btn
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={editor.isActive("code")}
        title="Inline code"
        icon={Code}
      />
      <Sep />
      <Btn
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive("heading", { level: 1 })}
        title="Heading 1"
        icon={Heading1}
      />
      <Btn
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive("heading", { level: 2 })}
        title="Heading 2"
        icon={Heading2}
      />
      <Btn
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive("heading", { level: 3 })}
        title="Heading 3"
        icon={Heading3}
      />
      <Sep />
      <Btn
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
        title="Bullet list"
        icon={List}
      />
      <Btn
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        title="Ordered list"
        icon={ListOrdered}
      />
      <Btn
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive("blockquote")}
        title="Quote"
        icon={Quote}
      />
      <Btn
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive("codeBlock")}
        title="Code block"
        icon={Code}
      />
      <Sep />
      <LinkBtn editor={editor} />
      <ImageBtn editor={editor} />
      <Sep />
      <Btn
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo"
        icon={Undo}
      />
      <Btn
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo"
        icon={Redo}
      />
    </div>
  );
}

function Btn({
  onClick,
  active,
  disabled,
  title,
  icon: Icon,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        "size-8 rounded-md",
        active && "bg-foreground/10 text-foreground",
      )}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      <Icon className="size-4" />
    </Button>
  );
}

function Sep() {
  return <span className="mx-1 h-5 w-px bg-border" aria-hidden />;
}

function LinkBtn({ editor }: { editor: Editor }) {
  function set() {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL link (kosongkan untuk hapus):", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }
  return (
    <Btn
      onClick={set}
      active={editor.isActive("link")}
      title="Link"
      icon={LinkIcon}
    />
  );
}

function ImageBtn({ editor }: { editor: Editor }) {
  function add() {
    const url = window.prompt("URL gambar:");
    if (!url) return;
    editor.chain().focus().setImage({ src: url }).run();
  }
  return <Btn onClick={add} title="Sisipkan gambar" icon={ImageIcon} />;
}
