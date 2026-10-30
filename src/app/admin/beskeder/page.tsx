import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getSiteSettings } from "@/lib/settings";
import { signedUrls } from "@/lib/storage-server";
import { createClient } from "@/lib/supabase/server";
import { sortInbox } from "@/lib/messages/merge";
import { displayName } from "@/lib/messages/text";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/form";
import { EmptyState, PageHeader, Panel, SectionTitle } from "@/components/ui/layout";
import { ConversationList } from "@/components/messages/conversation-list";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Beskeder" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminMessagesPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireAdmin("/admin/beskeder");
  const sp = await searchParams;
  const search = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";

  const supabase = await createClient();
  const [settings, inboxRes, membersRes] = await Promise.all([
    getSiteSettings(),
    supabase.rpc("my_conversations"),
    supabase.rpc("admin_member_list", search ? { p_search: search } : {}),
  ]);

  const inbox = sortInbox(inboxRes.data ?? []);
  const unreadConversations = inbox.filter((r) => (r.unread_count ?? 0) > 0).length;
  const avatarUrls = await signedUrls(supabase, "avatars", inbox.map((r) => r.other_avatar_path));
  const members = (membersRes.data ?? []).filter((m) => m.id && m.id !== viewer.userId && !m.is_admin);

  return (
    <div className="space-y-10">
      <PageHeader
        title="Beskeder"
        description="Dine private samtaler med medlemmerne. Samtaler med ulæste beskeder står øverst."
      />

      <Alert tone="info" title="Om privatliv">
        Private samtaler mellem medlemmer kan ikke ses af administratorer. Kun beskeder, som et medlem har anmeldt, vises
        under{" "}
        <Link href="/admin/rapporter" className="font-semibold text-brand underline underline-offset-4">
          Anmeldelser
        </Link>
        .
      </Alert>

      <section aria-labelledby="indbakke" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <SectionTitle id="indbakke">Indbakke</SectionTitle>
          {inboxRes.error ? null : (
            <p className="text-ink-soft">
              {unreadConversations === 0
                ? "Ingen ulæste samtaler"
                : unreadConversations === 1
                  ? "1 samtale med ulæste beskeder"
                  : `${unreadConversations} samtaler med ulæste beskeder`}
            </p>
          )}
        </div>
        {inboxRes.error ? (
          <Alert tone="danger" title="Samtalerne kunne ikke hentes">
            Prøv at genindlæse siden om et øjeblik.
          </Alert>
        ) : inbox.length === 0 ? (
          <EmptyState title="Ingen samtaler endnu">
            Når et medlem skriver til dig, eller du starter en samtale herunder, vises den her.
          </EmptyState>
        ) : (
          <ConversationList rows={inbox} viewerId={viewer.userId} avatarUrls={avatarUrls} coachBadgeLabel={settings.coach_badge_label} />
        )}
      </section>

      <Panel className="space-y-6">
        <div className="space-y-2">
          <SectionTitle id="ny-samtale">Start en samtale med et medlem</SectionTitle>
          <p className="text-ink-soft">Find medlemmet, og åbn samtalen. Findes der allerede en samtale, åbnes den.</p>
        </div>

        <form method="get" action="/admin/beskeder" role="search" className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <TextField
            name="q"
            label="Søg efter navn eller e-mail"
            defaultValue={search}
            maxLength={100}
            className="flex-1"
            autoComplete="off"
          />
          <Button type="submit" variant="secondary">
            Søg
          </Button>
        </form>

        {membersRes.error ? (
          <Alert tone="danger" title="Medlemslisten kunne ikke hentes">
            Prøv at genindlæse siden om et øjeblik.
          </Alert>
        ) : members.length === 0 ? (
          <p className="text-ink-soft">{search ? `Ingen medlemmer matcher “${search}”.` : "Der er ingen medlemmer endnu."}</p>
        ) : (
          <form method="get" action="/beskeder/ny" className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <SelectField
              name="til"
              label={search ? `Medlemmer, der matcher “${search}” (${members.length})` : `Vælg medlem (${members.length})`}
              placeholder="Vælg et medlem"
              required
              className="flex-1"
              options={members.map((m) => ({
                value: m.id as string,
                label: m.email ? `${displayName(m.full_name, "Uden navn")} – ${m.email}` : displayName(m.full_name, "Uden navn"),
              }))}
            />
            <Button type="submit">Åbn samtale</Button>
          </form>
        )}
      </Panel>
    </div>
  );
}
