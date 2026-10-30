import type { Metadata } from "next";
import { getSiteSettings } from "@/lib/settings";
import { isPlaceholderText, telHref } from "@/components/public/copy";
import { Fill } from "@/components/public/placeholder-text";
import { PageIntro, Section } from "@/components/public/section";
import { TextLink } from "@/components/public/text-link";
import { ContactForm } from "./contact-form";

// Pre-rendered and refreshed every 5 minutes (no per-visitor data on this page).
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Kontakt",
  description: "Har du spørgsmål til medlemskabet? Skriv en besked via kontaktformularen.",
};

export default async function ContactPage() {
  const settings = await getSiteSettings();
  const coach = settings.coach_name;
  const email = isPlaceholderText(settings.contact_email) ? null : settings.contact_email;
  const phone = isPlaceholderText(settings.contact_phone) ? null : settings.contact_phone;

  const details = [
    {
      label: "E-mail",
      value: email ? (
        <a href={`mailto:${email}`} className="font-semibold text-brand underline underline-offset-4">
          {email}
        </a>
      ) : (
        <Fill value={null} label="E-mail" />
      ),
    },
    {
      label: "Telefon",
      value: phone ? (
        <a href={telHref(phone)} className="font-semibold text-brand underline underline-offset-4">
          {phone}
        </a>
      ) : (
        <Fill value={null} label="Telefon" />
      ),
    },
    { label: "Firma", value: <Fill value={settings.company_name} label="Firmanavn" /> },
    { label: "CVR-nummer", value: <Fill value={settings.cvr_number} label="CVR-nummer" /> },
    { label: "Adresse", value: <Fill value={settings.company_address} label="Adresse" /> },
  ];

  return (
    <>
      <PageIntro title="Kontakt">
        <p>Skriv en besked, så får {coach} den direkte.</p>
      </PageIntro>

      <Section tone="surface" labelledBy="formular-titel">
        <div className="grid gap-14 lg:grid-cols-[3fr_2fr]">
          <div className="max-w-2xl space-y-6">
            <h2 id="formular-titel" className="text-3xl font-bold tracking-tight">
              Send en besked
            </h2>
            <p className="text-lg text-ink-soft">Felter uden „valgfrit“ skal udfyldes.</p>
            <ContactForm />
          </div>

          <aside aria-labelledby="oplysninger-titel" className="space-y-8 lg:border-l lg:border-line lg:pl-12">
            <div className="space-y-4">
              <h2 id="oplysninger-titel" className="text-2xl font-semibold">
                Kontaktoplysninger
              </h2>
              <dl className="space-y-4 text-lg">
                {details.map((item) => (
                  <div key={item.label}>
                    <dt className="font-semibold text-ink-soft">{item.label}</dt>
                    <dd className="break-words">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="space-y-2 border-t border-line pt-6">
              <h2 className="text-xl font-semibold">Er du allerede medlem?</h2>
              <p className="text-lg text-ink-soft">
                Så kan du skrive direkte til {coach} under <TextLink href="/beskeder">Beskeder</TextLink>.
              </p>
            </div>
          </aside>
        </div>
      </Section>
    </>
  );
}
