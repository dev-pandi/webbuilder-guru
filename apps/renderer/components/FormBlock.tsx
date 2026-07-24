"use client";

// FormBlock — client-rendered form yang POST ke /public/forms/:id/submit,
// pakai NEXT_PUBLIC_API_BASE (browser-visible env). Server component pembungkus
// (Blocks.tsx) sudah fetch definisi form → kita cuma render input + handle
// submit + swap ke success state.
//
// Anti-spam: honeypot field `_hp` (bot isi field hidden → backend reject 200 OK
// diam-diam). Rate limit real di backend per IP.

import { useState, type FormEvent } from "react";
import type { FormField } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_BASE ?? "";

type Props = {
  formId: string;
  fields: FormField[];
  title?: string;
  subtitle?: string;
  submitLabel?: string;
  successMessage?: string;
};

export function FormBlock({
  formId,
  fields,
  title,
  subtitle,
  submitLabel,
  successMessage,
}: Props) {
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;
    if (!API) {
      setStatus("error");
      setErrorMsg("Konfigurasi API tidak tersedia.");
      return;
    }

    const form = e.currentTarget;
    const fd = new FormData(form);
    // Honeypot — bot fill hidden field, we bail early tanpa hit API.
    if (String(fd.get("_hp") ?? "").length > 0) {
      setStatus("done");
      return;
    }

    // Convert FormData ke plain object supaya backend simpan sebagai JSON.
    const data: Record<string, string> = {};
    fd.forEach((v, k) => {
      if (k === "_hp") return;
      data[k] = typeof v === "string" ? v : "";
    });

    setStatus("sending");
    setErrorMsg("");
    try {
      const res = await fetch(`${API}/public/forms/${encodeURIComponent(formId)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg =
          body?.error?.message ?? `Gagal mengirim (kode ${res.status}). Coba lagi.`;
        setStatus("error");
        setErrorMsg(String(msg));
        return;
      }
      setStatus("done");
      form.reset();
    } catch {
      setStatus("error");
      setErrorMsg("Gagal terhubung ke server. Coba lagi.");
    }
  }

  if (status === "done") {
    return (
      <section className="mx-auto max-w-2xl px-6 py-16">
        <div className="rounded-2xl border bg-card p-10 text-center shadow-sm">
          <div
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: "var(--color-primary)", color: "white" }}
            aria-hidden
          >
            ✓
          </div>
          <p className="mt-4 text-lg font-medium">
            {successMessage || "Terima kasih! Pesan Anda sudah kami terima."}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-2xl px-6 py-16">
      {(title || subtitle) && (
        <div className="text-center">
          {title ? (
            <h3 className="text-3xl font-bold tracking-tight">{title}</h3>
          ) : null}
          {subtitle ? <p className="mt-3 opacity-80">{subtitle}</p> : null}
        </div>
      )}

      <form
        onSubmit={onSubmit}
        className="mt-8 space-y-4 rounded-2xl border bg-card p-6 shadow-sm"
        noValidate
      >
        {/* Honeypot — sembunyi dari user tapi terlihat bot. Jangan pakai
            display:none karena banyak bot skip itu; pakai off-screen. */}
        <input
          type="text"
          name="_hp"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute -left-[9999px] h-0 w-0 opacity-0"
        />

        {fields.map((f) => (
          <label key={f.name} className="block">
            <span className="text-sm font-medium">
              {f.label}
              {f.required ? <span className="ml-0.5 text-destructive">*</span> : null}
            </span>
            {f.type === "textarea" ? (
              <textarea
                name={f.name}
                required={f.required}
                rows={5}
                placeholder={f.placeholder}
                className="mt-1.5 w-full rounded-[var(--radius)] border bg-background px-3 py-2.5 text-sm outline-none ring-offset-background focus:ring-2"
                style={{ outlineColor: "var(--color-primary)" }}
              />
            ) : (
              <input
                name={f.name}
                type={f.type === "email" ? "email" : f.type === "tel" ? "tel" : f.type === "url" ? "url" : "text"}
                required={f.required}
                placeholder={f.placeholder}
                className="mt-1.5 w-full rounded-[var(--radius)] border bg-background px-3 py-2.5 text-sm outline-none ring-offset-background focus:ring-2"
                style={{ outlineColor: "var(--color-primary)" }}
              />
            )}
          </label>
        ))}

        {status === "error" && errorMsg ? (
          <p className="text-sm text-destructive" role="alert">
            {errorMsg}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={status === "sending"}
          className="btn-primary w-full px-6 py-3 font-medium shadow-sm transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "sending" ? "Mengirim…" : submitLabel || "Kirim"}
        </button>
      </form>
    </section>
  );
}
