"use client";

// Ambil data klien lalu render ClientForm dalam mode ubah. Dipisah supaya
// route page agent/reseller tetap tipis seperti pola ClientDetail.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { api } from "@/lib/api";
import { ClientForm, type ClientFormValues } from "@/components/clients/ClientForm";

type Client = Partial<ClientFormValues> & { id: string; email: string };

export function ClientEditLoader({
  clientID,
  basePath,
  apiPrefix,
}: {
  clientID: string;
  basePath: string;
  apiPrefix: "reseller" | "agent";
}) {
  const [initial, setInitial] = useState<Partial<ClientFormValues> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<Client>(`/api/v1/${apiPrefix}/clients/${clientID}`)
      .then((c) => {
        if (cancelled) return;
        setInitial({
          email: c.email ?? "",
          name: c.name ?? "",
          phone_number: c.phone_number ?? "",
          address: c.address ?? "",
          city: c.city ?? "",
          state: c.state ?? "",
          postal_code: c.postal_code ?? "",
          nik: c.nik ?? "",
        });
      })
      .catch((e) => !cancelled && setErr((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [clientID, apiPrefix]);

  if (err) {
    return (
      <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
        {err}
      </p>
    );
  }
  if (!initial) {
    return (
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat…
      </span>
    );
  }

  return (
    <ClientForm
      mode="edit"
      basePath={basePath}
      apiPrefix={apiPrefix}
      clientID={clientID}
      initial={initial}
    />
  );
}
