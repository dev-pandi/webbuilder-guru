import "./globals.css";

// Force dynamic rendering app-wide — supaya middleware CSP nonce ter-inject
// ke Next.js inline bootstrap/RSC/hydration scripts tiap request. Dengan ISR
// cached HTML, inline script-nya pakai nonce lama → CSP block. Data layer
// masih di-cache Next.js data cache, overhead minimal.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
