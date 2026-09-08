"use client";

// GuruResponseForm — form pengunjung untuk kirim tanggapan pada artikel.
// Spec §18.1: name, role, body. Semua submit masuk sebagai `pending`
// (backend enforcement). Rate-limit di sisi API per IP (defence anti-spam).
//
// API endpoint: POST /public/sites/:site_id/articles/:article_id/responses
// URL absolut → NEXT_PUBLIC_API_BROWSER_URL (browser-visible). Kalau kosong,
// coba public API_INTERNAL_URL relative.

import { useState } from "react";

type ResponseRole = "guru" | "siswa" | "orang-tua" | "pembaca";
const ROLE_OPTIONS: { value: ResponseRole; label: string }[] = [
  { value: "guru", label: "Guru" },
  { value: "siswa", label: "Siswa" },
  { value: "orang-tua", label: "Orang Tua" },
  { value: "pembaca", label: "Pembaca" },
];

const API_BASE =
  process.env.NEXT_PUBLIC_API_BROWSER_URL ??
  process.env.NEXT_PUBLIC_API_BASE ??
  "";

export function GuruResponseForm({
  siteId,
  articleId,
}: {
  siteId: string;
  articleId: string;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<ResponseRole>("pembaca");
  const [body, setBody] = useState("");
  // Honeypot — never rendered visible ke user asli. State React (bukan hanya
  // hidden input) supaya bot yg parse React state juga tetap ke-detect.
  const [hp, setHp] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !body.trim()) return;
    setState("submitting");
    setErr(null);
    try {
      const url = `${API_BASE}/public/sites/${siteId}/articles/${articleId}/responses`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author_name: name.trim(),
          author_role: role,
          body: body.trim(),
          _hp: hp, // honeypot — user asli selalu ""
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.error) {
        setErr(json?.error?.message ?? `Gagal mengirim (HTTP ${res.status})`);
        setState("error");
        return;
      }
      setState("done");
      setName("");
      setBody("");
    } catch (e) {
      setErr((e as Error).message);
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="guru-response-form-success">
        <strong>Terima kasih!</strong>
        <p>
          Tanggapan Anda telah dikirim dan menunggu persetujuan guru pemilik
          website. Setelah disetujui, tanggapan akan tampil di halaman ini.
        </p>
      </div>
    );
  }

  return (
    <form className="guru-response-form" onSubmit={onSubmit}>
      <h3>Tulis Tanggapan</h3>
      <p className="guru-response-form__hint">
        Tanggapan Anda akan ditinjau oleh guru sebelum tampil publik.
      </p>

      {/* Honeypot — hidden from real users (position off-screen + aria-hidden).
          Bots that fill every input trigger silent-drop di backend. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-9999px",
          width: 1,
          height: 1,
          overflow: "hidden",
        }}
      >
        <label>
          Jangan isi field ini
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={hp}
            onChange={(e) => setHp(e.target.value)}
          />
        </label>
      </div>

      <div className="guru-response-form__row">
        <label>
          <span>Nama</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={60}
            placeholder="Nama Anda"
            disabled={state === "submitting"}
          />
        </label>
        <label>
          <span>Peran</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as ResponseRole)}
            disabled={state === "submitting"}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label>
        <span>Tanggapan</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={4}
          maxLength={2000}
          placeholder="Bagikan pandangan Anda…"
          disabled={state === "submitting"}
        />
      </label>

      {err && <div className="guru-response-form__err">{err}</div>}

      <button type="submit" disabled={state === "submitting"}>
        {state === "submitting" ? "Mengirim…" : "Kirim Tanggapan"}
      </button>
    </form>
  );
}
