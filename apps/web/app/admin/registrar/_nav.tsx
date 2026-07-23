"use client";

// Sub-nav untuk section /admin/registrar. Dua route:
//   /admin/registrar          → Webhook config
//   /admin/registrar/purchases → Ops trace domain purchases
//
// Pattern konsisten dengan sites/[id]/layout — border-b active state,
// tidak pakai Radix Tabs karena ini navigasi route (bukan tab state lokal).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Webhook, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin/registrar", label: "Webhook", icon: Webhook, exact: true },
  { href: "/admin/registrar/purchases", label: "Domain Purchases", icon: ListChecks, exact: false },
];

export function RegistrarSectionNav() {
  const pathname = usePathname();
  return (
    <div className="border-b">
      <div className="flex gap-1">
        {items.map((it) => {
          const active = it.exact ? pathname === it.href : pathname.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <it.icon className="size-4" />
              {it.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
