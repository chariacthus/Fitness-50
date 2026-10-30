import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { firstParam, isUuid } from "@/lib/admin/forms";
import { isEntitledMember, memberDisplayName } from "@/lib/admin/members";
import { loadMemberList } from "@/lib/admin/queries";
import { ActionForm, FormSelect, FormTextarea, FormTextField } from "@/components/admin/action-form";
import { Alert } from "@/components/ui/alert";
import { EmptyState, PageHeader } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { createTrainingPlan } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Ny træningsplan" };

export default async function NewTrainingPlanPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin("/admin/traeningsplaner/ny");
  const params = await searchParams;
  const requested = firstParam(params.medlem);
  const supabase = await createClient();
  const { rows, error } = await loadMemberList(supabase);

  const members = rows.filter(isEntitledMember).sort((a, b) => memberDisplayName(a.full_name).localeCompare(memberDisplayName(b.full_name), "da"));
  const preselected = isUuid(requested) ? members.find((m) => m.id === requested) : undefined;
  const requestedRow = isUuid(requested) && !preselected ? rows.find((r) => r.id === requested) : undefined;
  const back = preselected
    ? { href: `/admin/medlemmer/${preselected.id}`, label: `Tilbage til ${memberDisplayName(preselected.full_name)}` }
    : { href: "/admin/traeningsplaner", label: "Tilbage til træningsplaner" };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Ny træningsplan"
        back={back}
        description="Start med navn og mål. Bagefter tilføjer du træningsdage og øvelser. Planen er en kladde, indtil du udgiver den."
      />

      {error ? <Alert tone="danger">Medlemmerne kunne ikke hentes lige nu. Genindlæs siden om lidt.</Alert> : null}

      {requestedRow ? (
        <Alert tone="warning" title="Medlemmet har ikke et aktivt medlemskab">
          {memberDisplayName(requestedRow.full_name)} har ikke et aktivt medlemskab lige nu, så der kan ikke laves en plan til ham.{" "}
          <Link href={`/admin/medlemmer/${requestedRow.id}`} className="font-semibold text-brand underline underline-offset-4">
            Se medlemmet
          </Link>
        </Alert>
      ) : null}

      {!error && members.length === 0 ? (
        <EmptyState title="Ingen medlemmer med aktivt medlemskab">Når et medlem har betalt, kan du lave en træningsplan til ham her.</EmptyState>
      ) : null}

      {members.length > 0 ? (
        <div className="max-w-2xl rounded-lg border border-line bg-surface p-5 sm:p-6">
          <ActionForm action={createTrainingPlan} pendingText="Opretter planen…" className="space-y-6">
            <FormSelect
              name="member_id"
              label="Medlem"
              placeholder="Vælg medlem"
              required
              defaultValue={preselected?.id ?? ""}
              options={members.map((m) => ({ value: m.id, label: m.email ? `${memberDisplayName(m.full_name)} (${m.email})` : memberDisplayName(m.full_name) }))}
              hint="Kun medlemmer med et aktivt medlemskab kan vælges."
            />
            <FormTextField name="title" label="Titel" required maxLength={160} defaultValue="" hint="F.eks. “Styrke og bevægelighed – 3 dage om ugen”." />
            <FormTextarea name="goal" label="Mål" optional rows={3} maxLength={1000} defaultValue="" hint="Hvad skal planen hjælpe medlemmet med?" />
            <FormTextarea name="description" label="Beskrivelse" optional rows={4} maxLength={6000} defaultValue="" />
            <SubmitButton pendingText="Opretter…">Opret kladde</SubmitButton>
          </ActionForm>
        </div>
      ) : null}
    </div>
  );
}
