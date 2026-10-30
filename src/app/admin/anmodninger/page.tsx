import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { DATA_REQUEST_STATUSES, DATA_REQUEST_TYPES, sortDataRequests } from "@/lib/profile/display";
import { InlineActionForm } from "@/components/profile/inline-action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState, PageHeader } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { completeDeletion, markRequestHandled } from "./actions";
import { RejectRequestForm } from "./reject-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Dataanmodninger" };

function outcomeMessage(done: string | undefined, subscriptions: number) {
  if (done === "slettet") {
    const stopped = subscriptions > 0 ? ` ${subscriptions === 1 ? "Abonnementet er" : `${subscriptions} abonnementer er`} stoppet hos Stripe.` : "";
    return { title: "Kontoen er slettet", text: `Medlemmets konto, beskeder og billeder er slettet.${stopped} Betalingsoplysningerne er stadig gemt hos Stripe.` };
  }
  if (done === "allerede-slettet") return { title: "Anmodningen er gennemført", text: "Kontoen var allerede slettet, så anmodningen er blot markeret som gennemført." };
  if (done === "afvist") return { title: "Anmodningen er afvist", text: "Begrundelsen er gemt på anmodningen." };
  if (done === "haandteret") return { title: "Anmodningen er håndteret", text: "Anmodningen er markeret som gennemført." };
  return null;
}

export default async function DataRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin("/admin/anmodninger");
  const sp = await searchParams;
  const outcome = outcomeMessage(typeof sp.udfoert === "string" ? sp.udfoert : undefined, Number(sp.abonnementer) || 0);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("data_requests")
    .select("id, user_id, user_email, type, status, note, handled_by, created_at, completed_at")
    .order("created_at", { ascending: false })
    .limit(300);

  const rows = sortDataRequests(data ?? []);
  const userIds = [...new Set(rows.flatMap((r) => [r.user_id, r.handled_by]).filter((v): v is string => Boolean(v)))];
  const [profilesRes, contactsRes] = userIds.length
    ? await Promise.all([
        supabase.from("profiles").select("id, full_name").in("id", userIds),
        supabase.from("profile_private").select("user_id, email").in("user_id", userIds),
      ])
    : [{ data: [] }, { data: [] }];
  const names = new Map((profilesRes.data ?? []).map((p) => [p.id, p.full_name]));
  const emails = new Map((contactsRes.data ?? []).map((c) => [c.user_id, c.email]));
  const pendingCount = rows.filter((r) => r.status === "pending").length;

  return (
    <div className="max-w-4xl space-y-8">
      <PageHeader
        title="Dataanmodninger"
        description="Medlemmernes anmodninger om sletning af konto og udtræk af data. Medlemmerne henter selv deres data under Min profil – de udtræk står her som gennemførte."
      />

      {outcome ? (
        <Alert tone="success" title={outcome.title}>
          {outcome.text}
        </Alert>
      ) : null}

      {error ? (
        <Alert tone="danger">Anmodningerne kunne ikke hentes lige nu. Genindlæs siden om lidt.</Alert>
      ) : rows.length === 0 ? (
        <EmptyState title="Der er ingen anmodninger">Når et medlem beder om at få slettet sin konto, kan du se det her.</EmptyState>
      ) : (
        <>
          <p className="text-lg">{pendingCount === 0 ? "Der er ingen anmodninger, der venter." : `${pendingCount} ${pendingCount === 1 ? "anmodning venter" : "anmodninger venter"} på dig.`}</p>
          <ul className="space-y-4">
            {rows.map((r) => {
              const status = DATA_REQUEST_STATUSES[r.status] ?? { label: r.status, tone: "neutral" as const };
              const type = DATA_REQUEST_TYPES[r.type] ?? r.type;
              const memberName = (r.user_id && names.get(r.user_id)) || null;
              const email = r.user_email || (r.user_id ? emails.get(r.user_id) : null) || null;
              const who = memberName || email || (r.user_id ? "Medlem uden navn" : "Slettet konto");
              const handler = r.handled_by ? names.get(r.handled_by) || "en administrator" : null;
              const pending = r.status === "pending";
              return (
                <li key={r.id}>
                  <article className={`space-y-4 rounded-lg border bg-surface p-5 ${pending ? "border-2 border-warning" : "border-line"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h2 className="text-xl font-semibold">{type}</h2>
                        <p>
                          <span className="font-semibold">{who}</span>
                          {memberName && email ? <span className="text-ink-soft"> · {email}</span> : null}
                        </p>
                        <p className="text-ink-soft">Modtaget {formatDateTime(r.created_at)}</p>
                        {r.completed_at && !pending ? (
                          <p className="text-ink-soft">
                            Behandlet {formatDateTime(r.completed_at)}
                            {handler ? ` af ${handler}` : ""}
                          </p>
                        ) : null}
                        {pending && handler ? <p className="text-ink-soft">Sletningen er sat i gang af {handler}.</p> : null}
                        {r.note ? <p className="text-ink-soft">Begrundelse: {r.note}</p> : null}
                      </div>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </div>

                    {pending && r.type === "deletion" ? (
                      <div className="grid gap-6 border-t border-line pt-4 md:grid-cols-2">
                        <InlineActionForm action={completeDeletion} hidden={{ id: r.id }} pendingText="Sletter kontoen – vent venligst…">
                          <p className="text-ink-soft">
                            Stopper medlemmets abonnement hos Stripe med det samme, sletter billeder og beskeder og derefter hele kontoen.
                          </p>
                          <ConfirmButton
                            title="Slet kontoen for altid?"
                            description={
                              <div className="space-y-2">
                                <p>
                                  Kontoen tilhører <span className="font-semibold text-ink">{who}</span>.{" "}
                                  <span className="font-semibold text-danger">Det kan ikke fortrydes.</span>
                                </p>
                                <p>
                                  Abonnementet stoppes med det samme uden refusion. Profil, spørgeskema, helbredsoplysninger, træningsplaner,
                                  kostplaner, beskeder, notifikationer og billeder slettes. Betalingsoplysningerne bliver gemt hos Stripe.
                                </p>
                              </div>
                            }
                            confirmLabel="Ja, slet kontoen"
                            triggerVariant="danger"
                          >
                            Gennemfør sletning
                          </ConfirmButton>
                        </InlineActionForm>
                        <RejectRequestForm id={r.id} />
                      </div>
                    ) : null}

                    {pending && r.type === "export" ? (
                      <div className="border-t border-line pt-4">
                        <InlineActionForm action={markRequestHandled} hidden={{ id: r.id }} pendingText="Gemmer…">
                          <SubmitButton variant="secondary" pendingText="Gemmer…">
                            Markér som håndteret
                          </SubmitButton>
                        </InlineActionForm>
                      </div>
                    ) : null}
                  </article>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
