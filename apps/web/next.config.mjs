/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  async headers() {
    return [
      {
        // Screenshot panduan-guru — immutable, cache aggressive.
        // File jarang berubah (regen manual saat UI update besar). Kalau
        // ganti isi, jalankan `regen-guru-screenshots.sh`; browser lama
        // masih cache — user hard-refresh atau tunggu 1 tahun expire.
        //
        // `immutable` = browser tidak revalidate. `max-age=1 tahun`.
        // Kombinasi ini bikin kunjungan ke-2 zero download → panduan-guru
        // instant load, hemat bandwidth CDN.
        source: "/panduan-screenshots/:file*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};
export default nextConfig;
