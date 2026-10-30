// Ordering helpers for message lists (community chat and private threads)
// and for the conversation inbox.

import { messageSnippet } from "@/lib/messages/text";

type Timestamped = { id: string; created_at: string };

/** Oldest first; ties broken by id so the order is stable. */
export function compareChronological(a: Timestamped, b: Timestamped) {
  const diff = Date.parse(a.created_at) - Date.parse(b.created_at);
  if (diff !== 0) return diff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Merges messages by id (incoming rows replace existing ones, e.g. after a
 * soft delete) and returns them oldest first. Used for realtime events,
 * own sends and "load older" pages – duplicates are impossible.
 */
export function mergeById<T extends Timestamped>(current: readonly T[], incoming: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const m of current) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort(compareChronological);
}

type InboxLike = { unread_count: number | null; last_message_at: string | null };

/** Conversations with unread messages first, then the most recent first. */
export function sortInbox<T extends InboxLike>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const unreadA = (a.unread_count ?? 0) > 0 ? 1 : 0;
    const unreadB = (b.unread_count ?? 0) > 0 ? 1 : 0;
    if (unreadA !== unreadB) return unreadB - unreadA;
    const timeA = a.last_message_at ? Date.parse(a.last_message_at) : 0;
    const timeB = b.last_message_at ? Date.parse(b.last_message_at) : 0;
    return timeB - timeA;
  });
}

/** Last-message preview for the conversation list ("Du: …" for own messages). */
export function conversationPreview(
  row: { last_message_body: string | null; last_message_sender_id: string | null },
  viewerId: string,
  max = 90,
) {
  const body = messageSnippet(row.last_message_body, max);
  if (!body) return "Ingen beskeder endnu";
  return row.last_message_sender_id === viewerId ? `Du: ${body}` : body;
}
