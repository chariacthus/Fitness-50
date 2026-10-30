import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime, formatMessageTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { firstParam, isUuid } from "@/lib/admin/forms";
import { MODERATION_ACTION, REPORT_STATUS, REPORT_TARGET } from "@/lib/admin/labels";
import { genitive, memberDisplayName } from "@/lib/admin/members";
import { loadNames } from "@/lib/admin/queries";
import { ActionForm, FormTextarea } from "@/components/admin/action-form";
import { MemberLink } from "@/components/admin/member-link";
import { SuspensionForm } from "@/components/admin/suspension-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { closeReport, moderateMessage, suspendFromReport } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Anmeldelser" };

type Report = {
  id: string;
  reporter_id: string | null;
  target_type: string;
  target_id: string;
  target_user_id: string | null;
  reason: string;
  snapshot: string | null;
  status: string;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
};

type MessageState = { hidden_at: string | null; deleted_at: string | null; hidden_reason: string | null };

const summaryClass = "flex min-h-12 cursor-pointer items-center rounded-md px-3 font-semibold text-brand hover:bg-brand-soft";

function MessageModeration({ report, message }: { report: Report; message: MessageState | undefined }) {
  if (report.target_type !== "community_message") return null;
  if (!message) return <p className="text-ink-soft">Beskeden findes ikke længere i fællesskabet.</p>;
  if (message.deleted_at) return <p className="text-ink-soft">Forfatteren har selv slettet beskeden.</p>;
  if (message.hidden_at) {
    return (
      <div className="space-y-3">
        <p>
          <Badge tone="warning">Skjult i fællesskabet</Badge>
          {message.hidden_reason ? <span className="ml-2">Begrundelse: {message.hidden_reason}</span> : null}
        </p>
        <ActionForm action={moderateMessage} hidden={{ message_id: report.target_id, hide: "false" }} pendingText="Viser beskeden igen…">
          <ConfirmButton
            variant="primary"
            triggerVariant="secondary"
            title="Vis beskeden igen?"
            description="Beskeden bliver synlig for alle i fællesskabet igen."
            confirmLabel="Ja, vis beskeden"
          >
            Vis beskeden igen
          </ConfirmButton>
        </ActionForm>
      </div>
    );
  }
  return (
    <ActionForm action={moderateMessage} hidden={{ message_id: report.target_id, hide: "true" }} pendingText="Skjuler beskeden…">
      <p>
        <Badge tone="info">Synlig i fællesskabet</Badge>
      </p>
      <FormTextarea name="reason" label="Begrundelse for at skjule" optional rows={2} maxLength={1000} hint="Gemmes i moderationsloggen." />
      <ConfirmButton title="Skjul beskeden?" description="Beskeden forsvinder fra fællesskabet for alle medlemmer. Du kan vise den igen senere." confirmLabel="Ja, skjul beskeden">
        Skjul beskeden
      </ConfirmButton>
    </ActionForm>
  );
}

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin("/admin/rapporter");
  const params = await searchParams;
  const memberParam = firstParam(params.medlem);
  const memberFilter = isUuid(memberParam) ? memberParam : null;
  const closedParam = firstParam(params.afsluttet);
  const supabase = await createClient();

  const base = () => {
    const q = supabase
      .from("reports")
      .select("id, reporter_id, target_type, target_id, target_user_id, reason, snapshot, status, resolved_by, resolved_at, resolution_note, created_at");
    return memberFilter ? q.eq("target_user_id", memberFilter) : q;
  };
  let historyQuery = supabase
    .from("moderation_actions")
    .select("id, admin_id, action, target_user_id, reason, created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  if (memberFilter) historyQuery = historyQuery.eq("target_user_id", memberFilter);

  const [openRes, closedRes, historyRes] = await Promise.all([
    base().eq("status", "open").order("created_at", { ascending: false }).limit(200),
    base().neq("status", "open").order("resolved_at", { ascending: false, nullsFirst: false }).limit(30),
    historyQuery,
  ]);
  const open: Report[] = openRes.data ?? [];
  const closed: Report[] = closedRes.data ?? [];
  const history = historyRes.data ?? [];
  const all = [...open, ...closed];

  const messageIds = [...new Set(all.filter((r) => r.target_type === "community_message").map((r) => r.target_id))];
  const targetUsers = [...new Set(all.map((r) => r.target_user_id).filter((id): id is string => Boolean(id)))];
  const [names, messagesRes, profilesRes, rolesRes] = await Promise.all([
    loadNames(supabase, [
      ...all.flatMap((r) => [r.reporter_id, r.target_user_id, r.resolved_by]),
      ...history.flatMap((h) => [h.admin_id, h.target_user_id]),
      memberFilter,
    ]),
    messageIds.length
      ? supabase.from("community_messages").select("id, hidden_at, deleted_at, hidden_reason").in("id", messageIds)
      : Promise.resolve({ data: [] as (MessageState & { id: string })[] }),
    targetUsers.length
      ? supabase.from("profiles").select("id, community_suspended").in("id", targetUsers)
      : Promise.resolve({ data: [] as { id: string; community_suspended: boolean }[] }),
    targetUsers.length
      ? supabase.from("user_roles").select("user_id").eq("role", "admin").in("user_id", targetUsers)
      : Promise.resolve({ data: [] as { user_id: string }[] }),
  ]);
  const messages = new Map((messagesRes.data ?? []).map((m) => [m.id, m]));
  const suspended = new Map((profilesRes.data ?? []).map((p) => [p.id, p.community_suspended]));
  const admins = new Set((rolesRes.data ?? []).map((r) => r.user_id));
  const loadFailed = openRes.error || closedRes.error;
  const justClosed = isUuid(closedParam) ? closed.find((r) => r.id === closedParam) : undefined;

  function reportCard(report: Report) {
    const status = REPORT_STATUS[report.status] ?? REPORT_STATUS.open;
    const isOpen = report.status === "open";
    const targetName = memberDisplayName(report.target_user_id ? names.get(report.target_user_id) : null, "Medlemmet");
    const canSuspend = Boolean(report.target_user_id && !admins.has(report.target_user_id) && suspended.has(report.target_user_id));
    return (
      <article key={report.id} aria-labelledby={`rapport-${report.id}`} className="space-y-4 rounded-lg border border-line bg-surface p-5 sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 id={`rapport-${report.id}`} className="text-xl font-semibold">
              {REPORT_TARGET[report.target_type] ?? "Indhold"}
            </h3>
            <p className="text-ink-soft">Anmeldt {formatDateTime(report.created_at)}</p>
          </div>
          <Badge tone={status.tone}>{status.label}</Badge>
        </header>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-ink-soft">Anmeldt af</dt>
            <dd>
              <MemberLink id={report.reporter_id} name={report.reporter_id ? names.get(report.reporter_id) : null} fallback="Ukendt (kontoen er slettet)" />
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink-soft">Anmeldt medlem</dt>
            <dd>
              <MemberLink id={report.target_user_id} name={report.target_user_id ? names.get(report.target_user_id) : null} fallback="Ukendt" />
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-semibold text-ink-soft">Begrundelse</dt>
            <dd className="whitespace-pre-line">{report.reason}</dd>
          </div>
        </dl>
        <section aria-labelledby={`indhold-${report.id}`} className="space-y-2">
          <h4 id={`indhold-${report.id}`} className="font-semibold">
            Indhold på anmeldelsestidspunktet
          </h4>
          <blockquote className="whitespace-pre-line rounded-md border-l-4 border-line-strong bg-muted px-4 py-3">
            {report.snapshot?.trim() ? report.snapshot : "Der blev ikke gemt noget tekstindhold."}
          </blockquote>
        </section>

        <MessageModeration report={report} message={messages.get(report.target_id)} />

        {!isOpen ? (
          <p className="text-ink-soft">
            {status.label}
            {report.resolved_at ? ` ${formatDateTime(report.resolved_at)}` : ""}
            {report.resolved_by && names.get(report.resolved_by) ? ` af ${names.get(report.resolved_by)}` : ""}
            {report.resolution_note ? `. Note: ${report.resolution_note}` : ""}
          </p>
        ) : null}

        {canSuspend && report.target_user_id ? (
          <details className="rounded-md border border-line">
            <summary className={summaryClass}>
              {suspended.get(report.target_user_id) ? `Genåbn ${genitive(targetName)} adgang til fællesskabet` : `Sæt ${genitive(targetName)} adgang til fællesskabet på pause`}
            </summary>
            <div className="p-4">
              <SuspensionForm
                action={suspendFromReport}
                userId={report.target_user_id}
                name={targetName}
                suspended={Boolean(suspended.get(report.target_user_id))}
              />
            </div>
          </details>
        ) : null}

        {isOpen ? (
          <ActionForm action={closeReport} hidden={{ report_id: report.id, medlem: memberFilter ?? "" }} pendingText="Gemmer…" className="space-y-4 border-t border-line pt-4">
            <FormTextarea name="note" label="Note" optional rows={2} maxLength={1000} hint="F.eks. hvad du har gjort. Gemmes i loggen." />
            <div className="flex flex-wrap gap-3">
              <SubmitButton name="status" value="resolved">
                Markér som løst
              </SubmitButton>
              <SubmitButton name="status" value="dismissed" variant="secondary">
                Afvis anmeldelsen
              </SubmitButton>
            </div>
          </ActionForm>
        ) : null}
      </article>
    );
  }

  const filterName = memberFilter ? memberDisplayName(names.get(memberFilter)) : null;

  return (
    <div className="space-y-10">
      <PageHeader
        title={filterName ? `Anmeldelser af ${filterName}` : "Anmeldelser"}
        back={memberFilter ? { href: `/admin/medlemmer/${memberFilter}`, label: `Tilbage til ${filterName}` } : undefined}
        description="Indhold, som medlemmerne har anmeldt. Åbne anmeldelser vises først."
        actions={
          memberFilter ? (
            <ButtonLink href="/admin/rapporter" variant="secondary">
              Vis alle anmeldelser
            </ButtonLink>
          ) : undefined
        }
      />

      {justClosed ? (
        <Alert tone="success" title={null}>
          {justClosed.status === "resolved" ? "Anmeldelsen er markeret som løst." : "Anmeldelsen er afvist."} Den står nu under Afsluttede anmeldelser.
        </Alert>
      ) : null}

      <Alert tone="info" title="Om private beskeder">
        Private beskeder kan kun læses af dem, der skriver sammen. En privat besked vises kun her, hvis en af deltagerne har anmeldt den – og kun som en
        kopi af den anmeldte besked.
      </Alert>

      {loadFailed ? <Alert tone="danger">Anmeldelserne kunne ikke hentes lige nu. Genindlæs siden om lidt.</Alert> : null}

      <section aria-labelledby="aabne-titel" className="space-y-4">
        <SectionTitle id="aabne-titel">Åbne anmeldelser ({open.length})</SectionTitle>
        {open.length === 0 && !loadFailed ? (
          <EmptyState title="Ingen åbne anmeldelser">Når et medlem anmelder noget, vises det her, og du får en notifikation.</EmptyState>
        ) : (
          open.map(reportCard)
        )}
      </section>

      {closed.length > 0 ? (
        <section aria-labelledby="afsluttede-titel" className="space-y-4">
          <SectionTitle id="afsluttede-titel">Afsluttede anmeldelser</SectionTitle>
          {closed.map(reportCard)}
        </section>
      ) : null}

      <section aria-labelledby="historik-titel" className="space-y-4">
        <SectionTitle id="historik-titel">Moderationslog</SectionTitle>
        {historyRes.error ? (
          <Alert tone="danger">Loggen kunne ikke hentes lige nu.</Alert>
        ) : history.length === 0 ? (
          <p className="text-ink-soft">Der er ikke registreret nogen moderationshandlinger endnu.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {history.map((h) => (
              <li key={h.id} className="space-y-1 px-5 py-4">
                <p>
                  <span className="font-semibold">{memberDisplayName(h.admin_id ? names.get(h.admin_id) : null, "En administrator")}</span>{" "}
                  {(MODERATION_ACTION[h.action] ?? h.action).toLowerCase()}
                  {h.target_user_id ? (
                    <>
                      {" – "}
                      <MemberLink id={h.target_user_id} name={names.get(h.target_user_id)} />
                    </>
                  ) : null}
                </p>
                {h.reason ? <p className="whitespace-pre-line">Begrundelse: {h.reason}</p> : null}
                <p className="text-ink-soft">{formatMessageTime(h.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
