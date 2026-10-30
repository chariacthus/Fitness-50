import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireViewer, type Viewer } from "@/lib/auth";
import { getSiteSettings, type SiteSettings } from "@/lib/settings";
import { signedUrl } from "@/lib/storage-server";
import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/lib/messages/text";
import { PRIVATE_MESSAGE_COLUMNS, THREAD_PAGE_SIZE } from "@/lib/messages/types";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { CoachBadge } from "@/components/ui/coach-badge";
import { BackLink } from "@/components/ui/layout";
import { PrivateThread } from "@/components/messages/private-thread";
import { reportPrivateMessage } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Samtale" };

type Params = Promise<{ id: string }>;

function BlockedNotice({ viewer, settings, otherName, otherIsCoach }: { viewer: Viewer; settings: SiteSettings; otherName: string; otherIsCoach: boolean }) {
  if (!viewer.isEntitled && !viewer.isAdmin) {
    return (
      <Alert tone="info" title="Du kan ikke sende beskeder lige nu">
        <p>Private beskeder kræver et aktivt medlemskab. Du kan stadig læse jeres tidligere beskeder.</p>
        <p className="mt-3">
          <Link href="/bliv-medlem" className="font-semibold text-brand underline underline-offset-4">
            Se medlemskabet
          </Link>
        </p>
      </Alert>
    );
  }
  if (viewer.profile.community_suspended && !otherIsCoach) {
    return (
      <Alert tone="info" title="Du kan ikke sende beskeder lige nu">
        Din adgang til fællesskabet er sat på pause, så du kan kun skrive til {settings.coach_name} lige nu.
      </Alert>
    );
  }
  return (
    <Alert tone="info" title="Du kan ikke sende beskeder lige nu">
      Du kan ikke skrive til {otherName} lige nu. Det sker typisk, når et medlemskab ikke længere er aktivt.
    </Alert>
  );
}

export default async function ConversationPage({ params }: { params: Params }) {
  const { id } = await params;
  const viewer = await requireViewer(`/beskeder/${encodeURIComponent(id)}`);
  if (!z.guid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const [settings, participantsRes, messagesRes, canSendRes] = await Promise.all([
    getSiteSettings(),
    // Row Level Security: only participants can see the participant list.
    supabase.from("conversation_participants").select("user_id").eq("conversation_id", id),
    supabase
      .from("private_messages")
      .select(PRIVATE_MESSAGE_COLUMNS)
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .limit(THREAD_PAGE_SIZE),
    supabase.rpc("can_send_private_message", { p_conversation: id }),
  ]);

  if (participantsRes.error || messagesRes.error) {
    return (
      <div className="space-y-6">
        <BackLink href="/beskeder">Alle beskeder</BackLink>
        <Alert tone="danger" title="Samtalen kunne ikke hentes">
          Prøv at genindlæse siden om et øjeblik.
        </Alert>
      </div>
    );
  }

  const participants = participantsRes.data ?? [];
  if (!participants.some((p) => p.user_id === viewer.userId)) notFound();

  const otherId = participants.find((p) => p.user_id !== viewer.userId)?.user_id ?? null;
  const { data: otherProfile } = otherId
    ? await supabase.from("profiles").select("id, full_name, avatar_path, is_coach").eq("id", otherId).maybeSingle()
    : { data: null };
  const otherName = otherProfile ? displayName(otherProfile.full_name) : "Tidligere medlem";
  const otherIsCoach = Boolean(otherProfile?.is_coach);
  const avatarUrl = await signedUrl(supabase, "avatars", otherProfile?.avatar_path);
  const messages = [...(messagesRes.data ?? [])].reverse();
  const canSend = Boolean(canSendRes.data);

  return (
    <div className="space-y-6">
      <BackLink href="/beskeder">Alle beskeder</BackLink>
      <header className="flex flex-wrap items-center gap-4 border-b border-line pb-6">
        <Avatar name={otherName} src={avatarUrl} size="lg" />
        <div className="min-w-0 space-y-2">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{otherName}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {otherIsCoach ? <CoachBadge label={settings.coach_badge_label} /> : null}
            {otherProfile ? (
              <Link
                href={`/medlemmer/${otherProfile.id}`}
                className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4"
              >
                Se profil<span className="sr-only">: {otherName}</span>
              </Link>
            ) : null}
          </div>
          <p className="text-ink-soft">Andre medlemmer kan ikke se jeres samtale.</p>
        </div>
      </header>

      <PrivateThread
        conversationId={id}
        viewerId={viewer.userId}
        other={{ id: otherId, name: otherName, isCoach: otherIsCoach }}
        coachName={settings.coach_name}
        coachBadgeLabel={settings.coach_badge_label}
        initialMessages={messages}
        initialHasMore={messages.length === THREAD_PAGE_SIZE}
        canSend={canSend}
        blockedNotice={<BlockedNotice viewer={viewer} settings={settings} otherName={otherName} otherIsCoach={otherIsCoach} />}
        reportAction={reportPrivateMessage}
      />
    </div>
  );
}
