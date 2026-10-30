import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { requireViewer, type Viewer } from "@/lib/auth";
import { firstName, formatDate, formatMessageTime } from "@/lib/format";
import { getSiteSettings, type SiteSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { excerpt, safeInternalLink } from "@/lib/training/display";
import { copenhagenWeek, countWorkouts, nextSuggestedSession } from "@/lib/training/week";
import { REVIEW_STEP, resumeStep, STEP_COUNT } from "@/components/onboarding/steps";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader, Panel, SectionTitle } from "@/components/ui/layout";
import { MembershipBadge } from "@/components/ui/membership-badge";

export const metadata: Metadata = { title: "Hjem" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4">
      {children}
    </Link>
  );
}

function LoadError({ what }: { what: string }) {
  return <p className="text-ink-soft">Vi kunne ikke hente {what} lige nu. Prøv at genindlæse siden.</p>;
}

/** Logged in, but no access: explain the state and offer the one next step. */
function NotEntitled({ viewer, settings, name }: { viewer: Viewer; settings: SiteSettings; name: string }) {
  const state = viewer.membership.state;
  const content =
    state === "pending"
      ? {
          title: "Vi venter på din betaling",
          text: "Vi har endnu ikke fået besked om, at din betaling er gennemført. Det tager som regel kun et øjeblik. Prøv at opdatere siden om lidt.",
          action: { href: "/hjem", label: "Tjek igen" },
          secondary: { href: "/min-profil", label: "Se mit medlemskab" },
        }
      : state === "past_due"
        ? {
            title: "Opdater dit betalingskort",
            text: "Vi kunne ikke gennemføre din seneste betaling, så din adgang er sat på pause. Når betalingen er på plads, får du adgang igen.",
            action: { href: "/min-profil", label: "Opdater dit betalingskort" },
            secondary: null,
          }
        : state === "expired"
          ? {
              title: "Dit medlemskab er udløbet",
              text: `Du er altid velkommen tilbage hos ${settings.business_name}.`,
              action: { href: "/bliv-medlem", label: "Bliv medlem igen" },
              secondary: null,
            }
          : {
              title: "Du har ikke et medlemskab endnu",
              text: `Som medlem får du en personlig træningsplan fra ${settings.coach_name} og adgang til fællesskabet.`,
              action: { href: "/bliv-medlem", label: "Bliv medlem" },
              secondary: null,
            };

  return (
    <>
      <PageHeader title={name ? `Hej ${name}` : "Hej"} />
      <Panel className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold">Dit medlemskab:</span>
          <MembershipBadge state={state} />
        </div>
        <SectionTitle>{content.title}</SectionTitle>
        <p className="max-w-prose text-lg">{content.text}</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <ButtonLink href={content.action.href} size="lg">
            {content.action.label}
          </ButtonLink>
          {content.secondary ? (
            <ButtonLink href={content.secondary.href} variant="secondary" size="lg">
              {content.secondary.label}
            </ButtonLink>
          ) : null}
        </div>
      </Panel>
    </>
  );
}

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireViewer("/hjem");
  const [settings, sp] = await Promise.all([getSiteSettings(), searchParams]);
  const name = firstName(viewer.profile.full_name);
  if (!viewer.isEntitled) return <NotEntitled viewer={viewer} settings={settings} name={name} />;

  const coach = settings.coach_name;
  const week = copenhagenWeek();
  const supabase = await createClient();
  const [onboardingRes, announcementRes, planRes, completionsRes, notificationsRes] = await Promise.all([
    supabase.from("onboarding_submissions").select("status, current_step, submitted_at").eq("user_id", viewer.userId).maybeSingle(),
    supabase
      .from("announcements")
      .select("id, title, body, published_at, is_pinned, is_important")
      .eq("status", "published")
      .lte("published_at", new Date().toISOString())
      .order("is_pinned", { ascending: false })
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("training_plans")
      .select("id, title, goal, updated_at, training_sessions(id, title, day_label, position, created_at)")
      .eq("member_id", viewer.userId)
      .eq("status", "published")
      .maybeSingle(),
    supabase
      .from("workout_completions")
      .select("session_id, completed_on")
      .eq("member_id", viewer.userId)
      .gte("completed_on", week.start)
      .lte("completed_on", week.end),
    supabase
      .from("notifications")
      .select("id, title, body, link, created_at, read_at")
      .eq("user_id", viewer.userId)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const onboarding = onboardingRes.data;
  const onboardingSent = onboarding?.status === "submitted" || onboarding?.status === "reviewed";
  const plan = planRes.data;
  const sessions = plan?.training_sessions ?? [];
  const completions = completionsRes.data ?? [];
  const next = plan ? nextSuggestedSession(sessions, completions, week) : null;
  const planSessionIds = new Set(sessions.map((s) => s.id));
  const doneThisWeek = completions.filter((c) => planSessionIds.has(c.session_id)).length;
  const announcement = announcementRes.data;
  const notifications = notificationsRes.data ?? [];
  const summary = viewer.membership;
  const canMessageCoach = Boolean(settings.coach_user_id) && settings.coach_user_id !== viewer.userId;

  return (
    <>
      <PageHeader title={name ? `Hej ${name}` : "Hej"} description="Godt at se dig. Her er det vigtigste lige nu." />

      <div className="space-y-10">
        {sp.onboarding === "gemt" ? (
          <Alert tone="success" title="Dine svar er gemt">
            Du kan fortsætte spørgeskemaet, hvor du slap, når det passer dig.
          </Alert>
        ) : null}

        {summary.state === "past_due_grace" ? (
          <Alert tone="warning" title="Din seneste betaling gik ikke igennem">
            <p>
              Du har stadig adgang{summary.grace_until ? ` indtil ${formatDate(summary.grace_until)}` : ""}. Opdater dit betalingskort, så du
              ikke mister adgangen.
            </p>
            <TextLink href="/min-profil">Opdater dit betalingskort</TextLink>
          </Alert>
        ) : null}
        {summary.state === "canceling" ? (
          <Alert tone="info" title="Dit medlemskab er opsagt">
            Du har adgang{summary.access_until ? ` til og med ${formatDate(summary.access_until)}` : " resten af perioden"}. Du kan genoptage det
            under <TextLink href="/min-profil">Min profil</TextLink>.
          </Alert>
        ) : null}

        {/* 1. The questionnaire comes first until it has been sent (the coach gets a shortcut instead). */}
        {viewer.isAdmin ? (
          <Panel className="space-y-3">
            <SectionTitle>Administration</SectionTitle>
            <p className="max-w-prose">Medlemmernes spørgeskemaer, træningsplaner, opslag og indstillinger finder du under Administration.</p>
            <ButtonLink href="/admin" size="lg">
              Gå til administration
            </ButtonLink>
          </Panel>
        ) : onboardingRes.error ? (
          <LoadError what="dit spørgeskema" />
        ) : !onboardingSent ? (
          <section aria-labelledby="onboarding-title" className="space-y-3 rounded-lg border-2 border-brand bg-brand-soft p-5 sm:p-6">
            {!onboarding ? (
              <>
                <h2 id="onboarding-title" className="text-2xl font-semibold">
                  Udfyld dit spørgeskema
                </h2>
                <p className="max-w-prose text-lg">
                  Fortæl {coach} om dine mål, din hverdag og din erfaring, så han kan lave din personlige træningsplan. Du kan gemme
                  undervejs og fortsætte senere.
                </p>
                <ButtonLink href="/onboarding" size="lg">
                  Udfyld spørgeskemaet
                </ButtonLink>
              </>
            ) : onboarding.submitted_at ? (
              <>
                <h2 id="onboarding-title" className="text-2xl font-semibold">
                  Du er ved at rette dine svar
                </h2>
                <p className="max-w-prose text-lg">Dine ændringer sendes først til {coach}, når du trykker Send igen.</p>
                <ButtonLink href={`/onboarding?trin=${REVIEW_STEP}`} size="lg">
                  Gå til dine svar
                </ButtonLink>
              </>
            ) : (
              <>
                <h2 id="onboarding-title" className="text-2xl font-semibold">
                  Fortsæt hvor du slap
                </h2>
                <p className="max-w-prose text-lg">
                  Du er nået til trin {resumeStep(onboarding.current_step)} af {STEP_COUNT} i spørgeskemaet. Dine svar indtil nu er gemt.
                </p>
                <ButtonLink href={`/onboarding?trin=${resumeStep(onboarding.current_step)}`} size="lg">
                  Fortsæt spørgeskemaet
                </ButtonLink>
              </>
            )}
          </section>
        ) : null}

        {/* 2. Training: the next workout is the most useful thing to show. */}
        {viewer.isAdmin && !plan ? null : (
          <section aria-labelledby="training-title" className="space-y-4">
            <SectionTitle id="training-title">Din træning</SectionTitle>
            {planRes.error ? (
              <LoadError what="din træningsplan" />
            ) : plan ? (
              <Panel className="space-y-5">
                <div className="space-y-1">
                  <p className="text-xl font-semibold">{plan.title}</p>
                  {plan.goal?.trim() ? <p className="max-w-prose">{excerpt(plan.goal, 200)}</p> : null}
                  <p className="text-ink-soft">
                    {countWorkouts(sessions.length)} i planen · Senest opdateret {formatDate(plan.updated_at)}
                  </p>
                </div>
                {sessions.length === 0 ? (
                  <p>{coach} er ved at lægge træningerne ind i din plan.</p>
                ) : next ? (
                  <div className="space-y-3 border-t border-line pt-5">
                    <p className="font-semibold text-ink-soft">Næste træning</p>
                    <p className="text-xl font-semibold">
                      {next.title}
                      {next.day_label?.trim() ? <span className="font-normal text-ink-soft"> · {next.day_label}</span> : null}
                    </p>
                    {!completionsRes.error ? (
                      <p className="text-ink-soft">I denne uge har du gennemført {countWorkouts(doneThisWeek)}.</p>
                    ) : null}
                    <ButtonLink href={`/min-traening#session-${next.id}`} size="lg">
                      Gå til træningen
                    </ButtonLink>
                  </div>
                ) : (
                  <div className="space-y-3 border-t border-line pt-5">
                    <p className="text-lg font-semibold">Du har gennemført alle træningerne i planen i denne uge. Flot klaret!</p>
                    <ButtonLink href="/min-traening" variant="secondary" size="lg">
                      Se din plan
                    </ButtonLink>
                  </div>
                )}
              </Panel>
            ) : onboardingSent ? (
              <Panel>
                <p className="text-xl font-semibold">{coach} arbejder på din plan</p>
                <p className="mt-1 max-w-prose">Du får en notifikation, så snart din personlige træningsplan er klar.</p>
              </Panel>
            ) : (
              <Panel>
                <p className="max-w-prose">Når du har sendt spørgeskemaet, laver {coach} din personlige træningsplan. Den kommer til at ligge her.</p>
              </Panel>
            )}
          </section>
        )}

        {/* 3. Latest announcement from the coach. */}
        <section aria-labelledby="announcement-title" className="space-y-4">
          <SectionTitle id="announcement-title">Seneste opslag fra {coach}</SectionTitle>
          {announcementRes.error ? (
            <LoadError what="opslagene" />
          ) : announcement ? (
            <Panel as="article" className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {announcement.is_pinned ? <Badge tone="brand">Fastgjort</Badge> : null}
                {announcement.is_important ? <Badge tone="warning">Vigtigt</Badge> : null}
                {announcement.published_at ? (
                  <span className="text-ink-soft">{formatDate(announcement.published_at)}</span>
                ) : null}
              </div>
              <h3 className="text-xl font-semibold">
                <Link href={`/opslag/${announcement.id}`} className="text-ink underline-offset-4 hover:underline">
                  {announcement.title}
                </Link>
              </h3>
              {announcement.body.trim() ? <p className="max-w-prose">{excerpt(announcement.body)}</p> : null}
              <div className="flex flex-wrap gap-x-6">
                <TextLink href={`/opslag/${announcement.id}`}>
                  Læs hele opslaget<span className="sr-only">: {announcement.title}</span>
                </TextLink>
                <TextLink href="/opslag">Se alle opslag</TextLink>
              </div>
            </Panel>
          ) : (
            <p className="text-ink-soft">{coach} har ikke skrevet nogen opslag endnu.</p>
          )}
        </section>

        {/* 4. Latest notifications. */}
        <section aria-labelledby="notifications-title" className="space-y-4">
          <SectionTitle id="notifications-title">Seneste notifikationer</SectionTitle>
          {notificationsRes.error ? (
            <LoadError what="dine notifikationer" />
          ) : notifications.length === 0 ? (
            <p className="text-ink-soft">Du har ingen notifikationer endnu.</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
              {notifications.map((n) => {
                const href = safeInternalLink(n.link);
                return (
                  <li key={n.id} className="space-y-1 px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {!n.read_at ? <Badge tone="info">Ny</Badge> : null}
                      <span className="text-ink-soft">{formatMessageTime(n.created_at)}</span>
                    </div>
                    <p className="font-semibold">
                      {href ? (
                        <Link href={href} className="text-ink underline underline-offset-4">
                          {n.title}
                        </Link>
                      ) : (
                        n.title
                      )}
                    </p>
                    {n.body?.trim() ? <p className="text-ink-soft">{n.body}</p> : null}
                  </li>
                );
              })}
            </ul>
          )}
          <TextLink href="/notifikationer">Se alle notifikationer</TextLink>
        </section>

        {/* 5. Shortcuts. */}
        <nav aria-labelledby="shortcuts-title" className="space-y-4">
          <SectionTitle id="shortcuts-title">Genveje</SectionTitle>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <ButtonLink href="/min-traening" variant="secondary" size="lg">
              Min træning
            </ButtonLink>
            <ButtonLink href="/faellesskab" variant="secondary" size="lg">
              Fællesskab
            </ButtonLink>
            {canMessageCoach ? (
              <ButtonLink href={`/beskeder/ny?til=${encodeURIComponent(settings.coach_user_id ?? "")}`} variant="secondary" size="lg">
                Skriv til {coach}
              </ButtonLink>
            ) : null}
          </div>
        </nav>
      </div>
    </>
  );
}
