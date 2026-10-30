import Link from "next/link";
import { getSiteSettings } from "@/lib/settings";
import { Logo } from "@/components/layout/logo";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettings();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex min-h-20 max-w-xl items-center justify-between px-4">
          <Logo name={settings.business_name} logoPath={settings.logo_path} />
          <Link href="/" className="inline-flex min-h-11 items-center font-semibold text-brand underline-offset-4 hover:underline">
            Til forsiden
          </Link>
        </div>
      </header>
      <main id="indhold" className="flex-1 px-4 py-10">
        <div className="mx-auto w-full max-w-xl">{children}</div>
      </main>
    </div>
  );
}
