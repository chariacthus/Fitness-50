import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { firstParam, nextFromParams, safeNext } from "@/lib/auth-flow/safe-next";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/layout";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Log ind" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = nextFromParams(params.next);
  const besked = firstParam(params.besked);
  const fejl = firstParam(params.fejl);

  // Already logged in: no reason to show the form.
  if (await getUserId()) redirect(safeNext(next, "/hjem"));

  return (
    <>
      <PageHeader title="Log ind" description="Skriv din e-mail og adgangskode for at komme ind på din side." />

      <div className="mb-6 space-y-4">
        {besked === "logget-ud" ? (
          <Alert tone="success" title="Du er logget ud">
            Tak for denne gang. Du kan logge ind igen herunder, når du har lyst.
          </Alert>
        ) : null}
        {besked === "adgangskode-opdateret" ? (
          <Alert tone="success" title="Din adgangskode er opdateret">
            Af sikkerhedshensyn skal du logge ind igen – brug din nye adgangskode.
          </Alert>
        ) : null}
        {fejl === "link" ? (
          <Alert tone="warning" title="Linket virker ikke">
            <p>Linket er udløbet eller allerede brugt. Prøv igen.</p>
            <p className="mt-2">
              Var du ved at bekræfte din e-mail, så log ind herunder – så kan du få tilsendt et nyt link. Var du ved at
              nulstille din adgangskode, så vælg »Glemt adgangskode?«.
            </p>
          </Alert>
        ) : null}
      </div>

      <LoginForm next={next} />
    </>
  );
}
