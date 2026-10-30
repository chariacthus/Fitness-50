import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { formatShortDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { firstParam } from "@/lib/admin/forms";
import { PLAN_FILTERS, planFilter } from "@/lib/admin/labels";
import { memberDisplayName } from "@/lib/admin/members";
import { loadMemberList, loadMembersWithPublishedNutrition, loadNames } from "@/lib/admin/queries";
import { PlanStatusBadge } from "@/components/admin/plan-status";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/layout";
import { cn } from "@/components/ui/cn";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Kostplaner" };

export default async function AdminNutritionPlansPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin("/admin/kostplaner");
  const params = await searchParams;
  const filter = planFilter(firstParam(params.status));
  const supabase = await createClient();

  let query = supabase
    .from("nutrition_plans")
    .select("id, member_id, title, status, updated_at")
    .order("updated_at", { ascending: false })
    .limit(300);
  if (filter.status) query = query.eq("status", filter.status);

  const [plansRes, membersRes, withPlan] = await Promise.all([query, loadMemberList(supabase), loadMembersWithPublishedNutrition(supabase)]);
  const plans = plansRes.data ?? [];
  const names = await loadNames(
    supabase,
    plans.map((p) => p.member_id),
  );
  // Same rule as the overview figure: bought or granted, but no published plan yet.
  const waiting = membersRes.rows.filter((m) => m.has_nutrition && !withPlan.has(m.id));

  return (
    <div className="space-y-10">
      <PageHeader
        title="Kostplaner"
        description="Personlige kostplaner til medlemmer, der har købt eller fået tilkøbet. En kostplan er kun synlig for medlemmet, når du har udgivet den."
        actions={<ButtonLink href="/admin/kostplaner/ny">Ny kostplan</ButtonLink>}
      />

      <section id="venter" aria-labelledby="venter-titel" className="scroll-mt-24 space-y-4">
        <SectionTitle id="venter-titel">Venter på en kostplan ({waiting.length})</SectionTitle>
        {membersRes.error ? (
          <Alert tone="danger">Listen over medlemmer kunne ikke hentes lige nu.</Alert>
        ) : waiting.length === 0 ? (
          <p className="text-ink-soft">Alle medlemmer med tilkøbet har en udgivet kostplan.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {waiting.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <Link href={`/admin/medlemmer/${m.id}`} className="font-semibold text-brand underline underline-offset-4">
                  {memberDisplayName(m.full_name)}
                </Link>
                <ButtonLink href={`/admin/kostplaner/ny?medlem=${m.id}`} variant="secondary" size="sm">
                  Lav kostplan<span className="sr-only"> til {memberDisplayName(m.full_name)}</span>
                </ButtonLink>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="planer-titel" className="space-y-4">
        <SectionTitle id="planer-titel">Alle kostplaner</SectionTitle>
        <nav aria-label="Filtrér kostplaner efter status" className="flex flex-wrap gap-2">
          {PLAN_FILTERS.map((f) => {
            const active = f.value === filter.value;
            return (
              <Link
                key={f.value}
                href={f.value ? `/admin/kostplaner?status=${f.value}` : "/admin/kostplaner"}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-md border-2 px-4 font-semibold",
                  active ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink hover:border-brand",
                )}
              >
                {f.label.replace("planer", "kostplaner")}
              </Link>
            );
          })}
        </nav>

        {plansRes.error ? (
          <Alert tone="danger">Kostplanerne kunne ikke hentes lige nu. Genindlæs siden om lidt.</Alert>
        ) : plans.length === 0 ? (
          <EmptyState
            title={filter.status ? "Ingen kostplaner med denne status" : "Der er ingen kostplaner endnu"}
            action={<ButtonLink href="/admin/kostplaner/ny">Ny kostplan</ButtonLink>}
          >
            {filter.status ? "Vælg et andet filter for at se flere kostplaner." : "Kostplaner kan laves til medlemmer, der har købt eller fået tilkøbet."}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {plans.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0 space-y-1">
                  <Link href={`/admin/kostplaner/${p.id}`} className="text-lg font-semibold text-brand underline underline-offset-4">
                    {p.title}
                  </Link>
                  <p className="text-ink-soft">
                    Til {memberDisplayName(names.get(p.member_id))} · Senest ændret {formatShortDate(p.updated_at)}
                  </p>
                </div>
                <PlanStatusBadge status={p.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
