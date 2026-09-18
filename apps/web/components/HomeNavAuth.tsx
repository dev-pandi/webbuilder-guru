"use client";

// CTA nav untuk beranda — swap tombol "Masuk / Daftar" jadi "Ke Portal"
// kalau user sudah login. Beda dari AuthedHomeRedirect yang lama (auto-redirect
// yang bikin landing page tidak accessible sekalipun user cuma mau share URL
// atau browse template).
//
// Render optimis: server render + first-paint tampilkan tombol guest (tidak
// blank). Setelah client check `/auth/me` sukses, swap ke "Ke Portal".

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, LayoutDashboard } from "lucide-react";
import { api, clearTokens, getAccessToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { defaultRouteForRole } from "@/lib/roles";

export function HomeNavAuth() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) return;
    let cancelled = false;
    api<{ role: string }>("/api/v1/auth/me")
      .then((me) => {
        if (!cancelled) setTarget(defaultRouteForRole(me.role));
      })
      .catch(() => {
        // Token invalid → bersihkan diam-diam, biarkan user lihat form guest.
        clearTokens();
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (target) {
    return (
      <Button asChild className="gap-1.5 shadow-sm">
        <Link href={target}>
          <LayoutDashboard className="size-3.5" />
          Ke Portal
          <ArrowRight className="size-3.5" />
        </Link>
      </Button>
    );
  }

  return (
    <>
      <Button variant="outline" asChild>
        <Link href="/register">Daftar Gratis</Link>
      </Button>
      <Button asChild className="gap-1.5 shadow-sm">
        <Link href="/login">
          Masuk
          <ArrowRight className="size-3.5" />
        </Link>
      </Button>
    </>
  );
}
