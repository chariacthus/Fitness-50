import type { Tables } from "@/lib/database.types";

export const THREAD_PAGE_SIZE = 100;

export const PRIVATE_MESSAGE_COLUMNS = "id, conversation_id, sender_id, body, deleted_at, created_at" as const;

export type PrivateMessage = Pick<Tables<"private_messages">, "id" | "conversation_id" | "sender_id" | "body" | "deleted_at" | "created_at">;

export function toPrivateMessage(row: Tables<"private_messages">): PrivateMessage {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_id: row.sender_id,
    body: row.body ?? "",
    deleted_at: row.deleted_at,
    created_at: row.created_at,
  };
}
