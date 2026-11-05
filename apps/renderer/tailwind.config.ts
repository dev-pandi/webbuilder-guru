import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Token shadcn yang dipakai Blocks.tsx. Blok ditulis & dipreview di
      // apps/web (config shadcn penuh) sehingga kelas foreground/background/
      // primary tampak sehat di editor — tapi di sini token itu tidak pernah
      // ada, kelasnya tidak menghasilkan CSS, dan tombol CTA jadi putih di
      // atas putih. Dipetakan ke tema tenant (lib/theme.ts meng-emit kanal
      // *-rgb) supaya modifier alpha (/10, /[0.02]) ikut bekerja.
      colors: {
        foreground: "rgb(var(--color-fg-rgb, 15 23 42) / <alpha-value>)",
        background: "rgb(var(--color-bg-rgb, 255 255 255) / <alpha-value>)",
        primary: "rgb(var(--color-primary-rgb, 37 99 235) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};
export default config;
