import Link from "next/link";
import type { ReactNode } from "react";
import type { Viewer } from "@/lib/auth";
import type { SiteSettings } from "@/lib/settings";
import { AdminMobileNav, AdminSidebarNav } from "@/components/layout/admin-nav";
import { Logo } from "@/components/layout/logo";
import { LogoutButton } from "@/components/layout/logout-button";
import { CoachBadge } from "@/components/ui/coach-badge";

export function AdminShell({ viewer, settings, children }: { viewer: Viewer; settings: SiteSettings; children: ReactNode }) {
  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-line bg-surface px-4 py-6 lg:flex">
        <div className="mb-2 px-3">
          <Logo name={settings.business_name} logoPath={settings.logo_path} href="/admin" />
        </div>
        <p className="mb-6 px-3 text-ink-soft">Administration</p>
        <AdminSidebarNav />
        <div className="mt-auto space-y-2 border-t border-line pt-4">
          <div className="px-3">
            <p className="font-semibold">{viewer.profile.full_name || viewer.email}</p>
            {viewer.profile.is_coach ? <CoachBadge label={settings.coach_badge_label} className="mt-1" /> : null}
          </div>
          <Link href="/hjem" className="flex min-h-12 items-center rounded-md px-3 font-semibold text-brand hover:bg-muted">
            Til medlemsområdet
          </Link>
          <LogoutButton />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="space-y-3 border-b border-line bg-surface px-4 py-3 lg:hidden">
          <div className="flex items-center justify-between">
            <Logo name={settings.business_name} logoPath={settings.logo_path} href="/admin" />
            <Link href="/hjem" className="inline-flex min-h-11 items-center font-semibold text-brand">
              Medlemsområdet
            </Link>
          </div>
          <AdminMobileNav />
        </header>
        <main id="indhold" className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
