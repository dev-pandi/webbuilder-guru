"use client";

// Agent top-up disabled — agent pakai saldo reseller induk, tidak perlu
// top-up wallet sendiri. Kalau user bookmark URL lama, tampilkan info +
// arahkan balik ke wallet page.

import Link from "next/link";
import { ArrowLeft, Info, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function AgentTopupDisabledPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="gap-1.5">
          <Link href="/agent/wallet">
            <ArrowLeft className="size-4" /> Wallet
          </Link>
        </Button>
      </div>
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex items-start gap-3 p-6">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <ShieldCheck className="size-5" />
          </div>
          <div className="flex-1 space-y-2">
            <h1 className="text-lg font-semibold">Top-up tidak tersedia untuk agent</h1>
            <p className="text-sm text-muted-foreground">
              Sebagai agent, Anda menggunakan saldo dari reseller induk untuk
              beli / perpanjang domain. Tidak ada wallet pribadi yang perlu
              di-isi.
            </p>
            <div className="mt-3 flex items-start gap-2 rounded-md border bg-background p-3 text-sm">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                Kalau transaksi ditolak dengan pesan &ldquo;saldo tidak
                cukup&rdquo;, hubungi reseller Anda untuk top-up saldo mereka.
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
