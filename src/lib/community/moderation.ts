// Live moderation for the community chat.
//
// When an administrator hides a message, Realtime drops the postgres_changes
// UPDATE for members: they may no longer read the row, so the event never
// reaches them. The server therefore also sends a broadcast with only the
// message id on a fixed channel. Anyone with the public key can send to that
// channel, so the chat never trusts the broadcast itself: it asks the
// database (as the logged-in member, RLS applies) whether the message is
// still visible, and only removes it when it is not.

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { isUuid } from "@/lib/admin/forms";

export const MODERATION_CHANNEL = "faellesskab-moderation";
export const MESSAGE_HIDDEN_EVENT = "hidden";

/** Payload of a "hidden" broadcast: only the id, never the content. */
export type MessageHiddenPayload = { id: string };

/** The message id from a "hidden" broadcast payload, or null when it is not a valid id. */
export function hiddenMessageId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const id = (payload as { id?: unknown }).id;
  return isUuid(id) ? id.toLowerCase() : null;
}

/** The record without `id` (the same object when it was not there, so React skips the update). */
export function withoutKey<T>(record: Record<string, T>, id: string): Record<string, T> {
  if (!Object.prototype.hasOwnProperty.call(record, id)) return record;
  const next = { ...record };
  delete next[id];
  return next;
}

// supabase-js hands back an existing channel with the same topic – also one
// that is still closing after a fast remount, and that one never joins
// again. This topic is fixed (the server has to know it), so a new
// subscription first waits until the previous one has been removed.
let previousRemoval: Promise<unknown> = Promise.resolve();

/**
 * Calls `onHidden` with the id from every "hidden" broadcast. The id is only
 * a hint: the caller must re-check the message with an RLS query before it
 * removes anything. Returns a function that stops listening.
 */
export function listenForHiddenMessages(supabase: SupabaseClient<Database>, onHidden: (id: string) => void): () => void {
  let channel: RealtimeChannel | null = null;
  let stopped = false;
  void previousRemoval.then(() => {
    if (stopped) return;
    channel = supabase
      .channel(MODERATION_CHANNEL)
      .on("broadcast", { event: MESSAGE_HIDDEN_EVENT }, ({ payload }) => {
        const id = hiddenMessageId(payload);
        if (id) onHidden(id);
      })
      .subscribe();
  });
  return () => {
    stopped = true;
    if (channel) previousRemoval = supabase.removeChannel(channel).catch(() => undefined);
  };
}
