"use client";

import { useEffect, useState } from "react";

// useAutoSavedAgo — format elapsed time sejak last save (auto/manual)
// jadi hint kecil di UI: "baru saja", "10 dtk lalu", "3 mnt lalu".
// Update tiap 15 detik selama save-state tidak berubah dan tidak dirty.
// Dirty=true → return string kosong (indicator "belum disimpan" tampil
// terpisah, hindari conflicting UX).
export function useAutoSavedAgo(savedAt: number | null, dirty: boolean): string {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (savedAt == null || dirty) return;
    const h = window.setInterval(() => setTick((t) => t + 1), 15_000);
    return () => window.clearInterval(h);
  }, [savedAt, dirty]);
  if (dirty || savedAt == null) return "";
  const diff = Date.now() - savedAt;
  const sec = Math.round(diff / 1000);
  if (sec < 5) return "baru saja";
  if (sec < 60) return `${sec} dtk lalu`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} mnt lalu`;
  const hr = Math.round(min / 60);
  return `${hr} jam lalu`;
}
