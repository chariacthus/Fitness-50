import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { MESSAGE_HIDDEN_EVENT, MODERATION_CHANNEL, type MessageHiddenPayload } from "@/lib/community/moderation";

/**
 * Tells open community chats that a message has been hidden (Realtime
 * broadcast over REST, no subscription needed). Only the id is sent; each chat
 * re-checks the message with its own client before removing it. Best effort:
 * returns false instead of throwing, because the message is already hidden in
 * the database – members who have the chat open just see it until they reload.
 */
export async function broadcastMessageHidden(messageId: string): Promise<boolean> {
  let service: ReturnType<typeof createAdminClient>;
  try {
    service = createAdminClient();
  } catch {
    return false;
  }
  const channel = service.channel(MODERATION_CHANNEL);
  try {
    const payload: MessageHiddenPayload = { id: messageId.toLowerCase() };
    const result = await channel.httpSend(MESSAGE_HIDDEN_EVENT, payload, { timeout: 5_000 });
    if (!result.success) {
      console.error("[community] moderation broadcast failed:", result.status, result.error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[community] moderation broadcast failed:", error instanceof Error ? error.message : error);
    return false;
  } finally {
    await service.removeChannel(channel).catch(() => undefined);
  }
}
