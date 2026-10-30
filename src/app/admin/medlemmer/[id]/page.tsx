import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth";
import { formatDate, formatDateTime, formatDKK, formatInterval, formatShortDate } from "@/lib/format";
import { parseMembershipSummary } from "@/lib/membership";
import { PURCHASE_STATUS, SUBSCRIPTION_STATUS, statusInfo } from "@/lib/payments/labels";
import { BUCKETS } from "@/lib/storage";
import { signedUrl } from "@/lib/storage-server";
import { createClient } from "@/lib/supabase/server";
import { formatDay } from "@/lib/training/week";
import { firstParam, isUuid } from "@/lib/admin/forms";
import { CONTACT_PREFERENCE, PROFILE_ONBOARDING, SUBMISSION_STATUS, labelOr } from "@/lib/admin/labels";
import { genitive, memberDisplayName } from "@/lib/admin/members";
import { adminAnswers } from "@/lib/admin/onboarding";
import { ActionForm, FormTextarea } from "@/components/admin/action-form";
import { AdminAnswersView } from "@/components/admin/admin-answers";
import { PlanStatusBadge } from "@/components/admin/plan-status";
import { SuspensionForm } from "@/components/admin/suspension-form";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { DetailList, EmptyState, PageHeader, SectionTitle } from "@/components/ui/layout";
import { MembershipBadge } from "@/components/ui/membership-badge";
import { grantNutritionAccess, setMemberSuspension } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Medlem" };

function Section({ id, title, children, actions }: { id: string; title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle id={id}>{title}</SectionTitle>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function asProductName(value: unknown): string | null {
  return value && typeof value === "object" && "name" in value && typeof value.name === "string" ? value.name : null;
}
function asProductSlug(value: unknown): string | null {
  return value && typeof value === "object" && "slug" in value && typeof value.slug === "string" ? value.slug : null;
}
function asSessionTitle(value: unknown): string | null {
  return value && typeof value === "object" && "title" in value && typeof value.title === "string" ? value.title : null;
}

export default async function AdminMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const grantParam = firstParam((await searchParams).kostplan);
  await requireAdmin(`/admin/medlemmer/${id}`);
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const { data: profile, error: profileError } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  if (profileError) {
    return (
      <>
        <PageHeader title="Medlem" back={{ href: "/admin/medlemmer", label: "Tilbage til medlemmer" }} />
        <Alert tone="danger">Medlemmet kunne ikke hentes lige nu. Genindlæs siden om lidt.</Alert>
      </>
    );
  }
  if (!profile) notFound();

  const [privateRes, summaryRes, subsRes, purchasesRes, onboardingRes, plansRes, nutritionRes, completionsRes, rolesRes, reportsRes, openReportsRes] =
    await Promise.all([
      supabase.from("profile_private").select("email, phone, contact_preference, suspension_reason").eq("user_id", id).maybeSingle(),
      supabase.rpc("membership_summary", { p_user: id }),
      supabase
        .from("subscriptions")
        .select("id, status, amount, billing_interval, current_period_end, cancel_at_period_end, cancel_at, created_at, provider")
        .eq("user_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("purchases")
        .select("id, status, amount, provider, note, paid_at, created_at, products(name, slug)")
        .eq("user_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("onboarding_submissions")
        .select("id, status, answers, health_info, health_consent, nutrition_answers, submitted_at, reviewed_at, updated_at")
        .eq("user_id", id)
        .maybeSingle(),
      supabase
        .from("training_plans")
        .select("id, title, status, published_at, archived_at, updated_at, created_at")
        .eq("member_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("nutrition_plans")
        .select("id, title, status, published_at, updated_at, created_at")
        .eq("member_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("workout_completions")
        .select("id, completed_on, completed_at, note, training_sessions(title)")
        .eq("member_id", id)
        .order("completed_at", { ascending: false })
        .limit(10),
      supabase.from("user_roles").select("role").eq("user_id", id),
      supabase.from("reports").select("id", { count: "exact", head: true }).eq("target_user_id", id),
      supabase.from("reports").select("id", { count: "exact", head: true }).eq("target_user_id", id).eq("status", "open"),
    ]);

  const name = memberDisplayName(profile.full_name);
  const priv = privateRes.data;
  const summary = parseMembershipSummary(summaryRes.data);
  const isAdminAccount = (rolesRes.data ?? []).some((r) => r.role === "admin");
  const purchases = purchasesRes.data ?? [];
  const hasNutrition = purchases.some((p) => asProductSlug(p.products) === "kostplan" && (p.status === "paid" || p.status === "granted"));
  const submission = onboardingRes.data;
  const plans = plansRes.data ?? [];
  const nutritionPlans = nutritionRes.data ?? [];
  const completions = completionsRes.data ?? [];
  const avatarUrl = await signedUrl(supabase, BUCKETS.avatars, profile.avatar_path);
  const onboardingInfo = labelOr(PROFILE_ONBOARDING, profile.onboarding_status, { label: profile.onboarding_status, tone: "neutral" });
  const reportCount = reportsRes.count ?? 0;
  const openReportCount = openReportsRes.count ?? 0;

  const publications = [
    ...plans.filter((p) => p.published_at).map((p) => ({ id: p.id, kind: "Træningsplan", title: p.title, at: p.published_at as string, href: `/admin/traeningsplaner/${p.id}` })),
    ...nutritionPlans.filter((p) => p.published_at).map((p) => ({ id: p.id, kind: "Kostplan", title: p.title, at: p.published_at as string, href: `/admin/kostplaner/${p.id}` })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const loadFailed = [privateRes, summaryRes, subsRes, purchasesRes, onboardingRes, plansRes, nutritionRes, completionsRes].some((r) => r.error);

  return (
    <div className="space-y-12">
      <PageHeader
        title={name}
        back={{ href: "/admin/medlemmer", label: "Tilbage til medlemmer" }}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <MembershipBadge state={summary.state} />
            {isAdminAccount ? <Badge tone="brand">Administrator</Badge> : null}
            {profile.community_suspended ? <Badge tone="danger">Fællesskab sat på pause</Badge> : null}
          </span>
        }
        actions={
          <>
            <ButtonLink href={`/beskeder/ny?til=${id}`}>Send besked</ButtonLink>
            <ButtonLink href={`/admin/traeningsplaner/ny?medlem=${id}`} variant="secondary">
              Ny træningsplan
            </ButtonLink>
          </>
        }
      />

      {loadFailed ? <Alert tone="danger">Nogle oplysninger kunne ikke hentes. Genindlæs siden for at prøve igen.</Alert> : null}

      <Section id="kontakt-titel" title="Kontakt og profil">
        <div className="flex items-start gap-4 rounded-lg border border-line bg-surface p-5">
          <Avatar name={name} src={avatarUrl} size="lg" />
          <div className="min-w-0 flex-1">
            <DetailList
              items={[
                { label: "E-mail", value: priv?.email ? <a href={`mailto:${priv.email}`} className="break-all font-semibold text-brand underline underline-offset-4">{priv.email}</a> : "Ikke oplyst" },
                { label: "Telefon", value: priv?.phone ? <a href={`tel:${priv.phone.replace(/\s+/g, "")}`} className="font-semibold text-brand underline underline-offset-4">{priv.phone}</a> : "Ikke oplyst" },
                { label: "Foretrukken kontakt", value: priv?.contact_preference ? (CONTACT_PREFERENCE[priv.contact_preference] ?? priv.contact_preference) : "Ikke oplyst" },
                { label: "Konto oprettet", value: formatDate(profile.created_at) },
                { label: "Om sig selv", value: profile.bio?.trim() ? <span className="whitespace-pre-line">{profile.bio.trim()}</span> : "Ikke udfyldt" },
                {
                  label: "Fællesskab",
                  value: profile.community_suspended ? (
                    <span>
                      <Badge tone="danger">Sat på pause</Badge>
                      {priv?.suspension_reason ? <span className="mt-1 block whitespace-pre-line">Begrundelse: {priv.suspension_reason}</span> : null}
                    </span>
                  ) : (
                    "Har adgang"
                  ),
                },
              ]}
            />
          </div>
        </div>
      </Section>

      <Section id="medlemskab-titel" title="Medlemskab og betalinger">
        <div className="rounded-lg border border-line bg-surface p-5">
          <DetailList
            items={[
              { label: "Status", value: <MembershipBadge state={summary.state} /> },
              ...(summary.product_name ? [{ label: "Produkt", value: summary.product_name }] : []),
              ...(summary.amount != null ? [{ label: "Pris", value: `${formatDKK(summary.amount)} ${formatInterval(summary.billing_interval)}` }] : []),
              ...(summary.access_until ? [{ label: "Adgang til og med", value: formatDate(summary.access_until) }] : []),
              ...(!summary.access_until && summary.current_period_end ? [{ label: "Næste fornyelse", value: formatDate(summary.current_period_end) }] : []),
              ...(summary.grace_until ? [{ label: "Adgang under betalingsproblemer til", value: formatDateTime(summary.grace_until) }] : []),
            ]}
          />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-xl font-semibold">Abonnementer</h3>
            {(subsRes.data ?? []).length === 0 ? (
              <p className="text-ink-soft">Ingen abonnementer.</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                {(subsRes.data ?? []).map((s) => {
                  const st = statusInfo(SUBSCRIPTION_STATUS, s.status);
                  return (
                    <li key={s.id} className="space-y-1 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={st.tone}>{st.label}</Badge>
                        {s.cancel_at_period_end || s.cancel_at ? <Badge tone="warning">Opsagt</Badge> : null}
                      </div>
                      <p>
                        {s.amount != null ? `${formatDKK(s.amount)} ${formatInterval(s.billing_interval)} · ` : ""}
                        Oprettet {formatShortDate(s.created_at)}
                        {s.current_period_end ? ` · Periode slutter ${formatShortDate(s.current_period_end)}` : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="space-y-3">
            <h3 className="text-xl font-semibold">Køb og tilkøb</h3>
            {purchases.length === 0 ? (
              <p className="text-ink-soft">Ingen køb.</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                {purchases.map((p) => {
                  const st = statusInfo(PURCHASE_STATUS, p.status);
                  return (
                    <li key={p.id} className="space-y-1 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{asProductName(p.products) ?? "Tilkøb"}</span>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </div>
                      <p>
                        {p.amount != null ? `${formatDKK(p.amount)} · ` : ""}
                        {formatShortDate(p.paid_at ?? p.created_at)}
                      </p>
                      {p.note ? <p className="text-ink-soft">Note: {p.note}</p> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
        <p>
          <Link href="/admin/betalinger" className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4">
            Gå til betalinger
          </Link>
        </p>
      </Section>

      <Section id="onboarding-titel" title="Onboarding">
        {!submission ? (
          <EmptyState title="Onboardingskemaet er ikke startet">{name} har ikke udfyldt noget i onboardingskemaet endnu.</EmptyState>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={labelOr(SUBMISSION_STATUS, submission.status, onboardingInfo).tone}>
                {labelOr(SUBMISSION_STATUS, submission.status, onboardingInfo).label}
              </Badge>
              {submission.submitted_at ? <span className="text-ink-soft">Sendt {formatDateTime(submission.submitted_at)}</span> : null}
              {submission.reviewed_at ? <span className="text-ink-soft">· Gennemgået {formatDate(submission.reviewed_at)}</span> : null}
              {submission.status !== "draft" ? (
                <Link href={`/admin/onboarding/${submission.id}`} className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4">
                  Åbn skemaet
                </Link>
              ) : null}
            </div>
            {submission.status === "draft" ? (
              <p className="text-ink-soft">{name} er i gang med skemaet, men har ikke sendt det endnu.</p>
            ) : (
              <details className="rounded-lg border border-line bg-surface">
                <summary className="flex min-h-12 cursor-pointer items-center px-5 font-semibold">Vis svarene fra onboardingskemaet</summary>
                <div className="border-t border-line p-5">
                  <AdminAnswersView answers={adminAnswers(submission)} idPrefix="medlem-svar" />
                </div>
              </details>
            )}
          </div>
        )}
      </Section>

      <Section
        id="traeningsplaner-titel"
        title="Træningsplaner"
        actions={
          <ButtonLink href={`/admin/traeningsplaner/ny?medlem=${id}`} variant="secondary" size="sm">
            Ny træningsplan
          </ButtonLink>
        }
      >
        {plans.length === 0 ? (
          <p className="text-ink-soft">{name} har ingen træningsplaner endnu.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {plans.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="space-y-1">
                  <Link href={`/admin/traeningsplaner/${p.id}`} className="font-semibold text-brand underline underline-offset-4">
                    {p.title}
                  </Link>
                  <p className="text-ink-soft">Senest ændret {formatShortDate(p.updated_at)}</p>
                </div>
                <PlanStatusBadge status={p.status} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        id="kostplan-titel"
        title="Kostplan"
        actions={
          hasNutrition ? (
            <ButtonLink href={`/admin/kostplaner/ny?medlem=${id}`} variant="secondary" size="sm">
              Ny kostplan
            </ButtonLink>
          ) : (
            <Button variant="secondary" size="sm" disabled aria-describedby="kostplan-grund">
              Ny kostplan
            </Button>
          )
        }
      >
        {hasNutrition && grantParam.startsWith("givet") ? (
          <Alert tone="success" title="Adgang givet">
            {name} har nu adgang til en personlig kostplan.{" "}
            {grantParam === "givet"
              ? `${name} har fået en notifikation på siden.`
              : "Der kunne ikke sendes en notifikation på siden – giv gerne selv besked."}
          </Alert>
        ) : null}
        {hasNutrition ? (
          <p>
            <Badge tone="success">Har adgang til en personlig kostplan</Badge>
          </p>
        ) : (
          <div className="space-y-4 rounded-lg border border-line bg-surface p-5">
            <p id="kostplan-grund">
              {name} har ikke købt en personlig kostplan, så der kan ikke laves en kostplan endnu. Du kan give adgang her, f.eks. som gave eller
              efter en betaling uden om siden.
            </p>
            <ActionForm action={grantNutritionAccess} hidden={{ user_id: id }} pendingText="Giver adgang…">
              <FormTextarea name="note" label="Note" optional hint="F.eks. hvorfor adgangen gives. Noten gemmes ved købet." rows={2} maxLength={1000} />
              <ConfirmButton
                variant="primary"
                title={`Giv ${name} adgang til en kostplan?`}
                description={`${name} får adgang til en personlig kostplan uden at betale via siden. Det registreres som givet af dig.`}
                confirmLabel="Ja, giv adgang"
              >
                Giv adgang til kostplan
              </ConfirmButton>
            </ActionForm>
          </div>
        )}
        {nutritionPlans.length > 0 ? (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {nutritionPlans.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="space-y-1">
                  <Link href={`/admin/kostplaner/${p.id}`} className="font-semibold text-brand underline underline-offset-4">
                    {p.title}
                  </Link>
                  <p className="text-ink-soft">Senest ændret {formatShortDate(p.updated_at)}</p>
                </div>
                <PlanStatusBadge status={p.status} />
              </li>
            ))}
          </ul>
        ) : hasNutrition ? (
          <p className="text-ink-soft">Der er ikke lavet en kostplan endnu.</p>
        ) : null}
      </Section>

      <Section id="historik-titel" title="Træningshistorik">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-xl font-semibold">Seneste gennemførte træninger</h3>
            {completions.length === 0 ? (
              <p className="text-ink-soft">{name} har ikke registreret nogen træninger endnu.</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                {completions.map((c) => (
                  <li key={c.id} className="space-y-1 px-4 py-3">
                    <p className="font-semibold">{asSessionTitle(c.training_sessions) ?? "Træning"}</p>
                    <p className="text-ink-soft">{formatDay(c.completed_on)}</p>
                    {c.note?.trim() ? <p className="whitespace-pre-line">Note: {c.note.trim()}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-3">
            <h3 className="text-xl font-semibold">Udgivne planer</h3>
            {publications.length === 0 ? (
              <p className="text-ink-soft">Der er ikke udgivet nogen planer til {name} endnu.</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                {publications.map((p) => (
                  <li key={`${p.kind}-${p.id}`} className="space-y-1 px-4 py-3">
                    <p>
                      <span className="text-ink-soft">{p.kind}: </span>
                      <Link href={p.href} className="font-semibold text-brand underline underline-offset-4">
                        {p.title}
                      </Link>
                    </p>
                    <p className="text-ink-soft">Udgivet {formatDate(p.at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Section>

      <Section id="faellesskab-titel" title="Fællesskab og anmeldelser">
        <div className="space-y-4 rounded-lg border border-line bg-surface p-5">
          <p>
            {reportCount === 0
              ? `Der er ingen anmeldelser af ${name}.`
              : `${name} er nævnt i ${reportCount === 1 ? "1 anmeldelse" : `${reportCount} anmeldelser`}${openReportCount > 0 ? `, heraf ${openReportCount} åben${openReportCount === 1 ? "" : "e"}` : ""}.`}
          </p>
          {reportCount > 0 ? (
            <ButtonLink href={`/admin/rapporter?medlem=${id}`} variant="secondary" size="sm">
              Se anmeldelser af {name}
            </ButtonLink>
          ) : null}
          {isAdminAccount ? (
            <p className="text-ink-soft">Administratorer kan ikke sættes på pause i fællesskabet.</p>
          ) : (
            <div className="border-t border-line pt-4">
              <h3 className="mb-3 text-xl font-semibold">{profile.community_suspended ? "Genåbn adgangen" : `${genitive(name)} adgang til fællesskabet`}</h3>
              <SuspensionForm action={setMemberSuspension} userId={id} name={name} suspended={profile.community_suspended} />
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
