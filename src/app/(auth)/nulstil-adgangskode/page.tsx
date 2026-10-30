import type { Metadata } from "next";
import { getUserId } from "@/lib/auth";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/layout";
import { ResetPasswordForm } from "./reset-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Vælg ny adgangskode" };

export default async function ResetPasswordPage() {
  // A session is created when the member clicks the link in the reset (or invite) email.
  const userId = await getUserId();

  if (!userId) {
    return (
      <>
        <PageHeader title="Vælg ny adgangskode" />
        <div className="space-y-6">
          <Alert tone="warning" title="Linket er udløbet">
            Linket til at vælge en ny adgangskode er udløbet eller allerede brugt. Det er helt i orden – du kan bare bede om et
            nyt.
          </Alert>
          <ButtonLink href="/glemt-adgangskode" size="lg">
            Få et nyt link
          </ButtonLink>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Vælg ny adgangskode"
        description="Skriv din nye adgangskode to gange. Bagefter logger du ind med den."
      />
      <ResetPasswordForm />
    </>
  );
}
