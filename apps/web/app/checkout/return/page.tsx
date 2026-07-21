"use client";

// Return page dari payment gateway (Midtrans/Paylabs).
//
// Kenapa halaman ini ada?
// Payment gateway butuh `return_url` yang tetap saat session dibuat, tapi
// kita belum tahu job_id sebelum POST /domains/purchase selesai. Solusinya:
// bakar URL statis /checkout/return, lalu di sini ambil purchase terbaru
// user dan redirect ke /sites/pending/<job_id>.
//
// Sebagai back-stop, kalau list kosong (misal user open URL langsung), kita
// arahkan balik ke dashboard.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { api, getAccessToken } from "@/lib/api";

type Purchase = { job_id: string; status: string };

export default function CheckoutReturnPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/login");
      return;
    }
    (async () => {
      try {
        const list = await api<Purchase[]>("/api/v1/domains/purchases?limit=1");
        if (list && list.length > 0) {
          router.replace(`/sites/pending/${list[0].job_id}`);
        } else {
          router.replace("/dashboard");
        }
      } catch {
        router.replace("/dashboard");
      }
    })();
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <Loader2 className="mx-auto size-8 animate-spin text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">
          Mengecek status pembelian domain…
        </p>
      </div>
    </main>
  );
}
