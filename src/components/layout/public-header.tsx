import Link from "next/link";
import { getUserId } from "@/lib/auth";
import { getSiteSettings } from "@/lib/settings";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { Logo } from "@/components/layout/logo";

export const PUBLIC_NAV = [
  { href: "/saadan-fungerer-det", label: "Sådan fungerer det" },
  { href: "/om-christian", label: "Om Christian" },
  { href: "/medlemskab", label: "Medlemskab og priser" },
  { href: "/faq", label: "Spørgsmål og svar" },
  { href: "/kontakt", label: "Kontakt" },
] as const;

export async function PublicHeader() {
  const [settings, userId] = await Promise.all([getSiteSettings(), getUserId()]);
  const coachNav = PUBLIC_NAV.map((item) =>
    item.href === "/om-christian" ? { ...item, label: `Om ${settings.coach_name}` } : item,
  );
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <Container className="flex min-h-20 items-center justify-between gap-4">
        <Logo name={settings.business_name} logoPath={settings.logo_path} />

        <nav aria-label="Hovedmenu" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {coachNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="inline-flex min-h-11 items-center rounded-md px-3 font-semibold text-ink hover:bg-muted">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          {userId ? (
            <ButtonLink href="/hjem">Til medlemsområdet</ButtonLink>
          ) : (
            <>
              <Link href="/log-ind" className="inline-flex min-h-11 items-center px-3 font-semibold text-brand hover:underline">
                Log ind
              </Link>
              <ButtonLink href="/bliv-medlem">Bliv medlem</ButtonLink>
            </>
          )}
        </div>

        {/* Mobile menu: native disclosure works without JavaScript and with keyboard. */}
        <details className="group lg:hidden">
          <summary className="inline-flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-md border-2 border-line px-4 font-semibold">
            Menu
            <span aria-hidden="true" className="transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="absolute inset-x-0 z-40 mt-3 border-b border-line bg-surface px-4 pb-6 shadow-lg">
            <nav aria-label="Hovedmenu (mobil)">
              <ul className="divide-y divide-line">
                {coachNav.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="flex min-h-14 items-center text-lg font-semibold">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="mt-4 grid gap-3">
              {userId ? (
                <ButtonLink href="/hjem" size="lg">
                  Til medlemsområdet
                </ButtonLink>
              ) : (
                <>
                  <ButtonLink href="/bliv-medlem" size="lg">
                    Bliv medlem
                  </ButtonLink>
                  <ButtonLink href="/log-ind" variant="secondary" size="lg">
                    Log ind
                  </ButtonLink>
                </>
              )}
            </div>
          </div>
        </details>
      </Container>
    </header>
  );
}
