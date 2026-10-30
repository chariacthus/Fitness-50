"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { dbErrorMessage } from "@/lib/action-result";
import type { Tables } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";
import { BUCKETS } from "@/lib/storage";
import { removeUploadedFile } from "@/lib/upload-client";
import { browserSigner, loadMessageContext, type MessageContext } from "@/lib/community/data";
import { firstUnreadId, groupByDay, replyQuoteText } from "@/lib/community/grouping";
import {
  COMMUNITY_MESSAGE_COLUMNS,
  COMMUNITY_PAGE_SIZE,
  toCommunityMessage,
  type ChatAuthor,
  type CommunityMessage,
} from "@/lib/community/types";
import { isNearViewport, requestUnreadCountsRefresh, scrollBehavior } from "@/lib/messages/events";
import { mergeById } from "@/lib/messages/merge";
import { newMessagesLabel, olderMessagesLabel } from "@/lib/messages/text";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/layout";
import { Spinner } from "@/components/ui/spinner";
import { CommunityComposer, type ReplyDraft } from "@/components/community/community-composer";
import { authorFor, CommunityMessageItem } from "@/components/community/community-message";
import { ReportDialog, type ReportAction } from "@/components/community/report-dialog";

const DIVIDER_ID = "nye-beskeder";

type Props = {
  viewerId: string;
  coachName: string;
  coachBadgeLabel: string;
  initialMessages: CommunityMessage[];
  initialQuoted: CommunityMessage[];
  initialAuthors: Record<string, ChatAuthor>;
  initialImageUrls: Record<string, string>;
  initialHasMore: boolean;
  /** When the viewer last read the chat (before this visit). */
  lastReadAt: string | null;
  reportAction: ReportAction;
};

/**
 * The community group chat. Initial messages come from the server; new and
 * changed messages arrive through Supabase Realtime (which applies the same
 * Row Level Security as normal reads). Sending, deleting and paging use the
 * browser client as the logged-in user.
 */
export function CommunityChat({
  viewerId,
  coachName,
  coachBadgeLabel,
  initialMessages,
  initialQuoted,
  initialAuthors,
  initialImageUrls,
  initialHasMore,
  lastReadAt,
  reportAction,
}: Props) {
  const [messages, setMessages] = useState(initialMessages);
  const [quoted, setQuoted] = useState<Record<string, CommunityMessage>>(() =>
    Object.fromEntries(initialQuoted.map((m) => [m.id, m])),
  );
  const [authors, setAuthors] = useState(initialAuthors);
  const [imageUrls, setImageUrls] = useState(initialImageUrls);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyDraft | null>(null);
  const [focusSignal, setFocusSignal] = useState(0);
  const [reportTarget, setReportTarget] = useState<{ id: string; authorName: string; text: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [liveFailed, setLiveFailed] = useState(false);
  // The divider stays where the viewer stopped reading, even after we mark the chat as read.
  const [dividerId] = useState(() => firstUnreadId(initialMessages, lastReadAt, viewerId));

  const knownAuthors = useRef<Set<string>>(new Set(Object.keys(initialAuthors)));
  const knownMessages = useRef<Set<string>>(new Set([...initialMessages, ...initialQuoted].map((m) => m.id)));
  const endRef = useRef<HTMLDivElement>(null);

  const markRead = useCallback(async () => {
    const { error } = await createClient().rpc("mark_community_read");
    if (!error) requestUnreadCountsRefresh();
  }, []);

  /** Adds rows together with their authors, images and replied-to messages. */
  const integrate = useCallback(async (rows: CommunityMessage[]) => {
    const visible = rows.filter((r) => !r.hidden_at);
    let context: MessageContext = { quoted: [], authors: {}, imageUrls: {} };
    try {
      const supabase = createClient();
      context = await loadMessageContext(supabase, visible, browserSigner(supabase), {
        authorIds: knownAuthors.current,
        messageIds: knownMessages.current,
      });
    } catch {
      // Show the messages anyway; names fall back to "Medlem".
    }
    for (const id of Object.keys(context.authors)) knownAuthors.current.add(id);
    for (const m of [...visible, ...context.quoted]) knownMessages.current.add(m.id);
    setAuthors((prev) => ({ ...prev, ...context.authors }));
    setImageUrls((prev) => ({ ...prev, ...context.imageUrls }));
    if (context.quoted.length > 0) {
      setQuoted((prev) => ({ ...prev, ...Object.fromEntries(context.quoted.map((m) => [m.id, m])) }));
    }
    setMessages((prev) => mergeById(prev, visible));
  }, []);

  // On arrival: jump to the "Nye beskeder" divider (or the newest message) and mark the chat as read.
  useEffect(() => {
    const target = dividerId ? document.getElementById(DIVIDER_ID) : endRef.current;
    target?.scrollIntoView({ block: dividerId ? "center" : "end" });
    void markRead();
  }, [dividerId, markRead]);

  // Live updates.
  useEffect(() => {
    const supabase = createClient();
    let newCount = 0;
    let announceTimer: ReturnType<typeof setTimeout> | undefined;
    let markTimer: ReturnType<typeof setTimeout> | undefined;
    let unreadWhileHidden = false;

    const announceNew = () => {
      newCount += 1;
      setAnnouncement(newMessagesLabel(newCount));
      clearTimeout(announceTimer);
      announceTimer = setTimeout(() => {
        newCount = 0;
      }, 10_000);
    };
    const markReadSoon = () => {
      if (document.visibilityState !== "visible") {
        unreadWhileHidden = true;
        return;
      }
      clearTimeout(markTimer);
      markTimer = setTimeout(() => void markRead(), 1500);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible" && unreadWhileHidden) {
        unreadWhileHidden = false;
        void markRead();
      }
    };

    // A unique topic per subscription: supabase-js would otherwise hand back a channel
    // that is still closing (fast remounts) and the page would get no live updates.
    const channel = supabase
      .channel(`faellesskab-${crypto.randomUUID()}`)
      .on<Tables<"community_messages">>(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "community_messages" },
        (payload) => {
          const row = toCommunityMessage(payload.new);
          if (row.hidden_at) return;
          const stickToBottom = isNearViewport(endRef.current);
          void integrate([row]).then(() => {
            if (stickToBottom) requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "nearest", behavior: scrollBehavior() }));
          });
          if (row.author_id !== viewerId) {
            announceNew();
            markReadSoon();
          }
        },
      )
      .on<Tables<"community_messages">>(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "community_messages" },
        (payload) => {
          const row = toCommunityMessage(payload.new);
          if (row.hidden_at) {
            // Hidden by a moderator: remove it from the chat.
            setMessages((prev) => prev.filter((m) => m.id !== row.id));
            return;
          }
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev.map((m) => (m.id === row.id ? row : m)) : prev));
          setQuoted((prev) => (prev[row.id] ? { ...prev, [row.id]: row } : prev));
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setLiveFailed(false);
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setLiveFailed(true);
      });

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimeout(announceTimer);
      clearTimeout(markTimer);
      void supabase.removeChannel(channel);
    };
  }, [integrate, markRead, viewerId]);

  async function loadOlder() {
    const oldest = messages[0];
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    setOlderError(null);
    const { data, error } = await createClient()
      .from("community_messages")
      .select(COMMUNITY_MESSAGE_COLUMNS)
      .is("hidden_at", null)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(COMMUNITY_PAGE_SIZE);
    if (error || !data) {
      setOlderError("De ældre beskeder kunne ikke hentes. Prøv igen.");
      setLoadingOlder(false);
      return;
    }
    await integrate(data);
    setHasMore(data.length === COMMUNITY_PAGE_SIZE);
    setAnnouncement(olderMessagesLabel(data.length));
    setLoadingOlder(false);
  }

  const send = useCallback(
    async (body: string, imagePath: string | null): Promise<string | null> => {
      const { data, error } = await createClient()
        .from("community_messages")
        .insert({ id: crypto.randomUUID(), author_id: viewerId, body, image_path: imagePath, reply_to_id: replyTo?.id ?? null })
        .select(COMMUNITY_MESSAGE_COLUMNS)
        .single();
      if (error || !data) return dbErrorMessage(error, "Beskeden kunne ikke sendes. Prøv igen.");
      setReplyTo(null);
      await integrate([data]);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "nearest", behavior: scrollBehavior() }));
      setAnnouncement("Din besked er sendt.");
      return null;
    },
    [integrate, replyTo, viewerId],
  );

  async function remove(message: CommunityMessage) {
    setActionError(null);
    setDeletingId(message.id);
    const { data, error } = await createClient()
      .from("community_messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", message.id)
      .select(COMMUNITY_MESSAGE_COLUMNS)
      .single();
    setDeletingId(null);
    if (error || !data) {
      setActionError(dbErrorMessage(error, "Beskeden kunne ikke slettes. Prøv igen."));
      return;
    }
    setMessages((prev) => mergeById(prev, [data]));
    setAnnouncement("Din besked er slettet.");
    // The database has already detached the image; remove the file too (best effort).
    if (message.image_path) void removeUploadedFile(BUCKETS.community, message.image_path);
  }

  const byId = new Map<string, CommunityMessage>();
  for (const m of Object.values(quoted)) byId.set(m.id, m);
  for (const m of messages) byId.set(m.id, m);

  function quoteFor(message: CommunityMessage) {
    if (!message.reply_to_id) return null;
    const target = byId.get(message.reply_to_id);
    return {
      authorName: target ? authorFor(target, authors).name : "et andet medlem",
      text: replyQuoteText(target),
    };
  }

  const groups = groupByDay(messages);

  return (
    <section aria-labelledby="faellesskab-beskeder" className="space-y-6">
      <h2 id="faellesskab-beskeder" className="sr-only">
        Beskeder i fællesskabet
      </h2>
      <p aria-live="polite" role="status" className="sr-only">
        {announcement}
      </p>

      {liveFailed ? (
        <Alert tone="warning" title="Nye beskeder vises ikke automatisk lige nu">
          Forbindelsen til live-opdateringer svigtede. Genindlæs siden for at se de nyeste beskeder.
        </Alert>
      ) : null}

      {hasMore ? (
        <div className="flex flex-col items-center gap-3">
          <Button variant="secondary" onClick={() => void loadOlder()} disabled={loadingOlder}>
            {loadingOlder ? <Spinner label="Henter ældre beskeder…" /> : "Indlæs ældre beskeder"}
          </Button>
          {olderError ? <Alert tone="danger">{olderError}</Alert> : null}
        </div>
      ) : messages.length > 0 ? (
        <p className="text-center text-ink-soft">Her starter fællesskabet. Der er ikke flere ældre beskeder.</p>
      ) : null}

      {messages.length === 0 ? (
        <EmptyState title="Der er ingen beskeder endnu">
          Skriv den første besked, og sig hej til de andre medlemmer.
        </EmptyState>
      ) : (
        groups.map((group) => (
          <section key={group.key} aria-labelledby={`dag-${group.key}`}>
            <h3 id={`dag-${group.key}`} className="flex items-center gap-3 py-2 text-base font-semibold text-ink-soft" suppressHydrationWarning>
              <span aria-hidden="true" className="h-px flex-1 bg-line" />
              {group.label}
              <span aria-hidden="true" className="h-px flex-1 bg-line" />
            </h3>
            <ol className="divide-y divide-line">
              {group.items.map((message) => {
                const author = authorFor(message, authors);
                return (
                  <Fragment key={message.id}>
                    {message.id === dividerId ? (
                      <li id={DIVIDER_ID} className="flex items-center gap-3 py-3 font-bold text-danger">
                        <span aria-hidden="true" className="h-0.5 flex-1 bg-danger" />
                        Nye beskeder
                        <span aria-hidden="true" className="h-0.5 flex-1 bg-danger" />
                      </li>
                    ) : null}
                    <li className="py-4">
                      <CommunityMessageItem
                        message={message}
                        author={author}
                        imageUrl={message.image_path ? (imageUrls[message.image_path] ?? null) : null}
                        quote={quoteFor(message)}
                        isOwn={message.author_id === viewerId}
                        coachBadgeLabel={coachBadgeLabel}
                        deleting={deletingId === message.id}
                        onReply={() => {
                          setReplyTo({ id: message.id, authorName: author.name, text: replyQuoteText(message) });
                          setFocusSignal((n) => n + 1);
                        }}
                        onDelete={() => void remove(message)}
                        onReport={() => setReportTarget({ id: message.id, authorName: author.name, text: replyQuoteText(message) })}
                      />
                    </li>
                  </Fragment>
                );
              })}
            </ol>
          </section>
        ))
      )}
      <div ref={endRef} className="scroll-mb-32 lg:scroll-mb-8" />

      {actionError ? <Alert tone="danger">{actionError}</Alert> : null}

      <CommunityComposer
        viewerId={viewerId}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSend={send}
        focusSignal={focusSignal}
      />

      {reportTarget ? (
        <ReportDialog
          key={reportTarget.id}
          action={reportAction}
          targetType="community_message"
          targetId={reportTarget.id}
          title="Anmeld besked"
          coachName={coachName}
          description={
            <p>
              Beskeden fra <strong className="text-ink">{reportTarget.authorName}</strong>: “{reportTarget.text}”
            </p>
          }
          onClose={() => setReportTarget(null)}
        />
      ) : null}
    </section>
  );
}
