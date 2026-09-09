"use client";

// GuruProfileForm — form edit profil guru (spec §13, §25).
// Data disimpan per-user (kolom di `users` table) karena 1 guru = 1 user
// dengan 1+ site. Dipakai di:
//   - /sites/[id]/profil (context per-site — canonical UX untuk guru)
//   - Portal Direktori Guru (§5) — kartu render name/subject/image dari sini
//   - Website guru sendiri — hero_statement/quote/bio/social ditampilkan
//     renderer di halaman /profil

import { useEffect, useState } from "react";
import {
  AtSign,
  BookOpen,
  GraduationCap,
  ImageIcon,
  Info,
  Loader2,
  Plus,
  Quote as QuoteIcon,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GuruFeatureNotice } from "@/components/GuruFeatureNotice";

type SocialLink = { platform: string; url: string };

type Me = {
  subject_or_field: string;
  profile_image: string;
  bio_short: string;
  bio_long: string;
  hero_statement: string;
  quote: string;
  social_links: SocialLink[];
};

const PLATFORM_SUGGEST = [
  "twitter",
  "instagram",
  "youtube",
  "facebook",
  "linkedin",
  "tiktok",
  "website",
];

export function GuruProfileForm() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [subject, setSubject] = useState("");
  const [image, setImage] = useState("");
  const [bioShort, setBioShort] = useState("");
  const [bioLong, setBioLong] = useState("");
  const [hero, setHero] = useState("");
  const [quote, setQuote] = useState("");
  const [links, setLinks] = useState<SocialLink[]>([]);

  useEffect(() => {
    let cancelled = false;
    api<Me>("/api/v1/auth/me")
      .then((u) => {
        if (cancelled) return;
        setMe(u);
        setSubject(u.subject_or_field ?? "");
        setImage(u.profile_image ?? "");
        setBioShort(u.bio_short ?? "");
        setBioLong(u.bio_long ?? "");
        setHero(u.hero_statement ?? "");
        setQuote(u.quote ?? "");
        setLinks(Array.isArray(u.social_links) ? u.social_links : []);
      })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSave() {
    setSaving(true);
    try {
      // Kirim semua field guru (backend PATCH pakai COALESCE, safe untuk
      // field yang tidak berubah).
      const body = {
        subject_or_field: subject,
        profile_image: image,
        bio_short: bioShort,
        bio_long: bioLong,
        hero_statement: hero,
        quote,
        social_links: links
          .map((l) => ({
            platform: l.platform.trim().toLowerCase(),
            url: l.url.trim(),
          }))
          .filter((l) => l.platform && l.url),
      };
      const u = await api<Me>("/api/v1/auth/me", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setMe(u);
      toast.success("Profil guru disimpan");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function addLink() {
    setLinks((prev) => [...prev, { platform: "", url: "" }]);
  }
  function removeLink(i: number) {
    setLinks((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateLink(i: number, key: keyof SocialLink, value: string) {
    setLinks((prev) => prev.map((l, idx) => (idx === i ? { ...l, [key]: value } : l)));
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat…
      </div>
    );
  }
  if (!me) return null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <GuruFeatureNotice
        title="Profil Guru"
        description="Data di halaman ini tampil di direktori guru portal dan di website pribadi Anda (hero, bio, quote, tautan sosial). Isi seperlunya — semua opsional."
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-500/10">
              <GraduationCap className="size-4 text-violet-600" />
            </div>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Pengaturan
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Profil Guru</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Identitas publik yang ditampilkan di website Anda dan direktori portal.
          </p>
        </div>
        <Button onClick={onSave} disabled={saving} className="gap-2 shadow-sm">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Simpan
        </Button>
      </div>

      {/* Identitas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identitas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="subject">Mata Pelajaran / Bidang</Label>
              <div className="relative">
                <BookOpen className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Contoh: Guru Bahasa Indonesia"
                  maxLength={128}
                  className="pl-9"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Tampil di bawah nama Anda di kartu direktori.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="image">Foto Profil (URL)</Label>
              <div className="relative">
                <ImageIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="image"
                  type="url"
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  placeholder="https://…/foto.jpg"
                  className="pl-9"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Upload dulu lewat menu Aset di dashboard, lalu salin URL-nya kesini.
              </p>
            </div>
          </div>

          {image && (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image}
                alt="Preview foto profil"
                className="size-16 rounded-full object-cover"
              />
              <p className="text-xs text-muted-foreground">Preview foto profil</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hero + Quote */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hero &amp; Quote</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="hero">Hero Statement</Label>
            <div className="relative">
              <Sparkles className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
              <Textarea
                id="hero"
                value={hero}
                onChange={(e) => setHero(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Kalimat singkat yang menggambarkan Anda sebagai pengajar."
                className="pl-9"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Tampil di bagian atas beranda website. Maksimum 500 karakter.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quote">Quote Pribadi</Label>
            <div className="relative">
              <QuoteIcon className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
              <Textarea
                id="quote"
                value={quote}
                onChange={(e) => setQuote(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Kutipan atau pernyataan pribadi yang mewakili filosofi Anda dalam mengajar."
                className="pl-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bio */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Biografi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bio_short">Bio Singkat</Label>
            <Textarea
              id="bio_short"
              value={bioShort}
              onChange={(e) => setBioShort(e.target.value)}
              rows={2}
              maxLength={280}
              placeholder="Ringkas dalam 1-2 kalimat."
            />
            <p className="text-[11px] text-muted-foreground">
              {bioShort.length}/280 karakter · tampil di kartu preview.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bio_long">Bio Lengkap</Label>
            <Textarea
              id="bio_long"
              value={bioLong}
              onChange={(e) => setBioLong(e.target.value)}
              rows={7}
              maxLength={4000}
              placeholder="Perjalanan profesional Anda, pengalaman mengajar, minat, dan hal yang ingin dibagikan ke pembaca."
            />
            <p className="text-[11px] text-muted-foreground">
              {bioLong.length}/4000 karakter · tampil di halaman Profil website.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Social links */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Tautan Sosial</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={addLink}
            disabled={links.length >= 10}
            className="gap-1.5"
          >
            <Plus className="size-3.5" /> Tambah
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {links.length === 0 ? (
            <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
              <Info className="size-4" />
              Belum ada tautan sosial. Tambahkan minimal 1 supaya pembaca bisa terhubung.
            </div>
          ) : (
            links.map((l, i) => (
              <div key={i} className="grid gap-2 md:grid-cols-[180px_1fr_auto]">
                <div className="space-y-1">
                  <Input
                    list="platform-options"
                    value={l.platform}
                    onChange={(e) => updateLink(i, "platform", e.target.value)}
                    placeholder="platform"
                    maxLength={40}
                  />
                </div>
                <div className="relative">
                  <AtSign className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="url"
                    value={l.url}
                    onChange={(e) => updateLink(i, "url", e.target.value)}
                    placeholder="https://…"
                    className="pl-9"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeLink(i)}
                  className="text-destructive hover:text-destructive"
                  title="Hapus tautan"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))
          )}
          <datalist id="platform-options">
            {PLATFORM_SUGGEST.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <p className="text-[11px] text-muted-foreground">
            Contoh platform: twitter, instagram, youtube, website. Maksimum 10 tautan.
          </p>
        </CardContent>
      </Card>

      {/* Save footer duplicate untuk konvensi */}
      <div className="flex justify-end">
        <Button onClick={onSave} disabled={saving} className="gap-2 shadow-sm">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Simpan Perubahan
        </Button>
      </div>
    </div>
  );
}
