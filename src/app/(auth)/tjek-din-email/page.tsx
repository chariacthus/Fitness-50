import type { Metadata } from "next";
import Link from "next/link";
import { getSiteSettings } from "@/lib/settings";
import { nextFromParams, withNext } from "@/lib/auth-flow/safe-next";
import { PageHeader, Panel, SectionTitle } from "@/components/ui/layout";
import { ResendConfirmationForm } from "../_components/resend-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tjek din e-mail" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const linkClass = "inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4";

export default async function CheckEmailPage({ searchParams }: { searchParams: SearchParams }) {
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const next = nextFromParams(params.next);

  return (
    <>
      <PageHeader
        title="Tjek din e-mail"
        description="Vi har sendt dig en e-mail med et link. Klik på linket for at bekræfte din e-mailadresse – så er din konto klar."
      />

      <Panel className="space-y-4">
        <SectionTitle>Sådan gør du</SectionTitle>
        <ol className="list-decimal space-y-3 pl-6 text-lg">
          <li>Åbn din indbakke, og find e-mailen fra {settings.business_name}.</li>
          <li>Klik på knappen »Bekræft min e-mail« i e-mailen.</li>
          <li>Kan du ikke finde e-mailen, så kig i mappen med uønsket post (spam). Der kan gå et par minutter, før den kommer.</li>
          <li>Linket virker kun i begrænset tid og kan kun bruges én gang.</li>
        </ol>
        <p className="text-ink-soft">
          Har du allerede en konto med den e-mail, kan du{" "}
          <Link href={withNext("/log-ind", next)} className={linkClass}>
            logge ind
          </Link>{" "}
          eller{" "}
          <Link href="/glemt-adgangskode" className={linkClass}>
            nulstille din adgangskode
          </Link>
          .
        </p>
      </Panel>

      <section aria-labelledby="ingen-email" className="mt-8">
        <Panel as="div" className="space-y-4">
          <SectionTitle id="ingen-email">Fik du ingen e-mail?</SectionTitle>
          <p className="text-ink-soft">Skriv din e-mail herunder, så sender vi et nyt link.</p>
          <ResendConfirmationForm next={next} />
        </Panel>
      </section>
    </>
  );
}
