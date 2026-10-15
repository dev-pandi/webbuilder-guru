// PembelajaranProgress — thin fixed bar di top yang ikut scroll progress.
// Visual anchor supaya pembaca materi panjang tahu progress bacaan.
// Pure client — rAF-throttled scroll handler supaya tidak jank.

"use client";

import { useEffect, useRef, useState } from "react";

export function PembelajaranProgress() {
  const [progress, setProgress] = useState(0);
  const ticking = useRef(false);

  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const compute = () => {
      const doc = document.documentElement;
      const scrolled = window.scrollY;
      const max = doc.scrollHeight - window.innerHeight;
      const pct = max > 0 ? Math.min(100, Math.max(0, (scrolled / max) * 100)) : 0;
      setProgress(pct);
      ticking.current = false;
    };
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      if (prefersReduced) {
        compute();
      } else {
        requestAnimationFrame(compute);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    compute();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      className="pembelajaran-progress"
      style={{ width: `${progress}%` }}
      aria-hidden
    />
  );
}
