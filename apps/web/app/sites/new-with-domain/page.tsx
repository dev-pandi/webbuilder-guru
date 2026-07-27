// Server component wrapper — cuma Suspense boundary di atas client content.
// Wajib karena `useSearchParams()` di client component (dipakai untuk
// prefill ?domain=) trigger Next.js 14 static-generation bail out kalau
// tidak di dalam Suspense.
//
// Layout dashboard sudah handle auth gate; halaman ini auth-gated juga di
// client (JWT dari localStorage), jadi Suspense fallback singkat cukup.

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { NewWithDomainContent } from "./_content";

export const metadata = {
  title: "Beli Domain + Buat Situs",
};

export default function NewWithDomainPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <NewWithDomainContent />
    </Suspense>
  );
}

function PageFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="mr-2 size-4 animate-spin" />
      Memuat wizard…
    </div>
  );
}
