"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";

export const ADMIN_NAV = [
  { href: "/admin", label: "Overblik", exact: true },
  { href: "/admin/medlemmer", label: "Medlemmer" },
  { href: "/admin/onboarding", label: "Onboarding" },
  { href: "/admin/beskeder", label: "Beskeder" },
  { href: "/admin/traeningsplaner", label: "Træningsplaner" },
  { href: "/admin/kostplaner", label: "Kostplaner" },
  { href: "/admin/opslag", label: "Opslag" },
  { href: "/admin/rapporter", label: "Anmeldelser" },
  { href: "/admin/betalinger", label: "Betalinger" },
  { href: "/admin/anmodninger", label: "Dataanmodninger" },
  { href: "/admin/kontakt", label: "Kontaktbeskeder" },
  { href: "/admin/produkter", label: "Priser og produkter" },
  { href: "/admin/indstillinger", label: "Indstillinger" },
] as const;

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebarNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Administration" className="space-y-1">
      {ADMIN_NAV.map((item) => {
        const active = isActive(pathname, item.href, "exact" in item ? item.exact : false);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn("flex min-h-11 items-center rounded-md px-3 font-semibold", active ? "bg-brand text-white" : "text-ink hover:bg-muted")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Mobile admin menu: a native disclosure, keyboard and screen-reader friendly. */
export function AdminMobileNav() {
  const pathname = usePathname();
  const current = ADMIN_NAV.find((i) => isActive(pathname, i.href, "exact" in i ? i.exact : false));
  return (
    <details className="group relative lg:hidden">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between rounded-md border-2 border-line bg-surface px-4 font-semibold">
        <span>Menu: {current?.label ?? "Administration"}</span>
        <span aria-hidden="true" className="transition-transform group-open:rotate-180">▾</span>
      </summary>
      <nav aria-label="Administration" className="mt-2 grid gap-1 rounded-md border border-line bg-surface p-2">
        {ADMIN_NAV.map((item) => (
          <Link key={item.href} href={item.href} className="flex min-h-11 items-center rounded-md px-3 font-semibold hover:bg-muted">
            {item.label}
          </Link>
        ))}
      </nav>
    </details>
  );
}
