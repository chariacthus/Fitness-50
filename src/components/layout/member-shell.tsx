import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/auth";
import type { SiteSettings } from "@/lib/settings";
import { MemberChrome } from "@/components/layout/member-chrome";
import { Logo } from "@/components/layout/logo";
import { LogoutButton } from "@/components/layout/logout-button";

export async function MemberShell({ viewer, settings, children }: { viewer: Viewer; settings: SiteSettings; children: ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("unread_counts");
  const raw = (data ?? {}) as Record<string, unknown>;
  const initialCounts = {
    notifications: Number(raw.notifications ?? 0),
    messages: Number(raw.messages ?? 0),
    community: Number(raw.community ?? 0),
  };

  return (
    <MemberChrome
      initialCounts={initialCounts}
      userId={viewer.userId}
      isAdmin={viewer.isAdmin}
      logo={<Logo name={settings.business_name} logoPath={settings.logo_path} href="/hjem" />}
      sidebarFooter={
        <div className="space-y-2 border-t border-line pt-4">
          <p className="px-3 text-ink-soft">
            Logget ind som <span className="font-semibold text-ink">{viewer.profile.full_name || viewer.email}</span>
          </p>
          <LogoutButton />
        </div>
      }
    >
      {children}
    </MemberChrome>
  );
}
