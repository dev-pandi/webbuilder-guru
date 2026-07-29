// Visual marker "PREVIEW: <Nama Template>" untuk halaman
// /_template-preview/*. Style inline supaya tidak collide dengan CSS template
// yang di-preview.

export function TemplatePreviewBadge({
  templateName,
  category,
  variant,
}: {
  templateName: string;
  category: string;
  variant: string;
}) {
  return (
    <div
      style={{
        position: "fixed",
        top: "1rem",
        left: "1rem",
        zIndex: 9999,
        background: "rgba(0,0,0,0.85)",
        color: "white",
        padding: "0.5rem 0.75rem",
        borderRadius: "0.5rem",
        fontSize: "0.7rem",
        fontFamily: "system-ui, -apple-system, sans-serif",
        boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
        letterSpacing: "0.02em",
      }}
    >
      <div style={{ opacity: 0.6, textTransform: "uppercase", marginBottom: "0.15rem" }}>
        Preview Template
      </div>
      <div style={{ fontWeight: 600 }}>{templateName}</div>
      <div style={{ opacity: 0.7, fontSize: "0.65rem", marginTop: "0.1rem" }}>
        {category} · {variant}
      </div>
    </div>
  );
}
