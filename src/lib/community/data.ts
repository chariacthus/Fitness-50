// Loads what the chat needs around a set of community messages: author
// profiles (with signed avatar URLs), signed image URLs and the messages
// they reply to. Works with the server client and the browser client – both
// act as the logged-in user, so Row Level Security decides what is returned.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { BUCKETS, type BucketName } from "@/lib/storage";
import { displayName } from "@/lib/messages/text";
import { AUTHOR_COLUMNS, COMMUNITY_MESSAGE_COLUMNS, type ChatAuthor, type CommunityMessage } from "@/lib/community/types";

type Client = SupabaseClient<Database>;

/** Creates signed URLs for private files: path → url. Missing entries mean "no access". */
export type Signer = (bucket: BucketName, paths: (string | null | undefined)[]) => Promise<Map<string, string>>;

/** Signer for browser code (the server uses signedUrls() from storage-server). */
export function browserSigner(supabase: Client): Signer {
  return async (bucket, paths) => {
    const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
    const result = new Map<string, string>();
    if (unique.length === 0) return result;
    const { data } = await supabase.storage.from(bucket).createSignedUrls(unique, 60 * 60);
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) result.set(item.path, item.signedUrl);
    }
    return result;
  };
}

function unique(values: (string | null | undefined)[]) {
  return [...new Set(values.filter((v): v is string => Boolean(v)))];
}

export async function fetchAuthors(supabase: Client, ids: (string | null | undefined)[], sign: Signer): Promise<Record<string, ChatAuthor>> {
  const wanted = unique(ids);
  if (wanted.length === 0) return {};
  const { data } = await supabase.from("profiles").select(AUTHOR_COLUMNS).in("id", wanted);
  const profiles = data ?? [];
  const avatars = await sign(BUCKETS.avatars, profiles.map((p) => p.avatar_path));
  const result: Record<string, ChatAuthor> = {};
  for (const p of profiles) {
    result[p.id] = {
      id: p.id,
      name: displayName(p.full_name),
      avatarUrl: p.avatar_path ? (avatars.get(p.avatar_path) ?? null) : null,
      isCoach: p.is_coach,
    };
  }
  return result;
}

export type MessageContext = {
  /** Replied-to messages that are not part of `rows`. */
  quoted: CommunityMessage[];
  authors: Record<string, ChatAuthor>;
  imageUrls: Record<string, string>;
};

/**
 * Context for `rows`. `known` lets the browser skip authors and messages it
 * already has, so each profile is fetched only once.
 */
export async function loadMessageContext(
  supabase: Client,
  rows: readonly CommunityMessage[],
  sign: Signer,
  known: { authorIds?: ReadonlySet<string>; messageIds?: ReadonlySet<string> } = {},
): Promise<MessageContext> {
  const rowIds = new Set(rows.map((r) => r.id));
  const missingReplies = unique(rows.map((r) => r.reply_to_id)).filter((id) => !rowIds.has(id) && !known.messageIds?.has(id));

  let quoted: CommunityMessage[] = [];
  if (missingReplies.length > 0) {
    const { data } = await supabase
      .from("community_messages")
      .select(COMMUNITY_MESSAGE_COLUMNS)
      .in("id", missingReplies)
      .is("hidden_at", null);
    quoted = data ?? [];
  }

  const authorIds = unique([...rows, ...quoted].map((r) => r.author_id)).filter((id) => !known.authorIds?.has(id));
  const imagePaths = rows.filter((r) => !r.deleted_at).map((r) => r.image_path);
  const [authors, images] = await Promise.all([fetchAuthors(supabase, authorIds, sign), sign(BUCKETS.community, imagePaths)]);

  return { quoted, authors, imageUrls: Object.fromEntries(images) };
}
