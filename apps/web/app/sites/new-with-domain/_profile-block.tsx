"use client";

// Ringkasan profil user untuk WHOIS. Kalau ada field kosong → warning card
// dengan link ke /settings/profile.
//
// On-behalf-of mode (forClientID di-set) juga menyediakan inline mini-form
// untuk agent/reseller edit profil klien tanpa harus keluar wizard —
// termasuk NIK yang wajib untuk .id.

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ExternalLink, Loader2, Pencil, Save, User, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Me } from "./_types";
import { FIELD_LABEL } from "./_helpers";

export function ProfileBlock({
  me,
  profileComplete,
  missingProfile,
  forClientID,
  onClientUpdated,
  needNik,
}: {
  me: Me | null;
  profileComplete: boolean;
  missingProfile: Array<keyof Me>;
  // Kalau di-set = mode on-behalf-of; edit link ke halaman klien (bukan
  // /settings/profile milik reseller) supaya tidak salah edit profil sendiri.
  forClientID?: string;
  // Callback pasca-inline-edit sukses supaya wizard refresh `me`.
  onClientUpdated?: (updated: Me) => void;
  // Zone menuntut NIK (mis. .id) — surface NIK sebagai warning kalau kosong
  // walau field required lain sudah komplit.
  needNik?: boolean;
}) {
  const editHref = forClientID ? "/reseller/clients" : "/settings/profile";
  const subtitle = forClientID
    ? "Data klien untuk WHOIS + invoice"
    : "Dipakai untuk WHOIS + invoice";
  const [editing, setEditing] = useState(false);

  // NIK kosong padahal zone butuh → highlight walau profile_complete true.
  const nikMissing = Boolean(needNik) && !me?.nik;

  return (
    <div className="rounded-xl border bg-gradient-to-br from-muted/40 to-muted/10 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
            <User className="size-4 text-primary" />
          </div>
          <div>
            <div className="text-sm font-semibold">
              {forClientID ? "Data Kontak Klien" : "Data Kontak"}
            </div>
            <div className="text-[11px] text-muted-foreground">{subtitle}</div>
          </div>
        </div>
        <div className="flex gap-1.5">
          {/* Inline edit tersedia untuk on-behalf-of — supaya agent/reseller
              bisa isi NIK klien tanpa keluar wizard. Kalau bukan on-behalf-of,
              fallback ke tombol link ke /settings/profile. */}
          {forClientID ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing((v) => !v)}
              className="gap-1.5"
            >
              {editing ? (
                <>
                  <X className="size-3" />
                  Tutup
                </>
              ) : (
                <>
                  <Pencil className="size-3" />
                  Edit
                </>
              )}
            </Button>
          ) : (
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <Link href={editHref}>
                Edit
                <ExternalLink className="size-3" />
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Ringkasan data — hide saat editing supaya tidak dobel display. */}
      {!editing && profileComplete ? (
        <>
          <dl className="mt-4 grid gap-y-1.5 gap-x-6 text-sm sm:grid-cols-2">
            <ProfileRow label="Nama" value={me?.name} />
            <ProfileRow label="Email" value={me?.email} mono />
            <ProfileRow label="HP" value={me?.phone_number} mono />
            <ProfileRow
              label="Alamat"
              value={
                me
                  ? [me.address, me.city, me.state, me.postal_code]
                      .filter(Boolean)
                      .join(", ")
                  : ""
              }
            />
            {me?.nik && (
              <ProfileRow
                label="NIK"
                value={`${me.nik.slice(0, 6)}••••••${me.nik.slice(-4)}`}
                mono
              />
            )}
          </dl>
          {nikMissing && (
            <NikMissingHint onEdit={() => setEditing(true)} />
          )}
        </>
      ) : !editing ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div className="flex-1">
            <div className="font-medium">Profil belum lengkap</div>
            <div className="mt-0.5 text-xs">
              Field kosong:{" "}
              <strong>
                {missingProfile.map((k) => FIELD_LABEL[k] ?? k).join(", ")}
              </strong>
            </div>
            {forClientID && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(true)}
                className="mt-2 h-7 gap-1.5 text-xs"
              >
                <Pencil className="size-3" />
                Lengkapi sekarang
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {editing && forClientID && me && (
        <ClientInlineEdit
          clientID={forClientID}
          me={me}
          onSaved={(updated) => {
            setEditing(false);
            onClientUpdated?.(updated);
          }}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function NikMissingHint({ onEdit }: { onEdit: () => void }) {
  return (
    <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1">
        <div className="font-medium">NIK klien belum diisi</div>
        <div className="mt-0.5 text-xs">
          TLD ini (mis. .id) mewajibkan NIK 16 digit di WHOIS per regulasi
          Kemenkominfo. Registrar akan reject pembelian kalau NIK kosong.
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onEdit}
          className="mt-2 h-7 gap-1.5 text-xs"
        >
          <Pencil className="size-3" />
          Isi NIK klien
        </Button>
      </div>
    </div>
  );
}

function ClientInlineEdit({
  clientID,
  me,
  onSaved,
  onCancel,
}: {
  clientID: string;
  me: Me;
  onSaved: (updated: Me) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: me.name ?? "",
    phone_number: me.phone_number ?? "",
    address: me.address ?? "",
    city: me.city ?? "",
    state: me.state ?? "",
    postal_code: me.postal_code ?? "",
    nik: me.nik ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Sync in kalau `me` berubah dari luar (mis. refresh on-focus) — cegah
  // form state stale kalau modal masih terbuka.
  useEffect(() => {
    setForm({
      name: me.name ?? "",
      phone_number: me.phone_number ?? "",
      address: me.address ?? "",
      city: me.city ?? "",
      state: me.state ?? "",
      postal_code: me.postal_code ?? "",
      nik: me.nik ?? "",
    });
  }, [me]);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    setErr(null);
    if (form.nik && !/^\d{16}$/.test(form.nik)) {
      setErr("NIK harus tepat 16 digit angka");
      return;
    }
    setSaving(true);
    try {
      // Endpoint sama untuk reseller & agent (RequireResellerOrAgent di
      // /reseller/*, RequireAgent di /agent/*). Kita pakai /reseller/*
      // untuk kedua role — backend route sudah handle keduanya.
      const updated = await api<Me>(`/api/v1/reseller/clients/${clientID}`, {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      toast.success("Profil klien diperbarui");
      onSaved(updated);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 space-y-3 rounded-lg border bg-background p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ie-name" className="text-xs">
            Nama
          </Label>
          <Input
            id="ie-name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ie-phone" className="text-xs">
            HP
          </Label>
          <Input
            id="ie-phone"
            type="tel"
            value={form.phone_number}
            onChange={(e) => set("phone_number", e.target.value)}
            placeholder="+62812xxxxxxx"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ie-address" className="text-xs">
          Alamat
        </Label>
        <Textarea
          id="ie-address"
          rows={2}
          value={form.address}
          onChange={(e) => set("address", e.target.value)}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ie-city" className="text-xs">
            Kota
          </Label>
          <Input
            id="ie-city"
            value={form.city}
            onChange={(e) => set("city", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ie-state" className="text-xs">
            Provinsi
          </Label>
          <Input
            id="ie-state"
            value={form.state}
            onChange={(e) => set("state", e.target.value)}
            placeholder="DKI Jakarta"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ie-postal" className="text-xs">
          Kode Pos
        </Label>
        <Input
          id="ie-postal"
          value={form.postal_code}
          onChange={(e) => set("postal_code", e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ie-nik" className="text-xs">
          NIK (KTP){" "}
          <span className="text-[10px] font-normal text-muted-foreground">
            — wajib untuk .id
          </span>
        </Label>
        <Input
          id="ie-nik"
          value={form.nik}
          onChange={(e) =>
            set("nik", e.target.value.replace(/\D/g, "").slice(0, 16))
          }
          placeholder="16 digit NIK"
          inputMode="numeric"
          maxLength={16}
          className="font-mono"
        />
      </div>

      {err && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
          {err}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={saving}
        >
          Batal
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={submit}
          disabled={saving}
          className="gap-1.5"
        >
          {saving ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Save className="size-3.5" />
          )}
          Simpan
        </Button>
      </div>
    </div>
  );
}

function ProfileRow({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className={mono ? "truncate font-mono text-xs" : "truncate text-sm"}>
        {value || "—"}
      </dd>
    </div>
  );
}
