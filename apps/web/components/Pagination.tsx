"use client";

export type PaginatedResult<T> = {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPage: (n: number) => void;
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
      <span className="text-slate-500">
        {total === 0 ? "Tidak ada hasil." : `Menampilkan ${start}–${end} dari ${total}`}
      </span>
      <div className="flex items-center gap-1">
        <PageBtn disabled={page <= 1} onClick={() => onPage(1)} label="«" />
        <PageBtn disabled={page <= 1} onClick={() => onPage(page - 1)} label="‹" />
        <span className="px-2 text-slate-600">
          Hal. <strong>{page}</strong> / {totalPages}
        </span>
        <PageBtn disabled={page >= totalPages} onClick={() => onPage(page + 1)} label="›" />
        <PageBtn disabled={page >= totalPages} onClick={() => onPage(totalPages)} label="»" />
      </div>
    </div>
  );
}

function PageBtn({
  disabled,
  onClick,
  label,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );
}

export function SearchBar({
  value,
  onChange,
  placeholder = "Cari...",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-64 rounded-md border border-slate-300 px-3 py-1.5 pl-8 text-sm"
      />
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
        🔍
      </span>
    </div>
  );
}

// useDebounced delays a value update by `ms` — handy for live search.
import { useEffect, useState } from "react";
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
