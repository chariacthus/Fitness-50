import Link from "next/link";
import { getSiteSettings, placeholder } from "@/lib/settings";
import { Container } from "@/components/ui/layout";

export async function PublicFooter() {
  const s = await getSiteSettings();
  return (
    <footer className="mt-auto bg-night text-on-night">
      <Container className="grid gap-10 py-12 md:grid-cols-3">
        <div className="space-y-2">
          <p className="font-display text-3xl">{s.business_name}</p>
          <p className="text-on-night-soft">{s.slogan}</p>
        </div>
        <div className="space-y-1 text-on-night-soft">
          <p className="font-semibold text-on-night">Kontakt</p>
          <p>{placeholder(s.contact_email, "E-mail")}</p>
          <p>{placeholder(s.contact_phone, "Telefon")}</p>
          <p>{placeholder(s.company_name, "Firmanavn")}</p>
          <p>CVR: {placeholder(s.cvr_number, "CVR-nummer")}</p>
          <p>{placeholder(s.company_address, "Adresse")}</p>
        </div>
        <nav aria-label="Information" className="space-y-1">
          <p className="font-semibold text-on-night">Information</p>
          <ul className="space-y-1">
            {[
              { href: "/kontakt", label: "Kontakt" },
              { href: "/faq", label: "Spørgsmål og svar" },
              { href: "/privatlivspolitik", label: "Privatlivspolitik" },
              { href: "/handelsbetingelser", label: "Handelsbetingelser" },
            ].map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="inline-flex min-h-11 items-center font-semibold text-on-night underline-offset-4 hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
      <Container className="border-t border-on-night/15 py-6 text-on-night-soft">
        <p>© {new Date().getFullYear()} {s.company_name || s.business_name}. Stærk50 er en træningsservice og ikke en sundhedsfaglig behandling.</p>
      </Container>
    </footer>
  );
}
