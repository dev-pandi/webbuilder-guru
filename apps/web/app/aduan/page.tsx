"use client";

// /aduan — formulir publik (tanpa login) untuk melaporkan situs atau domain
// yang memuat judi online, pornografi, penipuan, dll. Bukti wajib minimal
// satu berkas. Batas di sini cermin aturan server (apps/api/internal/abuse)
// supaya pelapor tahu sebelum mengirim; server tetap memvalidasi ulang.

import { useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  ImageIcon,
  Loader2,
  ShieldAlert,
  Upload,
  X,
} from "lucide-react";

import { API_BASE } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const CATEGORIES: Array<{ value: string; label: string; hint: string }> = [
  { value: "judi_online", label: "Judi online", hint: "Slot, togel, kasino, atau promosi situs judi" },
  { value: "pornografi", label: "Pornografi", hint: "Konten seksual eksplisit" },
  { value: "penipuan", label: "Penipuan", hint: "Investasi bodong, toko palsu, undian palsu" },
  { value: "phishing_malware", label: "Phishing / malware", hint: "Meniru situs lain atau menyebar virus" },
  { value: "sara_kebencian", label: "SARA / ujaran kebencian", hint: "Menyerang suku, agama, ras, golongan" },
  { value: "hoaks", label: "Hoaks", hint: "Informasi palsu yang menyesatkan" },
  { value: "hak_cipta", label: "Pelanggaran hak cipta", hint: "Memakai karya orang lain tanpa izin" },
  { value: "lainnya", label: "Lainnya", hint: "Konten negatif lain" },
];

const MAX_FILES = 5;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,application/pdf";
const MIN_DESC = 20;

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function AduanPage() {
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFileErr(null);
    const next = [...files];
    for (const f of Array.from(list)) {
      if (!ACCEPT.split(",").includes(f.type)) {
        setFileErr(`"${f.name}" bukan gambar atau PDF.`);
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        setFileErr(`"${f.name}" melebihi 5 MB.`);
        continue;
      }
      if (next.length >= MAX_FILES) {
        setFileErr(`Maksimal ${MAX_FILES} berkas.`);
        break;
      }
      if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    }
    const total = next.reduce((a, f) => a + f.size, 0);
    if (total > MAX_TOTAL_BYTES) {
      setFileErr("Total ukuran bukti melebihi 20 MB.");
      return;
    }
    setFiles(next);
  }

  function removeFile(i: number) {
    setFiles((fs) => fs.filter((_, idx) => idx !== i));
    setFileErr(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!url.trim()) return setErr("Alamat situs wajib diisi.");
    if (!category) return setErr("Pilih kategori aduan.");
    if (description.trim().length < MIN_DESC)
      return setErr(`Uraian minimal ${MIN_DESC} karakter supaya tim kami bisa menilai.`);
    if (!email.includes("@")) return setErr("Email pelapor tidak valid.");
    if (files.length === 0) return setErr("Lampirkan minimal satu bukti.");

    const fd = new FormData();
    fd.append("url", url.trim());
    fd.append("category", category);
    fd.append("description", description.trim());
    fd.append("reporter_name", name.trim());
    fd.append("reporter_email", email.trim());
    fd.append("website_confirm", honeypot);
    files.forEach((f) => fd.append("files", f));

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/abuse-reports`, { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (res.status === 429) throw new Error("Terlalu banyak aduan dari jaringan Anda. Coba lagi dalam satu jam.");
      if (!res.ok || body.error) throw new Error(body?.error?.message ?? `Gagal mengirim (HTTP ${res.status}).`);
      setReference(body?.data?.reference ?? "—");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const descLen = description.trim().length;

  return (
    <div className="min-h-screen bg-[#fbfaf7]">
      <header className="border-b border-[#e6e9ef] bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/">
              <ArrowLeft />
              Beranda
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        {reference ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="size-7" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Aduan diterima</h1>
              <p className="max-w-md text-sm text-muted-foreground">
                Terima kasih. Tim kami akan meninjau aduan Anda. Simpan nomor
                referensi berikut bila perlu menindaklanjuti:
              </p>
              <code className="rounded-lg bg-muted px-4 py-2 text-lg font-semibold tracking-wider">
                {reference}
              </code>
              <Button variant="outline" asChild className="mt-4">
                <Link href="/">Kembali ke beranda</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="mb-8">
              <div className="mb-2 flex items-center gap-2 text-[#d73f45]">
                <ShieldAlert className="size-5" />
                <span className="text-xs font-semibold uppercase tracking-wider">Pusat Aduan</span>
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-[#172033]">
                Laporkan situs atau domain
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Temukan situs yang memuat judi online, pornografi, penipuan,
                atau konten negatif lain? Laporkan di sini dengan bukti. Situs
                yang terbukti melanggar dapat kami tangguhkan.
              </p>
            </div>

            {/* onInput menangkap ketikan di semua field: pesan galat lama hilang
                begitu pengguna mulai mengoreksi, bukan menunggu kirim ulang. */}
            <form onSubmit={submit} onInput={() => err && setErr(null)} className="space-y-6" noValidate>
              {err && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{err}</span>
                </div>
              )}

              <Card>
                <CardContent className="space-y-5 p-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="ad-url">Alamat situs atau domain *</Label>
                    <Input
                      id="ad-url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="contoh.my.id atau https://contoh.my.id/halaman"
                      autoComplete="off"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Kategori pelanggaran *</Label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {CATEGORIES.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => {
                            setCategory(c.value);
                            setErr(null);
                          }}
                          className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                            category === c.value
                              ? "border-[#d73f45] bg-[#d73f45]/5 ring-1 ring-[#d73f45]/30"
                              : "hover:bg-muted/50"
                          }`}
                          aria-pressed={category === c.value}
                        >
                          <div className="text-sm font-medium">{c.label}</div>
                          <div className="text-xs text-muted-foreground">{c.hint}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="ad-desc">Uraian *</Label>
                    <Textarea
                      id="ad-desc"
                      rows={5}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Jelaskan apa yang Anda temukan dan di halaman mana. Contoh: banner promosi slot muncul di bagian atas halaman artikel."
                    />
                    <p className={`text-xs ${descLen > 0 && descLen < MIN_DESC ? "text-destructive" : "text-muted-foreground"}`}>
                      {descLen < MIN_DESC ? `Minimal ${MIN_DESC} karakter (${descLen}/${MIN_DESC})` : `${descLen} karakter`}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-3 p-5">
                  <div>
                    <Label>Bukti *</Label>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Tangkapan layar atau PDF. Maks. {MAX_FILES} berkas, 5 MB per berkas.
                    </p>
                  </div>

                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      addFiles(e.dataTransfer.files);
                    }}
                    onClick={() => inputRef.current?.click()}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
                      dragOver ? "border-[#d73f45] bg-[#d73f45]/5" : "hover:bg-muted/40"
                    }`}
                  >
                    <Upload className="size-6 text-muted-foreground" />
                    <p className="text-sm font-medium">Seret berkas ke sini atau klik untuk memilih</p>
                    <p className="text-xs text-muted-foreground">JPG, PNG, WEBP, GIF, atau PDF</p>
                    <input
                      ref={inputRef}
                      type="file"
                      multiple
                      accept={ACCEPT}
                      className="hidden"
                      onChange={(e) => {
                        addFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </div>

                  {fileErr && <p className="text-sm text-destructive">{fileErr}</p>}

                  {files.length > 0 && (
                    <ul className="divide-y rounded-lg border">
                      {files.map((f, i) => (
                        <li key={`${f.name}-${i}`} className="flex items-center gap-3 px-3 py-2">
                          {f.type === "application/pdf" ? (
                            <FileText className="size-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
                          )}
                          <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
                          <span className="text-xs text-muted-foreground">{fmtBytes(f.size)}</span>
                          <button
                            type="button"
                            onClick={() => removeFile(i)}
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label={`Hapus ${f.name}`}
                          >
                            <X className="size-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-4 p-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="ad-name">Nama (opsional)</Label>
                      <Input id="ad-name" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ad-email">Email *</Label>
                      <Input
                        id="ad-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="untuk tindak lanjut bila diperlukan"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Identitas pelapor tidak dibagikan kepada pemilik situs.
                  </p>
                  {/* Honeypot: tersembunyi dari manusia, sering diisi bot. */}
                  <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                    <label htmlFor="ad-website">Jangan diisi</label>
                    <input
                      id="ad-website"
                      tabIndex={-1}
                      autoComplete="off"
                      value={honeypot}
                      onChange={(e) => setHoneypot(e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full gap-2 bg-[#d73f45] text-white hover:bg-[#c23238] sm:w-auto"
              >
                {submitting ? <Loader2 className="size-4 animate-spin" /> : <ShieldAlert className="size-4" />}
                Kirim aduan
              </Button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
