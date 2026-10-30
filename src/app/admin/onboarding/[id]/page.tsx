import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/admin/forms";
import { SUBMISSION_STATUS } from "@/lib/admin/labels";
import { memberDisplayName } from "@/lib/admin/members";
import { adminAnswers } from "@/lib/admin/onboarding";
import { loadNames } from "@/lib/admin/queries";
import { ActionForm } from "@/components/admin/action-form";
import { AdminAnswersView } from "@/components/admin/admin-answers";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader, SectionTitle } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { markSubmissionReviewed } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Onboardingskema" };

export default async function AdminOnboardingSubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin(`/admin/onboarding/${id}`);
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const { data: submission, error } = await supabase
    .from("onboarding_submissions")
    .select("id, user_id, status, answers, health_info, health_consent, nutrition_answers, submitted_at, reviewed_at, reviewed_by, updated_at")
    .eq("id", id)
    .maybeSingle();

  const back = { href: "/admin/onboarding", label: "Tilbage til onboarding" };
  if (error) {
    return (
      <>
        <PageHeader title="Onboardingskema" back={back} />
        <Alert tone="danger">Skemaet kunne ikke hentes lige nu. Genindlæs siden om lidt.</Alert>
      </>
    );
  }
  if (!submission) notFound();

  const names = await loadNames(supabase, [submission.user_id, submission.reviewed_by]);
  const name = memberDisplayName(names.get(submission.user_id));
  const status = SUBMISSION_STATUS[submission.status] ?? SUBMISSION_STATUS.submitted;

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Onboardingskema: ${name}`}
        back={back}
        description={
          <span className="flex flex-wrap items-center gap-3">
            <Badge tone={status.tone}>{status.label}</Badge>
            {submission.submitted_at ? <span>Sendt {formatDateTime(submission.submitted_at)}</span> : null}
          </span>
        }
        actions={
          <>
            <ButtonLink href={`/admin/traeningsplaner/ny?medlem=${submission.user_id}`}>Lav træningsplan</ButtonLink>
            <ButtonLink href={`/beskeder/ny?til=${submission.user_id}`} variant="secondary">
              Send besked
            </ButtonLink>
          </>
        }
      />

      {submission.status === "draft" ? (
        <Alert tone="info" title="Skemaet er ikke sendt endnu">
          {name} er i gang med at udfylde skemaet. Svarene herunder kan stadig ændre sig.
        </Alert>
      ) : null}

      {submission.status === "submitted" ? (
        <div className="rounded-lg border border-line bg-surface p-5">
          <ActionForm action={markSubmissionReviewed} hidden={{ id: submission.id }} pendingText="Gemmer…">
            <p>Når du har læst svarene, kan du markere skemaet som gennemgået. Det ser kun du.</p>
            <SubmitButton>Markér som gennemgået</SubmitButton>
          </ActionForm>
        </div>
      ) : null}

      {submission.status === "reviewed" ? (
        <Alert tone="success" title="Gennemgået">
          {submission.reviewed_at ? `Markeret som gennemgået ${formatDate(submission.reviewed_at)}` : "Markeret som gennemgået"}
          {submission.reviewed_by && names.get(submission.reviewed_by) ? ` af ${names.get(submission.reviewed_by)}` : ""}. Hvis {name} ændrer sine svar,
          bliver skemaet sendt til dig igen.
        </Alert>
      ) : null}

      <section aria-labelledby="svar-titel" className="space-y-4">
        <SectionTitle id="svar-titel">Svarene</SectionTitle>
        <AdminAnswersView answers={adminAnswers(submission)} />
      </section>

      <p>
        <Link href={`/admin/medlemmer/${submission.user_id}`} className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4">
          Gå til medlemssiden for {name}
        </Link>
      </p>
    </div>
  );
}
