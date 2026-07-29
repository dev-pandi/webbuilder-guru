"use client";

// Client-side check untuk halaman public (mis. beranda "/"). Kalau user sudah
// login (token valid + role dikenal), redirect ke portal masing-masing supaya
// tidak stuck di landing page. Kalau token invalid/expired, silently clear.
//
// Rendered null — pure side-effect. Aman di-mount di server component.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, clearTokens, getAccessToken } from "@/lib/api";
import { defaultRouteForRole } from "@/lib/roles";

export function AuthedHomeRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (!getAccessToken()) return;
    let cancelled = false;
    api<{ role: string }>("/api/v1/auth/me")
      .then((me) => {
        if (cancelled) return;
        router.replace(defaultRouteForRole(me.role));
      })
      .catch(() => {
        // Token invalid → biarkan user tetap di beranda dengan session bersih.
        clearTokens();
      });
    return () => {
      cancelled = true;
    };
  }, [router]);
  return null;
}
