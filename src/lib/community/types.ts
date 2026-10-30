import type { Tables } from "@/lib/database.types";

// Shapes shared by the community page (server) and the chat (browser).

export const COMMUNITY_PAGE_SIZE = 50;

export const COMMUNITY_MESSAGE_COLUMNS =
  "id, author_id, body, image_path, reply_to_id, is_system, hidden_at, deleted_at, edited_at, created_at" as const;

export type CommunityMessage = Pick<
  Tables<"community_messages">,
  "id" | "author_id" | "body" | "image_path" | "reply_to_id" | "is_system" | "hidden_at" | "deleted_at" | "edited_at" | "created_at"
>;

export const AUTHOR_COLUMNS = "id, full_name, avatar_path, is_coach" as const;

/** What the chat needs to show about a person. avatarUrl is a short-lived signed URL. */
export type ChatAuthor = { id: string; name: string; avatarUrl: string | null; isCoach: boolean };

/** Picks the known columns from a realtime payload row. */
export function toCommunityMessage(row: Tables<"community_messages">): CommunityMessage {
  return {
    id: row.id,
    author_id: row.author_id,
    body: row.body ?? "",
    image_path: row.image_path,
    reply_to_id: row.reply_to_id,
    is_system: Boolean(row.is_system),
    hidden_at: row.hidden_at,
    deleted_at: row.deleted_at,
    edited_at: row.edited_at,
    created_at: row.created_at,
  };
}
