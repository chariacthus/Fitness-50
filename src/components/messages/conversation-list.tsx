import Link from "next/link";
import { formatMessageTime } from "@/lib/format";
import { conversationPreview } from "@/lib/messages/merge";
import { displayName } from "@/lib/messages/text";
import { Avatar } from "@/components/ui/avatar";
import { CountBadge } from "@/components/ui/badge";
import { CoachBadge } from "@/components/ui/coach-badge";
import { cn } from "@/components/ui/cn";

/** One row from rpc my_conversations(). */
export type ConversationRow = {
  conversation_id: string | null;
  other_user_id: string | null;
  other_name: string | null;
  other_avatar_path: string | null;
  other_is_coach: boolean | null;
  last_message_at: string | null;
  last_message_body: string | null;
  last_message_sender_id: string | null;
  unread_count: number | null;
};

/** Conversation list used by /beskeder and /admin/beskeder. Rows are shown in the given order. */
export function ConversationList({
  rows,
  viewerId,
  avatarUrls,
  coachBadgeLabel,
}: {
  rows: ConversationRow[];
  viewerId: string;
  avatarUrls: Map<string, string>;
  coachBadgeLabel: string;
}) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
      {rows.map((row) => {
        if (!row.conversation_id) return null;
        const name = displayName(row.other_name);
        const unread = Number(row.unread_count ?? 0);
        const avatar = row.other_avatar_path ? (avatarUrls.get(row.other_avatar_path) ?? null) : null;
        return (
          <li key={row.conversation_id}>
            <Link
              href={`/beskeder/${row.conversation_id}`}
              className={cn("flex min-h-20 items-start gap-4 px-4 py-4 hover:bg-muted sm:px-5", unread > 0 && "bg-brand-soft")}
            >
              <Avatar name={name} src={avatar} />
              <span className="min-w-0 flex-1 space-y-1">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-lg font-semibold text-ink">{name}</span>
                  {row.other_is_coach ? <CoachBadge label={coachBadgeLabel} /> : null}
                </span>
                <span className={cn("block break-words", unread > 0 ? "font-semibold text-ink" : "text-ink-soft")}>
                  {conversationPreview(row, viewerId)}
                </span>
                {row.last_message_at ? (
                  <span className="block text-ink-soft">{formatMessageTime(row.last_message_at)}</span>
                ) : null}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-2 pt-1">
                <CountBadge count={unread} label={unread === 1 ? "ulæst besked" : "ulæste beskeder"} />
                <span className="font-semibold text-brand">
                  Åbn<span className="sr-only"> samtalen med {name}</span>
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
