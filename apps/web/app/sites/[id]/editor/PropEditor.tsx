"use client";

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
    return <p className="text-xs text-slate-500">Tidak ada skema untuk block ini.</p>;
  }
  const props = block.props ?? {};
  function update(name: string, value: unknown) {
    onChange({ ...block, props: { ...props, [name]: value } });
  }
  return (
    <div className="space-y-3">
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
      <label className="block">
        <span className="text-xs font-medium text-slate-600">{field.label}</span>
        <input
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </label>
    );
  }
  if (field.type === "textarea") {
    return (
      <label className="block">
        <span className="text-xs font-medium text-slate-600">{field.label}</span>
        <textarea
          value={typeof value === "string" ? value : ""}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </label>
    );
  }
  if (field.type === "number") {
    return (
      <label className="block">
        <span className="text-xs font-medium text-slate-600">{field.label}</span>
        <input
          type="number"
          value={typeof value === "number" ? value : Number(value) || ""}
          onChange={(e) => onChange(Number(e.target.value))}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </label>
    );
  }
  if (field.type === "image") {
    return (
      <div>
        <span className="text-xs font-medium text-slate-600">{field.label}</span>
        <div className="mt-1">
          <ImagePicker value={typeof value === "string" ? value : ""} onChange={onChange} />
        </div>
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
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600">{field.label}</span>
        <button
          type="button"
          onClick={addItem}
          className="text-xs text-brand-600 hover:underline"
        >
          + Tambah
        </button>
      </div>
      <div className="mt-1 space-y-2">
        {items.map((it, i) => (
          <div key={i} className="rounded-md border border-slate-200 bg-slate-50 p-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] uppercase text-slate-500">#{i + 1}</span>
              <div className="flex gap-1 text-xs">
                <button type="button" onClick={() => move(i, -1)} className="rounded px-1 hover:bg-slate-200" title="Naik">↑</button>
                <button type="button" onClick={() => move(i, 1)} className="rounded px-1 hover:bg-slate-200" title="Turun">↓</button>
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  className="rounded px-1 text-red-600 hover:bg-red-50"
                  title="Hapus"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              {itemFields.map((sf) => (
                <ItemFieldInput key={sf.name} sf={sf} value={it[sf.name]} onChange={(v) => updateItem(i, { [sf.name]: v })} />
              ))}
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-xs text-slate-400">Belum ada item.</p>
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
      <label className="block">
        <span className="text-[10px] uppercase text-slate-500">{sf.label}</span>
        <textarea
          value={typeof value === "string" ? value : ""}
          rows={2}
          onChange={(e) => onChange(e.target.value)}
          className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs"
        />
      </label>
    );
  }
  if (sf.type === "image") {
    return (
      <div>
        <span className="text-[10px] uppercase text-slate-500">{sf.label}</span>
        <div className="mt-0.5">
          <ImagePicker
            size="sm"
            value={typeof value === "string" ? value : ""}
            onChange={onChange}
          />
        </div>
      </div>
    );
  }
  return (
    <label className="block">
      <span className="text-[10px] uppercase text-slate-500">{sf.label}</span>
      <input
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs"
      />
    </label>
  );
}
