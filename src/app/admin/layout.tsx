import { requireAdmin } from "@/lib/auth";
import { getSiteSettings } from "@/lib/settings";
import { AdminShell } from "@/components/layout/admin-shell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [viewer, settings] = await Promise.all([requireAdmin("/admin"), getSiteSettings()]);
  return (
    <AdminShell viewer={viewer} settings={settings}>
      {children}
    </AdminShell>
  );
}
