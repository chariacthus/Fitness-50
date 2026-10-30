import type { Metadata } from "next";
import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { getSiteSettings } from "@/lib/settings";
import { signedUrls } from "@/lib/storage-server";
import { createClient } from "@/lib/supabase/server";
import { coachConversationHref } from "@/lib/messages/links";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/layout";
import { ConversationList } from "@/components/messages/conversation-list";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Beskeder" };

export default async function MessagesPage() {
  const viewer = await requireViewer("/beskeder");
  const supabase = await createClient();
  const [settings, { data, error }] = await Promise.all([getSiteSettings(), supabase.rpc("my_conversations")]);

  const rows = data ?? [];
  const avatarUrls = await signedUrls(supabase, "avatars", rows.map((r) => r.other_avatar_path));
  const canWrite = viewer.isEntitled || viewer.isAdmin;
  const coachHref = canWrite ? coachConversationHref(settings.coach_user_id, viewer.userId) : null;

  return (
    <>
      <PageHeader
        title="Beskeder"
        description={`Private beskeder mellem dig og ${settings.coach_name} eller et andet medlem. Andre medlemmer kan ikke se dem.`}
        actions={
          coachHref ? (
            <ButtonLink href={coachHref} size="lg">
              Skriv til {settings.coach_name}
            </ButtonLink>
          ) : null
        }
      />

      <div className="space-y-8">
        {!canWrite ? (
          <Alert tone="info" title="Private beskeder kræver et aktivt medlemskab">
            <p>Når du er medlem, kan du skrive til {settings.coach_name} og til de andre medlemmer.</p>
            <p className="mt-3">
              <Link href="/bliv-medlem" className="font-semibold text-brand underline underline-offset-4">
                Se medlemskabet
              </Link>
            </p>
          </Alert>
        ) : null}

        <section aria-labelledby="samtaler" className="space-y-4">
          <SectionTitle id="samtaler">Dine samtaler</SectionTitle>
          {error ? (
            <Alert tone="danger" title="Samtalerne kunne ikke hentes">
              Prøv at genindlæse siden om et øjeblik.
            </Alert>
          ) : rows.length === 0 ? (
            <EmptyState
              title="Du har ingen samtaler endnu"
              action={
                coachHref ? (
                  <ButtonLink href={coachHref} variant="secondary">
                    Skriv til {settings.coach_name}
                  </ButtonLink>
                ) : null
              }
            >
              {canWrite
                ? `Skriv til ${settings.coach_name}, hvis du har spørgsmål om din træning. Svar og nye beskeder vises her.`
                : "Her vises dine samtaler, når du har et aktivt medlemskab."}
            </EmptyState>
          ) : (
            <ConversationList rows={rows} viewerId={viewer.userId} avatarUrls={avatarUrls} coachBadgeLabel={settings.coach_badge_label} />
          )}
        </section>

        {canWrite ? (
          <section aria-labelledby="skriv-til-medlem" className="space-y-2">
            <h2 id="skriv-til-medlem" className="text-xl font-semibold">
              Vil du skrive til et andet medlem?
            </h2>
            <p className="max-w-prose text-ink-soft">
              Gå til{" "}
              <Link href="/faellesskab" className="font-semibold text-brand underline underline-offset-4">
                Fællesskab
              </Link>
              , og tryk på medlemmets navn ved en af beskederne. På profilen trykker du på “Send besked”.
            </p>
          </section>
        ) : null}
      </div>
    </>
  );
}
