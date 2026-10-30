import { requireViewer } from "@/lib/auth";
import { getSiteSettings } from "@/lib/settings";
import { MemberShell } from "@/components/layout/member-shell";

// Member pages depend on the logged-in user and must never be cached.
export const dynamic = "force-dynamic";

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const [viewer, settings] = await Promise.all([requireViewer(), getSiteSettings()]);
  return (
    <MemberShell viewer={viewer} settings={settings}>
      {children}
    </MemberShell>
  );
}
