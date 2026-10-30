import type { Metadata } from "next";
import Link from "next/link";
import { requireViewer, type Viewer } from "@/lib/auth";
import { getSiteSettings, type SiteSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { loadCommunityFeed } from "@/lib/community/server";
import { coachConversationHref } from "@/lib/messages/links";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader, Panel, SectionTitle } from "@/components/ui/layout";
import { CommunityChat } from "@/components/community/community-chat";
import { reportCommunityMessage } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Fællesskab" };

/** Shown when can_use_community() is false. */
function NoAccess({ viewer, settings }: { viewer: Viewer; settings: SiteSettings }) {
  const suspended = viewer.isEntitled && viewer.profile.community_suspended;
  const coachHref = coachConversationHref(settings.coach_user_id, viewer.userId);

  return (
    <>
      <PageHeader title="Fællesskab" />
      <Panel className="space-y-4">
        {suspended ? (
          <>
            <SectionTitle>Din adgang til fællesskabet er sat på pause</SectionTitle>
            <p className="max-w-prose text-lg">
              Du kan ikke læse eller skrive i fællesskabet lige nu. Din træning og dine beskeder til{" "}
              {settings.coach_name} fungerer som normalt. Skriv til {settings.coach_name}, hvis du har spørgsmål.
            </p>
            <ButtonLink href={coachHref ?? "/kontakt"} size="lg">
              Skriv til {settings.coach_name}
            </ButtonLink>
          </>
        ) : (
          <>
            <SectionTitle>Fællesskabet er for medlemmer</SectionTitle>
            <p className="max-w-prose text-lg">
              Som medlem af {settings.business_name} kan du skrive med de andre medlemmer og med {settings.coach_name},
              dele erfaringer og stille spørgsmål. Det kræver et aktivt medlemskab.
            </p>
            <ButtonLink href="/bliv-medlem" size="lg">
              Se medlemskabet
            </ButtonLink>
          </>
        )}
      </Panel>
    </>
  );
}

function Guidelines({ settings, coachHref }: { settings: SiteSettings; coachHref: string | null }) {
  return (
    <section aria-labelledby="gode-raad" className="space-y-3 border-t border-line pt-8">
      <h2 id="gode-raad" className="text-xl font-semibold">
        Gode råd i fællesskabet
      </h2>
      <ul className="list-disc space-y-2 pl-6 text-ink-soft">
        <li>Vær venlig og respektfuld. Vi er her for at støtte hinanden.</li>
        <li>Alle medlemmer kan læse det, du skriver her. Del kun det, du er tryg ved, at andre ser – også om dit helbred.</li>
        <li>
          Personlige spørgsmål om din træning kan du stille direkte til {settings.coach_name}
          {coachHref ? (
            <>
              {" "}
              under{" "}
              <Link href={coachHref} className="font-semibold text-brand underline underline-offset-4">
                Beskeder
              </Link>
            </>
          ) : null}
          .
        </li>
        <li>Ser du noget, der ikke hører hjemme her, så tryk på “Anmeld” under beskeden.</li>
      </ul>
    </section>
  );
}

export default async function CommunityPage() {
  const viewer = await requireViewer("/faellesskab");
  const supabase = await createClient();
  const [settings, { data: canUse }] = await Promise.all([getSiteSettings(), supabase.rpc("can_use_community")]);

  if (!canUse) return <NoAccess viewer={viewer} settings={settings} />;

  const feed = await loadCommunityFeed(supabase, viewer.userId);
  const coachHref = coachConversationHref(settings.coach_user_id, viewer.userId);

  return (
    <>
      <PageHeader
        title="Fællesskab"
        description={`Her mødes medlemmerne og ${settings.coach_name}. Del erfaringer, stil spørgsmål og fortæl om de små sejre.`}
      />
      {feed ? (
        <CommunityChat
          viewerId={viewer.userId}
          coachName={settings.coach_name}
          coachBadgeLabel={settings.coach_badge_label}
          initialMessages={feed.messages}
          initialQuoted={feed.quoted}
          initialAuthors={feed.authors}
          initialImageUrls={feed.imageUrls}
          initialHasMore={feed.hasMore}
          lastReadAt={feed.lastReadAt}
          reportAction={reportCommunityMessage}
        />
      ) : (
        <Alert tone="danger" title="Beskederne kunne ikke hentes">
          Prøv at genindlæse siden om et øjeblik.
        </Alert>
      )}
      <div className="mt-10">
        <Guidelines settings={settings} coachHref={coachHref} />
      </div>
    </>
  );
}
