import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";

/** Success message once the webhook has activated the membership. */
export function MembershipConfirmed() {
  return (
    <div className="space-y-5">
      <Alert tone="success" title="Velkommen – dit medlemskab er aktivt">
        Tak for din betaling. Du har nu adgang til hele medlemsområdet.
      </Alert>
      <p className="text-lg">
        Næste skridt er et kort spørgeskema om dine mål, din hverdag og dine erfaringer. Dine svar bruges til at lave din
        personlige træningsplan.
      </p>
      <ButtonLink href="/onboarding" size="lg">
        Udfyld spørgeskemaet
      </ButtonLink>
    </div>
  );
}
