import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { firstParam, isUuid } from "@/lib/admin/forms";
import { memberDisplayName } from "@/lib/admin/members";
import { loadMemberList } from "@/lib/admin/queries";
import { ActionForm, FormSelect, FormTextarea, FormTextField } from "@/components/admin/action-form";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { createNutritionPlan } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Ny kostplan" };

export default async function NewNutritionPlanPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin("/admin/kostplaner/ny");
  const params = await searchParams;
  const requested = firstParam(params.medlem);
  const supabase = await createClient();
  const { rows, error } = await loadMemberList(supabase);

  const members = rows
    .filter((m) => m.has_nutrition)
    .sort((a, b) => memberDisplayName(a.full_name).localeCompare(memberDisplayName(b.full_name), "da"));
  const preselected = isUuid(requested) ? members.find((m) => m.id === requested) : undefined;
  const withoutAddon = isUuid(requested) && !preselected ? rows.find((r) => r.id === requested) : undefined;
  const back = preselected
    ? { href: `/admin/medlemmer/${preselected.id}`, label: `Tilbage til ${memberDisplayName(preselected.full_name)}` }
    : { href: "/admin/kostplaner", label: "Tilbage til kostplaner" };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Ny kostplan"
        back={back}
        description="Start med titel og en kort introduktion. Bagefter tilføjer du måltider og råd. Kostplanen er en kladde, indtil du udgiver den."
      />

      {error ? <Alert tone="danger">Medlemmerne kunne ikke hentes lige nu. Genindlæs siden om lidt.</Alert> : null}

      {withoutAddon ? (
        <Alert tone="warning" title={`${memberDisplayName(withoutAddon.full_name)} har ikke adgang til en kostplan`}>
          <p>
            En kostplan kan kun laves til medlemmer, der har købt tilkøbet eller fået adgang af dig. Du kan give adgang på medlemmets side.
          </p>
          <span className="mt-3 block">
            <ButtonLink href={`/admin/medlemmer/${withoutAddon.id}`} variant="secondary" size="sm">
              Gå til medlemmets side
            </ButtonLink>
          </span>
        </Alert>
      ) : null}

      {!error && members.length === 0 ? (
        <EmptyState title="Ingen medlemmer har tilkøbet endnu">
          Når et medlem har købt den personlige kostplan – eller du har givet adgang på medlemmets side – kan du lave kostplanen her.
        </EmptyState>
      ) : null}

      {members.length > 0 ? (
        <div className="max-w-2xl rounded-lg border border-line bg-surface p-5 sm:p-6">
          <ActionForm action={createNutritionPlan} pendingText="Opretter kostplanen…" className="space-y-6">
            <FormSelect
              name="member_id"
              label="Medlem"
              placeholder="Vælg medlem"
              required
              defaultValue={preselected?.id ?? ""}
              options={members.map((m) => ({ value: m.id, label: m.email ? `${memberDisplayName(m.full_name)} (${m.email})` : memberDisplayName(m.full_name) }))}
              hint="Kun medlemmer med adgang til en personlig kostplan kan vælges."
            />
            <FormTextField name="title" label="Titel" required maxLength={160} defaultValue="Din personlige kostplan" />
            <FormTextarea name="intro" label="Introduktion" optional rows={4} maxLength={4000} defaultValue="" hint="Et par linjer til medlemmet om, hvad kostplanen skal hjælpe med." />
            <SubmitButton pendingText="Opretter…">Opret kladde</SubmitButton>
          </ActionForm>
        </div>
      ) : null}
    </div>
  );
}
