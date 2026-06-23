"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      <span className="text-muted-foreground">
        {total === 0 ? "Tidak ada hasil." : `Menampilkan ${start}–${end} dari ${total}`}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={page <= 1}
          onClick={() => onPage(1)}
        >
          <ChevronsLeft />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft />
        </Button>
        <span className="px-2 text-muted-foreground">
          Hal. <strong className="text-foreground">{page}</strong> / {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={page >= totalPages}
          onClick={() => onPage(totalPages)}
        >
          <ChevronsRight />
        </Button>
      </div>
    </div>
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
    <div className="relative w-64">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-8"
      />
    </div>
  );
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
