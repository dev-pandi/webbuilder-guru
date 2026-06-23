"use client";

import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImagePicker } from "@/components/ImagePicker";
import { schemaFor, type FieldDef, type ItemField } from "@/lib/blocks";

export type BlockData = { type: string; props?: Record<string, unknown> };

export function PropEditor({
  block,
  onChange,
}: {
  block: BlockData;
  onChange: (next: BlockData) => void;
}) {
  const schema = schemaFor(block.type);
  if (!schema) {
    return (
      <p className="text-xs text-muted-foreground">Tidak ada skema untuk block ini.</p>
    );
  }
  const props = block.props ?? {};
  function update(name: string, value: unknown) {
    onChange({ ...block, props: { ...props, [name]: value } });
  }
  return (
    <div className="space-y-4">
      {schema.fields.map((f) => (
        <Field key={f.name} field={f} value={props[f.name]} onChange={(v) => update(f.name, v)} />
      ))}
    </div>
  );
}

function Field({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (field.type === "string") {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{field.label}</Label>
        <Input
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-sm"
        />
      </div>
    );
  }
  if (field.type === "textarea") {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{field.label}</Label>
        <Textarea
          value={typeof value === "string" ? value : ""}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[60px] text-sm"
        />
      </div>
    );
  }
  if (field.type === "number") {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{field.label}</Label>
        <Input
          type="number"
          value={typeof value === "number" ? value : Number(value) || ""}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-8 text-sm"
        />
      </div>
    );
  }
  if (field.type === "image") {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{field.label}</Label>
        <ImagePicker value={typeof value === "string" ? value : ""} onChange={onChange} />
      </div>
    );
  }
  // items
  if (field.type !== "items") return null;
  const items = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
  const itemFields = field.itemFields;
  function updateItem(i: number, patch: Record<string, unknown>) {
    const next = [...items];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }
  function removeItem(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  function addItem() {
    const empty: Record<string, unknown> = {};
    itemFields.forEach((f) => (empty[f.name] = ""));
    onChange([...items, empty]);
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{field.label}</Label>
        <Button type="button" variant="ghost" size="sm" onClick={addItem} className="h-7 gap-1 px-2">
          <Plus className="size-3" />
          Tambah
        </Button>
      </div>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div
            key={i}
            className="space-y-2 rounded-md border border-input bg-muted/30 p-2.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase text-muted-foreground">
                #{i + 1}
              </span>
              <div className="flex gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  onClick={() => move(i, -1)}
                  title="Naik"
                >
                  <ChevronUp className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  onClick={() => move(i, 1)}
                  title="Turun"
                >
                  <ChevronDown className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6 text-destructive hover:text-destructive"
                  onClick={() => removeItem(i)}
                  title="Hapus"
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              {itemFields.map((sf) => (
                <ItemFieldInput
                  key={sf.name}
                  sf={sf}
                  value={it[sf.name]}
                  onChange={(v) => updateItem(i, { [sf.name]: v })}
                />
              ))}
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <p className="rounded border border-dashed py-3 text-center text-xs text-muted-foreground">
            Belum ada item.
          </p>
        )}
      </div>
    </div>
  );
}

function ItemFieldInput({
  sf,
  value,
  onChange,
}: {
  sf: ItemField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (sf.type === "textarea") {
    return (
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {sf.label}
        </Label>
        <Textarea
          value={typeof value === "string" ? value : ""}
          rows={2}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[50px] text-xs"
        />
      </div>
    );
  }
  if (sf.type === "image") {
    return (
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {sf.label}
        </Label>
        <ImagePicker
          size="sm"
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
        />
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {sf.label}
      </Label>
      <Input
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 text-xs"
      />
    </div>
  );
}
