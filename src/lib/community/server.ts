import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { signedUrls } from "@/lib/storage-server";
import { loadMessageContext, type Signer } from "@/lib/community/data";
import { COMMUNITY_MESSAGE_COLUMNS, COMMUNITY_PAGE_SIZE, type ChatAuthor, type CommunityMessage } from "@/lib/community/types";

type Client = SupabaseClient<Database>;

export type CommunityFeed = {
  messages: CommunityMessage[];
  quoted: CommunityMessage[];
  authors: Record<string, ChatAuthor>;
  imageUrls: Record<string, string>;
  hasMore: boolean;
  lastReadAt: string | null;
};

/** Signs with the user's own client, so storage RLS decides access. */
export function serverSigner(supabase: Client): Signer {
  return (bucket, paths) => signedUrls(supabase, bucket, paths);
}

/**
 * Latest community messages (oldest first) with authors, signed image URLs,
 * replied-to messages and when the viewer last read the chat. Must be called
 * with the RLS client of a viewer for whom can_use_community() is true.
 */
export async function loadCommunityFeed(supabase: Client, viewerId: string): Promise<CommunityFeed | null> {
  const [messagesRes, readRes] = await Promise.all([
    supabase
      .from("community_messages")
      .select(COMMUNITY_MESSAGE_COLUMNS)
      .is("hidden_at", null)
      .order("created_at", { ascending: false })
      .limit(COMMUNITY_PAGE_SIZE),
    supabase.from("community_reads").select("last_read_at").eq("user_id", viewerId).maybeSingle(),
  ]);
  if (messagesRes.error) return null;

  const messages = [...(messagesRes.data ?? [])].reverse();
  const context = await loadMessageContext(supabase, messages, serverSigner(supabase));
  return {
    messages,
    quoted: context.quoted,
    authors: context.authors,
    imageUrls: context.imageUrls,
    hasMore: messages.length === COMMUNITY_PAGE_SIZE,
    lastReadAt: readRes.data?.last_read_at ?? null,
  };
}
