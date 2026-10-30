import type { Metadata } from "next";
import Link from "next/link";
import { getSiteSettings } from "@/lib/settings";
import { renewalPhrase } from "@/components/public/copy";
import { LegalDocument, Ph, type LegalSection } from "@/components/public/legal";
import { Fill } from "@/components/public/placeholder-text";
import { getPublicProducts } from "@/components/public/products";

// Pre-rendered and refreshed every 5 minutes (no per-visitor data on this page).
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Handelsbetingelser",
  description: "Betingelser for medlemskab og køb: priser, automatisk fornyelse, opsigelse, fortrydelsesret og klagemuligheder.",
};

export default async function TermsPage() {
  const [s, products] = await Promise.all([getSiteSettings(), getPublicProducts()]);
  const business = s.business_name;
  const coach = s.coach_name;
  const renewal = renewalPhrase(products.memberships[0]?.billing_interval) ?? "hver måned";
  const nutritionMobilePay = products.nutrition?.mobilepay_enabled ?? false;

  const sections: LegalSection[] = [
    {
      id: "saelger",
      title: "Sælger",
      body: (
        <>
          <p>{business} drives af:</p>
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
            <li>
              Telefon: <Fill value={s.contact_phone} label="Telefon" />
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "ydelsen",
      title: "Ydelsen",
      body: (
        <>
          <p>
            {business} er et online medlemskab med personlig træningsvejledning for mænd over 50. Medlemskabet giver
            adgang til:
          </p>
          <ul>
            <li>en personlig træningsplan, som {coach} laver ud fra dine svar i et spørgeskema</li>
            <li>løbende justering af planen</li>
            <li>fællesskabet med de andre medlemmer</li>
            <li>private beskeder med {coach} og andre medlemmer</li>
            <li>nyt og opslag fra {coach}</li>
          </ul>
          <p>
            Planerne laves personligt af {coach} og ikke automatisk. Der er ingen fast frist for, hvornår planen er klar –
            du får besked i medlemsområdet, når den er det. Medlemskabet omfatter ikke fysisk træning med {coach},
            medmindre andet er aftalt <Ph>skal bekræftes</Ph>.
          </p>
          <p>Som tilkøb kan medlemmer købe en personlig kostplan (se punkt 8).</p>
        </>
      ),
    },
    {
      id: "priser",
      title: "Priser",
      body: (
        <p>
          Alle priser er i danske kroner (DKK) <Ph>inkl. moms – skal bekræftes</Ph>. De aktuelle priser står under{" "}
          <Link href="/medlemskab">Medlemskab og priser</Link> og bliver vist, før du betaler.
        </p>
      ),
    },
    {
      id: "fornyelse",
      title: "Medlemskab og automatisk fornyelse",
      body: (
        <>
          <p>
            Medlemskabet starter, når din første betaling er gennemført. Derefter fornyes det automatisk {renewal}, og
            beløbet trækkes på dit betalingskort, indtil du opsiger medlemskabet.
          </p>
          <p>Før du betaler, bliver du gjort opmærksom på prisen, og at medlemskabet fornyes automatisk.</p>
        </>
      ),
    },
    {
      id: "betaling",
      title: "Betaling",
      body: (
        <>
          <p>
            Medlemskabet betales med betalingskort via betalingsudbyderen Stripe. Vi gemmer ikke dine kortoplysninger.
            MobilePay kan ikke bruges til medlemskabet, fordi det fornyes automatisk.
          </p>
          {nutritionMobilePay ? (
            <p>Kostplanen kan betales med betalingskort eller MobilePay.</p>
          ) : (
            <p>Kostplanen betales med betalingskort.</p>
          )}
          <p>
            Kvittering for betalingen <Ph>beskriv, hvordan og hvornår kvitteringen sendes</Ph>.
          </p>
        </>
      ),
    },
    {
      id: "opsigelse",
      title: "Opsigelse",
      body: (
        <p>
          Du kan opsige medlemskabet når som helst under Min profil eller ved at skrive til os. Opsigelsen træder i kraft
          ved udgangen af den periode, du allerede har betalt for, og du beholder adgangen indtil da. Der trækkes ikke flere
          betalinger efter opsigelsen. Der gives ikke refusion for en påbegyndt periode <Ph>skal bekræftes</Ph>.
        </p>
      ),
    },
    {
      id: "fortrydelsesret",
      title: "Fortrydelsesret",
      body: (
        <>
          <p>
            Når du køber online, har du 14 dages fortrydelsesret efter forbrugeraftaleloven. Fristen løber fra den dag,
            aftalen bliver indgået.
          </p>
          <p>
            Når du melder dig ind, beder du om, at medlemskabet begynder med det samme, så du kan komme i gang. Fortryder du
            inden for de 14 dage, skal du betale et beløb, der svarer til den del af ydelsen, du har fået, indtil du gav
            besked om, at du fortryder <Ph>juridisk gennemgang</Ph>.
          </p>
          <p>
            Vil du fortryde, skal du give os en utvetydig besked om det, for eksempel på e-mail til{" "}
            <Fill value={s.contact_email} label="E-mail" />. Du kan bruge standardfortrydelsesformularen{" "}
            <Ph>indsæt standardfortrydelsesformular</Ph>, men det er ikke et krav.
          </p>
          <p>
            Vi tilbagebetaler det, du skal have tilbage, senest 14 dage efter, at vi har modtaget din besked. Vi bruger samme
            betalingsmiddel, som du betalte med, medmindre vi udtrykkeligt aftaler noget andet.
          </p>
        </>
      ),
    },
    {
      id: "kostplan",
      title: "Kostplan (tilkøb)",
      body: (
        <>
          <p>
            Kostplanen er et frivilligt tilkøb, som kræver et aktivt medlemskab. Den betales én gang og fornyes ikke.{" "}
            {coach} laver kostplanen personligt ud fra dine svar i et kort spørgeskema.
          </p>
          <p>
            Fortrydelsesretten bortfalder, når kostplanen er leveret fuldt ud, hvis du udtrykkeligt har bedt om, at arbejdet
            begynder inden for fortrydelsesfristen, og har bekræftet, at du mister fortrydelsesretten, når kostplanen er
            leveret <Ph>juridisk gennemgang</Ph>.
          </p>
          <p>Kostplanen er generel kostvejledning og ikke diætbehandling.</p>
        </>
      ),
    },
    {
      id: "manglende-betaling",
      title: "Manglende betaling",
      body: (
        <p>
          Hvis en betaling ikke går igennem, får du besked, og betalingen bliver forsøgt igen. Du beholder adgangen i en
          kort frist på <Ph>X dage</Ph>. Er betalingen stadig ikke gennemført, når fristen er udløbet, bliver din adgang sat
          på pause, indtil betalingen er i orden. <Ph>Beskriv, hvornår medlemskabet ophører, hvis betalingen ikke lykkes – skal bekræftes</Ph>
        </p>
      ),
    },
    {
      id: "prisaendringer",
      title: "Prisændringer",
      body: (
        <p>
          Hvis vi ændrer prisen på medlemskabet, giver vi dig besked mindst <Ph>X dage</Ph> før, den nye pris gælder for dig.
          Du kan opsige medlemskabet, før prisændringen træder i kraft.
        </p>
      ),
    },
    {
      id: "helbred",
      title: "Helbred og din egen træning",
      body: (
        <>
          <p>
            {business} er træningsvejledning og ikke medicinsk behandling. {coach} stiller ikke diagnoser og erstatter ikke
            din læge, fysioterapeut eller anden behandler.
          </p>
          <ul>
            <li>Tal med din læge, før du starter, hvis du har en sygdom, en skade eller er i tvivl om dit helbred.</li>
            <li>Lyt til din krop, og tilpas træningen efter, hvordan du har det.</li>
            <li>
              Stop træningen, og søg læge, hvis du får smerter i brystet, bliver svimmel, får åndenød ud over det normale
              eller på anden måde føler dig utilpas.
            </li>
          </ul>
          <p>
            Du træner på eget ansvar og er selv ansvarlig for at give korrekte oplysninger om dit helbred, hvis du vælger at
            dele dem <Ph>juridisk gennemgang</Ph>.
          </p>
        </>
      ),
    },
    {
      id: "faellesskab",
      title: "Regler for fællesskabet",
      body: (
        <>
          <p>Fællesskabet skal være et trygt sted for alle. Derfor gælder disse regler:</p>
          <ul>
            <li>Vis respekt, og skriv i en venlig tone.</li>
            <li>Ingen chikane, trusler, nedladende eller diskriminerende indhold.</li>
            <li>Ingen påstande om medicinsk behandling, og ingen råd, der giver sig ud for at være lægefaglige.</li>
            <li>Ingen reklame eller spam.</li>
            <li>Del ikke andres personlige oplysninger, billeder eller private beskeder uden deres tilladelse.</li>
          </ul>
          <p>
            Du kan anmelde indhold, der bryder reglerne. Vi kan skjule eller fjerne indhold og udelukke medlemmer fra
            fællesskabet midlertidigt eller permanent, hvis reglerne bliver brudt.
          </p>
        </>
      ),
    },
    {
      id: "ansvar",
      title: "Ansvar",
      body: (
        <p>
          Vi gør vores bedste for, at {business} altid virker, men vi kan ikke garantere, at tjenesten er tilgængelig uden
          afbrydelser. Vi er ikke ansvarlige for indirekte tab, medmindre andet følger af ufravigelige regler.{" "}
          <Ph>Omfanget af ansvarsbegrænsningen – juridisk gennemgang</Ph>
        </p>
      ),
    },
    {
      id: "klager",
      title: "Klager",
      body: (
        <>
          <p>
            Er du utilfreds med noget, så skriv til os på <Fill value={s.contact_email} label="E-mail" />. Så finder vi
            sammen en løsning.
          </p>
          <p>
            Kan vi ikke blive enige, kan du klage til Nævnenes Hus, Center for Klageløsning, via{" "}
            <a href="https://www.naevneneshus.dk" rel="noopener noreferrer">
              www.naevneneshus.dk
            </a>
            .
          </p>
        </>
      ),
    },
    {
      id: "aendringer",
      title: "Ændringer af betingelserne",
      body: (
        <p>
          Vi kan ændre handelsbetingelserne. Væsentlige ændringer får du besked om, før de træder i kraft, og du kan opsige
          medlemskabet, hvis du ikke ønsker at fortsætte på de nye betingelser. Aftalen er underlagt dansk ret.
        </p>
      ),
    },
  ];

  return (
    <LegalDocument
      title="Handelsbetingelser"
      intro={
        <p>
          Her kan du læse betingelserne for at være medlem af {business} og for at købe en kostplan. Læs dem, før du melder
          dig ind.
        </p>
      }
      sections={sections}
    />
  );
}
