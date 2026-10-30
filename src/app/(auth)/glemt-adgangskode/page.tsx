import type { Metadata } from "next";
import Link from "next/link";
import { nextFromParams, withNext } from "@/lib/auth-flow/safe-next";
import { PageHeader } from "@/components/ui/layout";
import { ForgotPasswordForm } from "./forgot-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Glemt adgangskode" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ForgotPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const next = nextFromParams((await searchParams).next);

  return (
    <>
      <PageHeader
        title="Glemt adgangskode?"
        description="Det sker for alle. Skriv din e-mail, så sender vi dig et link, hvor du kan vælge en ny adgangskode."
      />
      <ForgotPasswordForm next={next} />
      <p className="mt-8 text-lg">
        Kom du i tanke om den?{" "}
        <Link
          href={withNext("/log-ind", next)}
          className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4"
        >
          Log ind
        </Link>
      </p>
    </>
  );
}
