//@ts-ignore
import "./globals.css";
import type { Metadata } from "next";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Web Builder — Buat website tanpa coding",
  description:
    "Buat website sekolah, UMKM, portofolio, atau blog dengan editor visual. Custom domain, SSL otomatis, dan export ke HTML/CSS/JS.",
};

// Force dynamic rendering app-wide — dashboard is per-user auth, zero SSG
// benefit. Required so middleware CSP nonce gets injected into Next.js
// inline bootstrap/RSC/hydration scripts (SSG bakes HTML at build-time
// without per-request nonce → CSP blocks everything).
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        {children}
        <Toaster richColors closeButton position="top-right" />
      </body>
    </html>
  );
}
