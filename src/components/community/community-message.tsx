"use client";

import Link from "next/link";
import { formatMessageTime } from "@/lib/format";
import type { ChatAuthor, CommunityMessage } from "@/lib/community/types";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CoachBadge } from "@/components/ui/coach-badge";
import { cn } from "@/components/ui/cn";
import { ConfirmButton } from "@/components/ui/confirm-button";

/** Light outline so message actions look like buttons without shouting. */
export const MESSAGE_ACTION_CLASS = "border border-line bg-surface";
/** Same look for the ConfirmButton trigger, which takes no className. */
export const MESSAGE_CONFIRM_WRAPPER_CLASS = "contents [&>button]:border [&>button]:border-line [&>button]:bg-surface";

export const FORMER_MEMBER: ChatAuthor = { id: "", name: "Tidligere medlem", avatarUrl: null, isCoach: false };

export function authorFor(message: { author_id: string | null }, authors: Record<string, ChatAuthor>): ChatAuthor {
  if (!message.author_id) return FORMER_MEMBER;
  return authors[message.author_id] ?? { id: message.author_id, name: "Medlem", avatarUrl: null, isCoach: false };
}

type Props = {
  message: CommunityMessage;
  author: ChatAuthor;
  imageUrl: string | null;
  quote: { authorName: string; text: string } | null;
  isOwn: boolean;
  coachBadgeLabel: string;
  onReply: () => void;
  onDelete: () => void;
  onReport: () => void;
  deleting: boolean;
};

export function CommunityMessageItem({ message, author, imageUrl, quote, isOwn, coachBadgeLabel, onReply, onDelete, onReport, deleting }: Props) {
  const deleted = Boolean(message.deleted_at);
  const system = message.is_system;
  const nameId = `besked-${message.id}-navn`;

  return (
    <article
      aria-labelledby={nameId}
      className={cn("flex gap-3 sm:gap-4", system && !deleted && "rounded-lg border border-brand-line bg-brand-soft p-4")}
    >
      <Avatar name={author.name} src={author.avatarUrl} className="mt-1" />
      <div className="min-w-0 flex-1 space-y-2">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {author.id ? (
            <Link
              id={nameId}
              href={`/medlemmer/${author.id}`}
              className="text-lg font-semibold text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
            >
              {author.name}
            </Link>
          ) : (
            <span id={nameId} className="text-lg font-semibold">
              {author.name}
            </span>
          )}
          {author.isCoach ? <CoachBadge label={coachBadgeLabel} /> : null}
          <time dateTime={message.created_at} className="text-ink-soft" suppressHydrationWarning>
            {formatMessageTime(message.created_at)}
          </time>
          {message.edited_at && !deleted ? <span className="text-ink-soft">(redigeret)</span> : null}
        </header>

        {system && !deleted ? <p className="font-semibold text-brand-strong">Velkomstbesked</p> : null}

        {quote ? (
          <div className="rounded-md border-l-4 border-line-strong bg-muted px-3 py-2">
            <p className="font-semibold">Svar til {quote.authorName}</p>
            <p className="break-words text-ink-soft">{quote.text}</p>
          </div>
        ) : null}

        {deleted ? (
          <p className="italic text-ink-soft">Beskeden er slettet</p>
        ) : (
          <>
            {message.body.trim() ? <p className="whitespace-pre-wrap break-words">{message.body}</p> : null}
            {message.image_path ? (
              imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from a private bucket
                <img
                  src={imageUrl}
                  alt={`Billede fra ${author.name}`}
                  loading="lazy"
                  className="max-h-[28rem] w-auto max-w-full rounded-md border border-line"
                />
              ) : (
                <p className="text-ink-soft">Billedet kunne ikke vises. Prøv at genindlæse siden.</p>
              )
            ) : null}
          </>
        )}

        {!deleted ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="ghost" className={MESSAGE_ACTION_CLASS} onClick={onReply}>
              Svar<span className="sr-only"> til {author.name}</span>
            </Button>
            {isOwn && !system ? (
              <span className={MESSAGE_CONFIRM_WRAPPER_CLASS}>
                <ConfirmButton
                  title="Vil du slette beskeden?"
                  description="Beskeden fjernes for alle i fællesskabet. Det kan ikke fortrydes."
                  confirmLabel="Ja, slet beskeden"
                  triggerVariant="ghost"
                  onConfirm={onDelete}
                  disabled={deleting}
                >
                  {deleting ? "Sletter…" : "Slet"}
                  <span className="sr-only"> din besked</span>
                </ConfirmButton>
              </span>
            ) : null}
            {!isOwn && !system && !author.isCoach ? (
              <Button variant="ghost" className={MESSAGE_ACTION_CLASS} onClick={onReport}>
                Anmeld<span className="sr-only"> beskeden fra {author.name}</span>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
