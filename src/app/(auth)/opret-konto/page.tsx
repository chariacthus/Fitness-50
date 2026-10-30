import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { nextFromParams, safeNext } from "@/lib/auth-flow/safe-next";
import { PageHeader } from "@/components/ui/layout";
import { SignupForm } from "./signup-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Opret konto" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SignupPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = nextFromParams(params.next);

  // Already logged in: go on to where the visitor was heading.
  if (await getUserId()) redirect(safeNext(next, "/hjem"));

  return (
    <>
      <PageHeader
        title="Opret konto"
        description="Det tager kun et par minutter. Bagefter sender vi dig en e-mail, så du kan bekræfte din adresse."
      />
      <SignupForm next={next} />
    </>
  );
}
