"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { dbErrorMessage } from "@/lib/action-result";
import type { Tables } from "@/lib/database.types";
import { formatMessageTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { groupByDay } from "@/lib/community/grouping";
import { isNearViewport, requestUnreadCountsRefresh, scrollBehavior } from "@/lib/messages/events";
import { mergeById } from "@/lib/messages/merge";
import { MESSAGE_MAX_LENGTH, messageSnippet, newMessagesLabel, olderMessagesLabel } from "@/lib/messages/text";
import { PRIVATE_MESSAGE_COLUMNS, THREAD_PAGE_SIZE, toPrivateMessage, type PrivateMessage } from "@/lib/messages/types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CoachBadge } from "@/components/ui/coach-badge";
import { cn } from "@/components/ui/cn";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { TextareaField } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/layout";
import { Spinner } from "@/components/ui/spinner";
import { MESSAGE_ACTION_CLASS, MESSAGE_CONFIRM_WRAPPER_CLASS } from "@/components/community/community-message";
import { ReportDialog, type ReportAction } from "@/components/community/report-dialog";

type Outgoing = { id: string; body: string; created_at: string; status: "sending" | "failed"; error?: string };

type Props = {
  conversationId: string;
  viewerId: string;
  other: { id: string | null; name: string; isCoach: boolean };
  coachName: string;
  coachBadgeLabel: string;
  initialMessages: PrivateMessage[];
  initialHasMore: boolean;
  canSend: boolean;
  /** Shown instead of the message box when the viewer may not send. */
  blockedNotice?: ReactNode;
  reportAction: ReportAction;
};

/**
 * A private conversation between two people. Messages are stored in the
 * database (they survive reloads); new ones arrive through Supabase Realtime,
 * filtered to this conversation and protected by Row Level Security.
 */
export function PrivateThread({
  conversationId,
  viewerId,
  other,
  coachName,
  coachBadgeLabel,
  initialMessages,
  initialHasMore,
  canSend,
  blockedNotice,
  reportAction,
}: Props) {
  const [messages, setMessages] = useState(initialMessages);
  const [outbox, setOutbox] = useState<Outgoing[]>([]);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{ id: string; text: string } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [liveFailed, setLiveFailed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaId = useId();

  const markRead = useCallback(async () => {
    const { error } = await createClient().rpc("mark_conversation_read", { p_conversation: conversationId });
    if (!error) requestUnreadCountsRefresh();
  }, [conversationId]);

  // On arrival: show the newest message and mark the conversation as read.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
    void markRead();
  }, [markRead]);

  // Live updates for this conversation only.
  useEffect(() => {
    const supabase = createClient();
    const filter = `conversation_id=eq.${conversationId}`;
    let newCount = 0;
    let announceTimer: ReturnType<typeof setTimeout> | undefined;
    let markTimer: ReturnType<typeof setTimeout> | undefined;
    let unreadWhileHidden = false;

    const onVisibility = () => {
      if (document.visibilityState === "visible" && unreadWhileHidden) {
        unreadWhileHidden = false;
        void markRead();
      }
    };

    const channel = supabase
      .channel(`samtale-${conversationId}-${crypto.randomUUID()}`)
      .on<Tables<"private_messages">>("postgres_changes", { event: "INSERT", schema: "public", table: "private_messages", filter }, (payload) => {
        const row = toPrivateMessage(payload.new);
        const stickToBottom = isNearViewport(endRef.current);
        setMessages((prev) => mergeById(prev, [row]));
        if (stickToBottom) {
          requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "nearest", behavior: scrollBehavior() }));
        }
        if (row.sender_id !== viewerId) {
          newCount += 1;
          setAnnouncement(newMessagesLabel(newCount));
          clearTimeout(announceTimer);
          announceTimer = setTimeout(() => {
            newCount = 0;
          }, 10_000);
          if (document.visibilityState === "visible") {
            clearTimeout(markTimer);
            markTimer = setTimeout(() => void markRead(), 1000);
          } else {
            unreadWhileHidden = true;
          }
        }
      })
      .on<Tables<"private_messages">>("postgres_changes", { event: "UPDATE", schema: "public", table: "private_messages", filter }, (payload) => {
        const row = toPrivateMessage(payload.new);
        setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev.map((m) => (m.id === row.id ? row : m)) : prev));
      })
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
  }, [conversationId, markRead, viewerId]);

  const deliver = useCallback(
    async (item: Outgoing) => {
      setOutbox((prev) => prev.map((o) => (o.id === item.id ? { ...o, status: "sending", error: undefined } : o)));
      const supabase = createClient();
      // The id is created in the browser, so a retry can never create a duplicate.
      const { data, error } = await supabase
        .from("private_messages")
        .insert({ id: item.id, conversation_id: conversationId, sender_id: viewerId, body: item.body })
        .select(PRIVATE_MESSAGE_COLUMNS)
        .single();
      let saved = data;
      if (!saved && error?.code === "23505") {
        // An earlier attempt reached the database after all.
        const again = await supabase.from("private_messages").select(PRIVATE_MESSAGE_COLUMNS).eq("id", item.id).maybeSingle();
        saved = again.data;
      }
      if (!saved) {
        const message = dbErrorMessage(error, "Prøv igen om et øjeblik.");
        setOutbox((prev) => prev.map((o) => (o.id === item.id ? { ...o, status: "failed", error: message } : o)));
        setAnnouncement("Beskeden kunne ikke sendes.");
        return;
      }
      const confirmed = saved;
      setMessages((prev) => mergeById(prev, [confirmed]));
      setOutbox((prev) => prev.filter((o) => o.id !== item.id));
      setAnnouncement("Din besked er sendt.");
    },
    [conversationId, viewerId],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = body.trim();
    if (!text) {
      setFieldError("Skriv en besked, før du sender.");
      return;
    }
    if (text.length > MESSAGE_MAX_LENGTH) {
      setFieldError(`Beskeden må højst være ${MESSAGE_MAX_LENGTH} tegn.`);
      return;
    }
    setFieldError(null);
    const item: Outgoing = { id: crypto.randomUUID(), body: text, created_at: new Date().toISOString(), status: "sending" };
    setOutbox((prev) => [...prev, item]);
    setBody("");
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "nearest", behavior: scrollBehavior() }));
    void deliver(item);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter makes a new line; Ctrl+Enter (Cmd+Enter on Mac) sends.
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  async function loadOlder() {
    const oldest = messages[0];
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    setOlderError(null);
    const { data, error } = await createClient()
      .from("private_messages")
      .select(PRIVATE_MESSAGE_COLUMNS)
      .eq("conversation_id", conversationId)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(THREAD_PAGE_SIZE);
    setLoadingOlder(false);
    if (error || !data) {
      setOlderError("De ældre beskeder kunne ikke hentes. Prøv igen.");
      return;
    }
    setMessages((prev) => mergeById(prev, data));
    setHasMore(data.length === THREAD_PAGE_SIZE);
    setAnnouncement(olderMessagesLabel(data.length));
  }

  async function remove(message: PrivateMessage) {
    setActionError(null);
    setDeletingId(message.id);
    const { data, error } = await createClient()
      .from("private_messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", message.id)
      .select(PRIVATE_MESSAGE_COLUMNS)
      .single();
    setDeletingId(null);
    if (error || !data) {
      setActionError(dbErrorMessage(error, "Beskeden kunne ikke slettes. Prøv igen."));
      return;
    }
    setMessages((prev) => mergeById(prev, [data]));
    setAnnouncement("Din besked er slettet.");
  }

  function senderName(senderId: string | null) {
    if (senderId === viewerId) return "Du";
    if (senderId && senderId === other.id) return other.name;
    return "Tidligere medlem";
  }

  const pending = outbox.filter((o) => !messages.some((m) => m.id === o.id));
  const groups = groupByDay(messages);

  return (
    <section aria-labelledby="samtale-beskeder" className="space-y-6">
      <h2 id="samtale-beskeder" className="sr-only">
        Beskeder med {other.name}
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
      ) : null}

      {messages.length === 0 && pending.length === 0 ? (
        <EmptyState title="Ingen beskeder endnu">
          {canSend ? `Skriv den første besked til ${other.name} herunder.` : "Der er ingen beskeder i samtalen."}
        </EmptyState>
      ) : null}

      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`samtale-dag-${group.key}`} className="space-y-3">
          <h3 id={`samtale-dag-${group.key}`} className="flex items-center gap-3 py-2 text-base font-semibold text-ink-soft" suppressHydrationWarning>
            <span aria-hidden="true" className="h-px flex-1 bg-line" />
            {group.label}
            <span aria-hidden="true" className="h-px flex-1 bg-line" />
          </h3>
          <ol className="space-y-3">
            {group.items.map((message) => {
              const own = message.sender_id === viewerId;
              const deleted = Boolean(message.deleted_at);
              const name = senderName(message.sender_id);
              return (
                <li key={message.id} className={cn("flex", own ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "w-fit max-w-[90%] space-y-2 rounded-lg border px-4 py-3 sm:max-w-[75%]",
                      own ? "border-brand-line bg-brand-soft" : "border-line bg-surface",
                    )}
                  >
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-semibold">{name}</span>
                      {!own && other.isCoach && message.sender_id === other.id ? <CoachBadge label={coachBadgeLabel} /> : null}
                      <time dateTime={message.created_at} className="text-ink-soft" suppressHydrationWarning>
                        {formatMessageTime(message.created_at)}
                      </time>
                    </p>
                    {deleted ? (
                      <p className="italic text-ink-soft">Beskeden er slettet</p>
                    ) : (
                      <p className="whitespace-pre-wrap break-words">{message.body}</p>
                    )}
                    {!deleted && own ? (
                      <div className="flex flex-wrap gap-2">
                        <span className={MESSAGE_CONFIRM_WRAPPER_CLASS}>
                          <ConfirmButton
                            title="Vil du slette beskeden?"
                            description={`Beskeden fjernes for både dig og ${other.name}. Det kan ikke fortrydes.`}
                            confirmLabel="Ja, slet beskeden"
                            triggerVariant="ghost"
                            onConfirm={() => void remove(message)}
                            disabled={deletingId === message.id}
                          >
                            {deletingId === message.id ? "Sletter…" : "Slet"}
                            <span className="sr-only"> din besked</span>
                          </ConfirmButton>
                        </span>
                      </div>
                    ) : null}
                    {!deleted && !own && message.sender_id && !other.isCoach ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="ghost"
                          className={MESSAGE_ACTION_CLASS}
                          onClick={() => setReportTarget({ id: message.id, text: messageSnippet(message.body, 100) })}
                        >
                          Anmeld<span className="sr-only"> beskeden fra {name}</span>
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      {pending.length > 0 ? (
        <ol className="space-y-3" aria-label="Beskeder, der sendes nu">
          {pending.map((item) => (
            <li key={item.id} className="flex justify-end">
              <div
                className={cn(
                  "w-fit max-w-[90%] space-y-2 rounded-lg border px-4 py-3 sm:max-w-[75%]",
                  item.status === "failed" ? "border-danger bg-danger-soft" : "border-brand-line bg-brand-soft",
                )}
              >
                <p className="font-semibold">Du</p>
                <p className="whitespace-pre-wrap break-words">{item.body}</p>
                {item.status === "sending" ? (
                  <p className="text-ink-soft">
                    <Spinner label="Sender…" />
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="font-semibold text-danger">Kunne ikke sendes</p>
                    {item.error ? <p>{item.error}</p> : null}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => void deliver(item)}>
                        Prøv igen
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={MESSAGE_ACTION_CLASS}
                        onClick={() => setOutbox((prev) => prev.filter((o) => o.id !== item.id))}
                      >
                        Fjern beskeden
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : null}
      <div ref={endRef} className="scroll-mb-32 lg:scroll-mb-8" />

      {actionError ? <Alert tone="danger">{actionError}</Alert> : null}

      {canSend ? (
        <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-4 rounded-lg border border-line bg-surface p-4 sm:p-6">
          <TextareaField
            id={textareaId}
            name="body"
            label={`Skriv en besked til ${other.name}`}
            hint="Enter giver en ny linje. Tryk Ctrl+Enter (Cmd+Enter på Mac) eller knappen Send for at sende."
            rows={4}
            maxLength={MESSAGE_MAX_LENGTH}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            error={fieldError ?? undefined}
          />
          <Button type="submit" size="lg" className="w-full sm:w-auto">
            Send
          </Button>
        </form>
      ) : (
        blockedNotice
      )}

      {reportTarget ? (
        <ReportDialog
          key={reportTarget.id}
          action={reportAction}
          targetType="private_message"
          targetId={reportTarget.id}
          title="Anmeld besked"
          coachName={coachName}
          description={
            <p>
              Beskeden fra <strong className="text-ink">{other.name}</strong>: “{reportTarget.text}”
            </p>
          }
          onClose={() => setReportTarget(null)}
        />
      ) : null}
    </section>
  );
}
