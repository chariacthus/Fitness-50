import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { getSiteSettings } from "@/lib/settings";
import { signedUrl } from "@/lib/storage-server";
import { createClient } from "@/lib/supabase/server";
import { newConversationHref } from "@/lib/messages/links";
import { displayName } from "@/lib/messages/text";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { CoachBadge } from "@/components/ui/coach-badge";
import { BackLink, Panel } from "@/components/ui/layout";
import { ReportButton } from "@/components/community/report-dialog";
import { reportProfile } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Medlemsprofil" };

type Params = Promise<{ id: string }>;

export default async function MemberProfilePage({ params }: { params: Params }) {
  const { id } = await params;
  const viewer = await requireViewer(`/medlemmer/${encodeURIComponent(id)}`);
  if (!z.guid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const [settings, { data: profile, error }] = await Promise.all([
    getSiteSettings(),
    // Row Level Security decides which profiles the viewer may see.
    supabase.from("profiles").select("id, full_name, avatar_path, bio, is_coach, created_at").eq("id", id).maybeSingle(),
  ]);
  if (error || !profile) notFound();

  const name = displayName(profile.full_name);
  const isSelf = profile.id === viewer.userId;
  const canMessage = !isSelf && (viewer.isEntitled || viewer.isAdmin);
  const avatarUrl = await signedUrl(supabase, "avatars", profile.avatar_path);
  const bio = profile.bio?.trim();

  return (
    <div className="space-y-6">
      <BackLink href="/faellesskab">Til fællesskabet</BackLink>

      <Panel className="space-y-6">
        <div className="flex flex-wrap items-center gap-5">
          <Avatar name={name} src={avatarUrl} size="lg" />
          <div className="min-w-0 space-y-2">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{name}</h1>
            {profile.is_coach ? <CoachBadge label={settings.coach_badge_label} /> : null}
            <p className="text-ink-soft">Medlem siden {formatDate(profile.created_at)}</p>
          </div>
        </div>

        <section aria-labelledby="om-medlemmet" className="space-y-2">
          <h2 id="om-medlemmet" className="text-xl font-semibold">
            {isSelf ? "Om dig" : `Om ${name}`}
          </h2>
          {bio ? (
            <p className="max-w-prose whitespace-pre-wrap break-words text-lg">{bio}</p>
          ) : (
            <p className="text-ink-soft">{isSelf ? "Du har ikke skrevet noget om dig selv endnu." : `${name} har ikke skrevet noget om sig selv endnu.`}</p>
          )}
        </section>

        <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:flex-wrap">
          {canMessage ? (
            <ButtonLink href={newConversationHref(profile.id)} size="lg">
              Send besked<span className="sr-only"> til {name}</span>
            </ButtonLink>
          ) : null}
          {isSelf ? (
            <ButtonLink href="/min-profil" variant="secondary" size="lg">
              Ret din profil
            </ButtonLink>
          ) : null}
          {!isSelf && !profile.is_coach ? (
            <ReportButton
              label={
                <>
                  Anmeld profil<span className="sr-only">: {name}</span>
                </>
              }
              action={reportProfile}
              targetType="profile"
              targetId={profile.id}
              title="Anmeld profil"
              coachName={settings.coach_name}
              description={
                <p>
                  Profilen for <strong className="text-ink">{name}</strong>.
                </p>
              }
            />
          ) : null}
        </div>

        {!isSelf && !viewer.isEntitled && !viewer.isAdmin ? (
          <p className="text-ink-soft">
            Private beskeder kræver et aktivt medlemskab.{" "}
            <Link href="/bliv-medlem" className="font-semibold text-brand underline underline-offset-4">
              Se medlemskabet
            </Link>
          </p>
        ) : null}
      </Panel>
    </div>
  );
}
