import type { Metadata } from "next";
import { getSiteSettings } from "@/lib/settings";
import { LegalDocument, Ph, type LegalSection } from "@/components/public/legal";
import { Fill } from "@/components/public/placeholder-text";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Privatlivspolitik",
  description: "Sådan behandler vi dine personoplysninger, og sådan bruger du dine rettigheder.",
};

export default async function PrivacyPolicyPage() {
  const s = await getSiteSettings();
  const business = s.business_name;
  const coach = s.coach_name;

  const sections: LegalSection[] = [
    {
      id: "dataansvarlig",
      title: "Dataansvarlig",
      body: (
        <>
          <p>Den dataansvarlige for behandlingen af dine personoplysninger er:</p>
          <ul>
            <li>
              <Fill value={s.company_name} label="Firmanavn" />
            </li>
            <li>
              CVR-nummer: <Fill value={s.cvr_number} label="CVR-nummer" />
            </li>
            <li>
              Adresse: <Fill value={s.company_address} label="Adresse" />
            </li>
            <li>
              E-mail: <Fill value={s.contact_email} label="E-mail" />
            </li>
          </ul>
          <p>
            Har du spørgsmål til, hvordan vi behandler dine oplysninger, er du velkommen til at skrive til os på e-mailen
            ovenfor.
          </p>
        </>
      ),
    },
    {
      id: "oplysninger",
      title: "Hvilke oplysninger vi behandler",
      body: (
        <>
          <p>Vi behandler kun de oplysninger, der er nødvendige for at levere medlemskabet til dig:</p>
          <ul>
            <li>
              <strong>Kontooplysninger:</strong> navn, e-mail og adgangskode. Adgangskoden gemmes kun i krypteret form, så
              vi kan ikke se den.
            </li>
            <li>
              <strong>Profiloplysninger:</strong> de oplysninger, du selv skriver på din profil, for eksempel profilbillede,
              en kort tekst om dig, telefonnummer og hvordan du helst vil kontaktes.
            </li>
            <li>
              <strong>Svar i spørgeskemaet:</strong> for eksempel dit træningsniveau, dine mål, din hverdag, hvor du træner,
              og hvilket udstyr du har.
            </li>
            <li>
              <strong>Helbredsoplysninger:</strong> oplysninger om for eksempel skader, sygdomme eller smerter, som du selv
              vælger at give. Helbredsoplysninger er en særlig kategori af personoplysninger efter
              databeskyttelsesforordningens artikel 9. Vi gemmer dem kun, hvis du har givet dit udtrykkelige samtykke. Du
              kan når som helst trække samtykket tilbage under Min profil – så sletter vi de helbredsoplysninger, du har
              givet.
            </li>
            <li>
              <strong>Træningsplaner og kostplaner,</strong> som {coach} laver til dig, og din registrering af gennemførte
              træninger.
            </li>
            <li>
              <strong>Beskeder:</strong> private beskeder mellem dig og andre medlemmer eller {coach}.
            </li>
            <li>
              <strong>Indhold i fællesskabet:</strong> de beskeder og billeder, du deler med de andre medlemmer.
            </li>
            <li>
              <strong>Betalingsoplysninger:</strong> betalingen håndteres af betalingsudbyderen Stripe. Vi modtager
              oplysninger om dit medlemskab og dine betalinger – for eksempel beløb, datoer og status – men vi gemmer ikke
              dit kortnummer.
            </li>
            <li>
              <strong>Henvendelser:</strong> navn, e-mail, eventuelt telefonnummer og din besked, når du skriver til os via
              kontaktformularen.
            </li>
            <li>
              <strong>Tekniske oplysninger:</strong> din IP-adresse bruges kortvarigt til at beskytte siden mod misbrug,
              for eksempel ved at begrænse, hvor mange beskeder der kan sendes via kontaktformularen.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "formaal",
      title: "Formål og retsgrundlag",
      body: (
        <>
          <p>Vi behandler dine oplysninger til disse formål og med dette retsgrundlag:</p>
          <ul>
            <li>
              <strong>At levere medlemskabet</strong> – din konto, din træningsplan, fællesskabet og beskeder:
              databeskyttelsesforordningens artikel 6, stk. 1, litra b (opfyldelse af aftalen med dig).
            </li>
            <li>
              <strong>Betaling og bogføring:</strong> artikel 6, stk. 1, litra b, og artikel 6, stk. 1, litra c (retlig
              forpligtelse efter bogføringsloven).
            </li>
            <li>
              <strong>Sikkerhed, forebyggelse af misbrug, behandling af anmeldt indhold og svar på henvendelser:</strong>{" "}
              artikel 6, stk. 1, litra f (vores legitime interesse i at drive en sikker og tryg tjeneste og svare dem, der
              skriver til os).
            </li>
            <li>
              <strong>Helbredsoplysninger:</strong> artikel 9, stk. 2, litra a (dit udtrykkelige samtykke). Du kan til
              enhver tid trække samtykket tilbage. Det påvirker ikke lovligheden af behandlingen, før du trak det tilbage.
            </li>
          </ul>
          <p>Vi bruger ikke dine oplysninger til markedsføring fra andre, og vi sælger aldrig dine oplysninger.</p>
        </>
      ),
    },
    {
      id: "cookies",
      title: "Cookies",
      body: (
        <>
          <p>
            Vi bruger kun cookies, der er nødvendige for, at du kan logge ind og forblive logget ind. Vi bruger ikke cookies
            til statistik, analyse eller markedsføring, og vi viser ikke annoncer. Derfor beder vi ikke om samtykke til
            cookies.
          </p>
          <p>
            Når du betaler, bliver du sendt til Stripes betalingsside. Stripe har sine egne regler for cookies og
            behandling af personoplysninger.
          </p>
        </>
      ),
    },
    {
      id: "databehandlere",
      title: "Hvem vi deler oplysninger med",
      body: (
        <>
          <p>
            Vi bruger nogle få leverandører til at drive {business}. De behandler kun oplysninger efter vores anvisning og
            efter en databehandleraftale <Ph>skal bekræftes for hver leverandør</Ph>:
          </p>
          <ul>
            <li>
              <strong>Supabase</strong> – database, login og opbevaring af filer. Region: <Ph>region, f.eks. EU</Ph>.
            </li>
            <li>
              <strong>Stripe</strong> – betaling med kort. Region: <Ph>region</Ph>. Stripe er for visse behandlinger selv
              dataansvarlig, blandt andet for at forebygge svindel <Ph>skal bekræftes</Ph>.
            </li>
            <li>
              <strong>Vercel</strong> – drift af hjemmesiden. Region: <Ph>region</Ph>.
            </li>
            <li>
              <strong>Resend</strong> – afsendelse af e-mails, hvis e-mailbeskeder er slået til. Region:{" "}
              <Ph>region</Ph>.
            </li>
          </ul>
          <p>
            Andre medlemmer kan se dit navn, dit profilbillede, den korte tekst på din profil og det, du selv deler i
            fællesskabet. De kan ikke se dine svar i spørgeskemaet, dine helbredsoplysninger, din træningsplan eller dine
            betalinger.
          </p>
        </>
      ),
    },
    {
      id: "overfoersel",
      title: "Overførsel til lande uden for EU/EØS",
      body: (
        <p>
          <Ph>
            Beskriv, om oplysninger overføres til lande uden for EU/EØS (f.eks. USA), og hvilket overførselsgrundlag der
            bruges, f.eks. EU-Kommissionens standardkontraktbestemmelser eller EU-US Data Privacy Framework – skal gennemgås
            juridisk
          </Ph>
        </p>
      ),
    },
    {
      id: "beskeder",
      title: "Private beskeder og moderation",
      body: (
        <>
          <p>
            Private beskeder kan kun læses af dem, der deltager i samtalen. Skriver du med {coach}, kan {coach} altså læse
            de beskeder, I sender til hinanden – men ikke dine samtaler med andre medlemmer.
          </p>
          <p>
            Hvis en besked eller et opslag bliver anmeldt, kan administratoren se det anmeldte indhold for at behandle
            anmeldelsen. Det er kun anmeldt indhold, der bliver gennemgået på den måde.
          </p>
        </>
      ),
    },
    {
      id: "opbevaring",
      title: "Hvor længe vi gemmer oplysningerne",
      body: (
        <ul>
          <li>
            <strong>Konto, profil, planer og beskeder:</strong> så længe du er medlem og derefter i{" "}
            <Ph>X måneder efter medlemskabets ophør – fastsættes af {coach}</Ph>.
          </li>
          <li>
            <strong>Helbredsoplysninger:</strong> indtil du trækker dit samtykke tilbage, eller din konto bliver slettet.
          </li>
          <li>
            <strong>Bogføringsmateriale</strong> om dine betalinger: 5 år fra udgangen af det regnskabsår, det vedrører,
            som bogføringsloven kræver.
          </li>
          <li>
            <strong>Henvendelser via kontaktformularen:</strong> <Ph>opbevaringsperiode – fastsættes af {coach}</Ph>.
          </li>
        </ul>
      ),
    },
    {
      id: "rettigheder",
      title: "Dine rettigheder",
      body: (
        <>
          <p>Efter databeskyttelsesreglerne har du ret til at:</p>
          <ul>
            <li>få indsigt i de oplysninger, vi har om dig</li>
            <li>få forkerte oplysninger rettet</li>
            <li>få dine oplysninger slettet</li>
            <li>få begrænset behandlingen af dine oplysninger</li>
            <li>få udleveret dine oplysninger i et almindeligt, maskinlæsbart format (dataportabilitet)</li>
            <li>gøre indsigelse mod behandling, der sker på grundlag af vores legitime interesse</li>
            <li>trække dit samtykke tilbage, hvor behandlingen sker på grundlag af samtykke</li>
          </ul>
          <h3>Sådan bruger du dine rettigheder</h3>
          <p>
            Når du er logget ind, kan du under Min profil hente en kopi af dine oplysninger (dataeksport), trække dit
            samtykke til helbredsoplysninger tilbage og anmode om at få din konto slettet. Du kan også skrive til os på{" "}
            <Fill value={s.contact_email} label="E-mail" />. Vi svarer senest inden for en måned, som reglerne kræver.
          </p>
          <p>
            Der kan være oplysninger, vi er forpligtet til at gemme, selvom du beder om sletning – for eksempel
            bogføringsmateriale.
          </p>
        </>
      ),
    },
    {
      id: "klage",
      title: "Klage til Datatilsynet",
      body: (
        <p>
          Er du utilfreds med, hvordan vi behandler dine oplysninger, kan du klage til Datatilsynet. Du finder
          kontaktoplysninger og vejledning på{" "}
          <a href="https://www.datatilsynet.dk" rel="noopener noreferrer">
            www.datatilsynet.dk
          </a>
          . Du er også velkommen til at kontakte os først, så vi kan prøve at løse det.
        </p>
      ),
    },
    {
      id: "aendringer",
      title: "Ændringer i privatlivspolitikken",
      body: (
        <p>
          Vi opdaterer privatlivspolitikken, hvis vi ændrer den måde, vi behandler oplysninger på. Ved væsentlige ændringer
          giver vi dig besked, før de træder i kraft.
        </p>
      ),
    },
  ];

  return (
    <LegalDocument
      title="Privatlivspolitik"
      intro={
        <p>
          Her kan du læse, hvordan {business} behandler personoplysninger om dig, når du besøger hjemmesiden, opretter en
          konto og er medlem – og hvilke rettigheder du har.
        </p>
      }
      sections={sections}
    />
  );
}
