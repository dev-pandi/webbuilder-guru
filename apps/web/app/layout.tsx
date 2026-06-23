import "./globals.css";
import type { Metadata } from "next";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Web Builder — Buat website tanpa coding",
  description:
    "Buat website sekolah, UMKM, portofolio, atau blog dengan editor visual. Custom domain, SSL otomatis, dan export ke HTML/CSS/JS.",
};

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
