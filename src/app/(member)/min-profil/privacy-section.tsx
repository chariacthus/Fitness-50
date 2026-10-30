import { formatDate } from "@/lib/format";
import { InlineActionForm } from "@/components/profile/inline-action-form";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Panel } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { cancelDataRequest, requestAccountDeletion, setEmailNotifications, withdrawHealthConsent } from "./actions";

export function PrivacySection({
  emailNotifications,
  health,
  pendingDeletion,
  exportStatus,
  loadError,
}: {
  emailNotifications: boolean | null;
  health: { consent: boolean; consentAt: string | null; hasInfo: boolean } | null;
  pendingDeletion: { id: string; created_at: string } | null;
  exportStatus: string | undefined;
  loadError: boolean;
}) {
  return (
    <div className="space-y-6">
      {loadError ? <Alert tone="danger">Nogle af dine indstillinger kunne ikke hentes lige nu. Prøv at genindlæse siden.</Alert> : null}

      <Panel className="space-y-4">
        <h3 className="text-xl font-semibold">Besked på e-mail</h3>
        <p className="max-w-prose">
          Når der er nyt til dig – fx en ny træningsplan eller en besked – kan vi også give besked på e-mail. E-mails om dit medlemskab og din
          betaling får du altid.
        </p>
        {emailNotifications === null ? null : (
          <>
            <p>
              E-mails om nyt er: <span className="font-semibold">{emailNotifications ? "Slået til" : "Slået fra"}</span>
            </p>
            <InlineActionForm action={setEmailNotifications} hidden={{ email_notifications: emailNotifications ? "off" : "on" }} pendingText="Gemmer…">
              <SubmitButton variant="secondary" pendingText="Gemmer…">
                {emailNotifications ? "Slå e-mails fra" : "Slå e-mails til"}
              </SubmitButton>
            </InlineActionForm>
          </>
        )}
      </Panel>

      <Panel className="space-y-4">
        <h3 className="text-xl font-semibold">Helbredsoplysninger</h3>
        {health?.consent ? (
          <>
            <p className="max-w-prose">
              Du har {health.consentAt ? `den ${formatDate(health.consentAt)} ` : ""}givet samtykke til, at vi gemmer det, du har fortalt om
              skader, sygdom eller begrænsninger, så træningen kan tilpasses dig.
              {health.hasInfo ? "" : " Du har ikke skrevet nogen helbredsoplysninger endnu."}
            </p>
            <InlineActionForm action={withdrawHealthConsent} pendingText="Sletter helbredsoplysningerne…">
              <ConfirmButton
                title="Træk samtykket tilbage?"
                description="Dine helbredsoplysninger bliver slettet med det samme. Træneren kan derfor ikke længere tage hensyn til dem. Du kan altid give oplysningerne igen i spørgeskemaet."
                confirmLabel="Ja, slet oplysningerne"
              >
                Træk samtykke tilbage og slet helbredsoplysninger
              </ConfirmButton>
            </InlineActionForm>
          </>
        ) : (
          <p className="max-w-prose">Du har ikke givet samtykke til, at vi gemmer helbredsoplysninger. Vi har derfor ingen helbredsoplysninger om dig.</p>
        )}
      </Panel>

      <Panel className="space-y-4">
        <h3 className="text-xl font-semibold">Hent mine data</h3>
        <p className="max-w-prose">
          Du kan hente alt det, vi har gemt om dig – profil, spørgeskema, træningsplaner, beskeder og meget mere – i én fil. Filen er i
          formatet JSON, som kan åbnes i de fleste programmer.
        </p>
        {exportStatus === "fejl" ? (
          <Alert tone="danger">Vi kunne ikke samle dine data lige nu. Prøv igen om lidt.</Alert>
        ) : exportStatus === "vent" ? (
          <Alert tone="warning">Du har hentet dine data mange gange på kort tid. Vent en time, og prøv så igen.</Alert>
        ) : null}
        <a href="/min-profil/data-eksport" className={buttonClasses("secondary")}>
          Hent mine data
        </a>
      </Panel>

      <Panel className="space-y-4">
        <h3 className="text-xl font-semibold">Slet min konto</h3>
        {pendingDeletion ? (
          <>
            <Alert tone="info" title="Din anmodning er modtaget">
              Du bad om at få slettet din konto den {formatDate(pendingDeletion.created_at)}. Vi behandler anmodningen hurtigst muligt.
            </Alert>
            <InlineActionForm action={cancelDataRequest} hidden={{ id: pendingDeletion.id }} pendingText="Annullerer…">
              <SubmitButton variant="secondary" pendingText="Annullerer…">
                Annuller anmodning
              </SubmitButton>
            </InlineActionForm>
          </>
        ) : (
          <>
            <div className="max-w-prose space-y-2">
              <p>Hvis du vil have slettet din konto, sender du en anmodning her. Når den er behandlet:</p>
              <ul className="list-disc space-y-1 pl-6">
                <li>stopper dit medlemskab, og du bliver ikke trukket flere gange,</li>
                <li>slettes dine oplysninger: profil, spørgeskema, træningsplaner, beskeder og billeder,</li>
                <li>gemmer vores betalingsudbyder Stripe oplysningerne om dine betalinger, fordi loven kræver, at regnskab gemmes.</li>
              </ul>
            </div>
            <InlineActionForm action={requestAccountDeletion} pendingText="Sender anmodningen…">
              <ConfirmButton
                title="Anmod om sletning af din konto?"
                description="Når anmodningen er behandlet, stopper dit medlemskab, og dine oplysninger bliver slettet. Det kan ikke fortrydes bagefter. Indtil da kan du annullere anmodningen her på siden."
                confirmLabel="Ja, send anmodningen"
              >
                Anmod om sletning af konto
              </ConfirmButton>
            </InlineActionForm>
          </>
        )}
      </Panel>
    </div>
  );
}
