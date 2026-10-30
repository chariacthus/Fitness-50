import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { formatShortDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { firstParam } from "@/lib/admin/forms";
import { PROFILE_ONBOARDING, labelOr } from "@/lib/admin/labels";
import { MEMBER_FILTERS, filterMembers, memberDisplayName, memberFilter, normalizeSearch, type AdminMemberRow } from "@/lib/admin/members";
import { loadMemberList } from "@/lib/admin/queries";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/layout";
import { MembershipBadge } from "@/components/ui/membership-badge";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Medlemmer" };

function YesNo({ value, yes, no }: { value: boolean; yes: string; no: string }) {
  return value ? <Badge tone="success">{yes}</Badge> : <span className="text-ink-soft">{no}</span>;
}

function OnboardingBadge({ status }: { status: string }) {
  const info = labelOr(PROFILE_ONBOARDING, status, { label: status, tone: "neutral" });
  return <Badge tone={info.tone}>{info.label}</Badge>;
}

function MemberCard({ m }: { m: AdminMemberRow }) {
  const name = memberDisplayName(m.full_name);
  return (
    <li className="space-y-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center gap-3">
        <Avatar name={name} />
        <div className="min-w-0">
          <Link href={`/admin/medlemmer/${m.id}`} className="text-lg font-semibold text-brand underline underline-offset-4">
            {name}
          </Link>
          {m.email ? <p className="break-all text-ink-soft">{m.email}</p> : null}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div className="col-span-2">
          <dt className="sr-only">Medlemskab</dt>
          <dd>
            <MembershipBadge state={m.membership_state} />
          </dd>
        </div>
        <div>
          <dt className="text-ink-soft">Onboarding</dt>
          <dd>
            <OnboardingBadge status={m.onboarding_status} />
          </dd>
        </div>
        <div>
          <dt className="text-ink-soft">Træningsplan</dt>
          <dd>
            <YesNo value={m.has_published_plan} yes="Udgivet" no="Ingen" />
          </dd>
        </div>
        <div>
          <dt className="text-ink-soft">Kostplan</dt>
          <dd>
            <YesNo value={m.has_nutrition} yes="Tilkøbt" no="Nej" />
          </dd>
        </div>
        <div>
          <dt className="text-ink-soft">Fællesskab</dt>
          <dd>{m.community_suspended ? <Badge tone="danger">Sat på pause</Badge> : <span>Adgang</span>}</dd>
        </div>
      </dl>
    </li>
  );
}

export default async function AdminMembersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin("/admin/medlemmer");
  const params = await searchParams;
  const q = normalizeSearch(firstParam(params.q));
  const filter = memberFilter(firstParam(params.status));

  const supabase = await createClient();
  const { rows, error } = await loadMemberList(supabase, q || undefined);
  const members = filterMembers(rows, filter);
  const filtered = Boolean(q || filter.value);

  return (
    <div className="space-y-8">
      <PageHeader title="Medlemmer" description="Find et medlem, og se medlemskab, onboarding og planer." />

      <form method="get" action="/admin/medlemmer" role="search" aria-label="Søg i medlemmer" className="grid gap-4 rounded-lg border border-line bg-surface p-5 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
        <TextField name="q" label="Søg på navn eller e-mail" type="search" defaultValue={q} maxLength={100} autoComplete="off" />
        <SelectField
          name="status"
          label="Medlemskab"
          defaultValue={filter.value}
          options={MEMBER_FILTERS.map((f) => ({ value: f.value, label: f.label }))}
        />
        <Button type="submit">Søg</Button>
      </form>

      {error ? (
        <Alert tone="danger">Medlemslisten kunne ikke hentes lige nu. Genindlæs siden om lidt.</Alert>
      ) : members.length === 0 ? (
        <EmptyState
          title={filtered ? "Ingen medlemmer matcher søgningen" : "Der er ingen medlemmer endnu"}
          action={
            filtered ? (
              <ButtonLink href="/admin/medlemmer" variant="secondary">
                Vis alle medlemmer
              </ButtonLink>
            ) : undefined
          }
        >
          {filtered ? "Prøv et andet navn eller en anden e-mailadresse." : "Nye medlemmer vises her, når de har oprettet en konto."}
        </EmptyState>
      ) : (
        <section aria-labelledby="medlemmer-antal" className="space-y-4">
          <p id="medlemmer-antal" aria-live="polite" className="font-semibold">
            {members.length === 1 ? "1 medlem" : `${members.length} medlemmer`}
            {filtered ? " matcher" : ""}
            {rows.length >= 500 ? " (viser højst 500 – brug søgningen for at finde flere)" : ""}
          </p>

          <ul className="space-y-3 md:hidden">
            {members.map((m) => (
              <MemberCard key={m.id} m={m} />
            ))}
          </ul>

          <div className="hidden overflow-x-auto rounded-lg border border-line bg-surface md:block">
            <table className="w-full text-left">
              <caption className="sr-only">Medlemmer</caption>
              <thead className="border-b border-line bg-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Navn
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Medlemskab
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Onboarding
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Plan
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Kostplan
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Fællesskab
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {members.map((m) => (
                  <tr key={m.id} className="align-top">
                    <td className="px-4 py-3">
                      <Link href={`/admin/medlemmer/${m.id}`} className="font-semibold text-brand underline underline-offset-4">
                        {memberDisplayName(m.full_name)}
                      </Link>
                      {m.email ? <p className="break-all text-ink-soft">{m.email}</p> : null}
                      <p className="text-ink-soft">Oprettet {formatShortDate(m.created_at)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <MembershipBadge state={m.membership_state} />
                    </td>
                    <td className="px-4 py-3">
                      <OnboardingBadge status={m.onboarding_status} />
                    </td>
                    <td className="px-4 py-3">
                      <YesNo value={m.has_published_plan} yes="Udgivet" no="Ingen" />
                    </td>
                    <td className="px-4 py-3">
                      <YesNo value={m.has_nutrition} yes="Tilkøbt" no="Nej" />
                    </td>
                    <td className="px-4 py-3">{m.community_suspended ? <Badge tone="danger">Sat på pause</Badge> : "Adgang"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
