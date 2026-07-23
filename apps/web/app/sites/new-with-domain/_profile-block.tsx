"use client";

// Ringkasan profil user untuk WHOIS. Kalau ada field kosong → warning card
// dengan link ke /settings/profile.

import Link from "next/link";
import { AlertCircle, ExternalLink, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Me } from "./_types";
import { FIELD_LABEL } from "./_helpers";

export function ProfileBlock({
  me,
  profileComplete,
  missingProfile,
}: {
  me: Me | null;
  profileComplete: boolean;
  missingProfile: Array<keyof Me>;
}) {
  return (
    <div className="rounded-xl border bg-gradient-to-br from-muted/40 to-muted/10 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
            <User className="size-4 text-primary" />
          </div>
          <div>
            <div className="text-sm font-semibold">Data Kontak</div>
            <div className="text-[11px] text-muted-foreground">
              Dipakai untuk WHOIS + invoice
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild className="gap-1.5">
          <Link href="/settings/profile">
            Edit
            <ExternalLink className="size-3" />
          </Link>
        </Button>
      </div>

      {profileComplete ? (
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
          {/* NIK opsional — tampilkan (masked) kalau user sudah isi.
              Kalau kosong, tidak render row-nya (bukan warning). */}
          {me?.nik && (
            <ProfileRow
              label="NIK"
              value={`${me.nik.slice(0, 6)}••••••${me.nik.slice(-4)}`}
              mono
            />
          )}
        </dl>
      ) : (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div>
            <div className="font-medium">Profil belum lengkap</div>
            <div className="mt-0.5 text-xs">
              Field kosong:{" "}
              <strong>
                {missingProfile.map((k) => FIELD_LABEL[k] ?? k).join(", ")}
              </strong>
            </div>
          </div>
        </div>
      )}
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
