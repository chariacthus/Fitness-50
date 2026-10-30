import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime, formatShortDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { SUBMISSION_STATUS } from "@/lib/admin/labels";
import { memberDisplayName } from "@/lib/admin/members";
import { loadNames } from "@/lib/admin/queries";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/layout";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Onboarding" };

type Row = { id: string; user_id: string; status: string; submitted_at: string | null; reviewed_at: string | null; updated_at: string };

function SubmissionList({ rows, names, empty }: { rows: Row[]; names: Map<string, string>; empty: string }) {
  if (rows.length === 0) return <p className="text-ink-soft">{empty}</p>;
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
      {rows.map((r) => {
        const status = SUBMISSION_STATUS[r.status] ?? SUBMISSION_STATUS.submitted;
        return (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="space-y-1">
              <Link href={`/admin/onboarding/${r.id}`} className="text-lg font-semibold text-brand underline underline-offset-4">
                {memberDisplayName(names.get(r.user_id))}
              </Link>
              <p className="text-ink-soft">
                {r.submitted_at ? `Sendt ${formatDateTime(r.submitted_at)}` : `Senest ændret ${formatShortDate(r.updated_at)}`}
                {r.reviewed_at ? ` · Gennemgået ${formatShortDate(r.reviewed_at)}` : ""}
              </p>
            </div>
            <Badge tone={status.tone}>{status.label}</Badge>
          </li>
        );
      })}
    </ul>
  );
}

export default async function AdminOnboardingPage() {
  await requireAdmin("/admin/onboarding");
  const supabase = await createClient();

  const [sentRes, draftsRes] = await Promise.all([
    supabase
      .from("onboarding_submissions")
      .select("id, user_id, status, submitted_at, reviewed_at, updated_at")
      .in("status", ["submitted", "reviewed"])
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .limit(300),
    supabase.from("onboarding_submissions").select("id", { count: "exact", head: true }).eq("status", "draft"),
  ]);

  const rows = sentRes.data ?? [];
  const names = await loadNames(
    supabase,
    rows.map((r) => r.user_id),
  );
  const newRows = rows.filter((r) => r.status === "submitted");
  const reviewedRows = rows.filter((r) => r.status === "reviewed");
  const drafts = draftsRes.count ?? 0;

  return (
    <div className="space-y-10">
      <PageHeader
        title="Onboarding"
        description="Skemaer, som medlemmerne har udfyldt. Gennemgå de nye, og lav en træningsplan ud fra svarene."
      />

      {sentRes.error ? <Alert tone="danger">Skemaerne kunne ikke hentes lige nu. Genindlæs siden om lidt.</Alert> : null}

      {!sentRes.error && rows.length === 0 ? (
        <EmptyState title="Ingen udfyldte skemaer endnu">Når et medlem sender sit onboardingskema, vises det her, og du får en notifikation.</EmptyState>
      ) : null}

      {rows.length > 0 ? (
        <>
          <section aria-labelledby="nye-titel" className="space-y-4">
            <SectionTitle id="nye-titel">Nye – ikke gennemgået ({newRows.length})</SectionTitle>
            <SubmissionList rows={newRows} names={names} empty="Du har gennemgået alle skemaer." />
          </section>
          <section aria-labelledby="gennemgaaede-titel" className="space-y-4">
            <SectionTitle id="gennemgaaede-titel">Gennemgået ({reviewedRows.length})</SectionTitle>
            <SubmissionList rows={reviewedRows} names={names} empty="Ingen skemaer er markeret som gennemgået endnu." />
          </section>
        </>
      ) : null}

      <p className="rounded-lg border border-line bg-surface px-5 py-4">
        {draftsRes.error
          ? "Antallet af påbegyndte skemaer kunne ikke hentes."
          : drafts === 0
            ? "Ingen medlemmer er i gang med et skema, de ikke har sendt."
            : `${drafts === 1 ? "1 medlem har" : `${drafts} medlemmer har`} påbegyndt skemaet uden at sende det endnu.`}
      </p>
    </div>
  );
}
