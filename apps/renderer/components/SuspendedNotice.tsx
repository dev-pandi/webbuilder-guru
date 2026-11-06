// Halaman yang tampil di SEMUA rute situs yang ditangguhkan admin karena
// aduan konten. Netral dan tidak menyebut detail pelanggaran: pengunjung
// cukup tahu situsnya tidak tersedia; pemilik melihat alasannya di dashboard.

export function SuspendedNotice() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        background: "#f8fafc",
        color: "#0f172a",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ maxWidth: "28rem", textAlign: "center" }}>
        <div
          aria-hidden="true"
          style={{
            width: "3.5rem",
            height: "3.5rem",
            margin: "0 auto 1.25rem",
            borderRadius: "999px",
            background: "#fef2f2",
            display: "grid",
            placeItems: "center",
            fontSize: "1.5rem",
          }}
        >
          ⚠
        </div>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
          Situs ini ditangguhkan
        </h1>
        <p style={{ marginTop: "0.75rem", lineHeight: 1.6, color: "#475569" }}>
          Situs ini sementara tidak dapat diakses karena melanggar kebijakan
          konten platform. Pemilik situs dapat menghubungi kami untuk
          peninjauan ulang.
        </p>
      </div>
    </main>
  );
}
