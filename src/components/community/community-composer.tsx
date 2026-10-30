"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { BUCKETS, DEFAULT_LIMITS } from "@/lib/storage";
import { removeUploadedFile } from "@/lib/upload-client";
import { MESSAGE_MAX_LENGTH } from "@/lib/messages/text";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextareaField } from "@/components/ui/form";
import { Spinner } from "@/components/ui/spinner";
import { FileUpload } from "@/components/upload/file-upload";

export type ReplyDraft = { id: string; authorName: string; text: string };

type Props = {
  viewerId: string;
  replyTo: ReplyDraft | null;
  onCancelReply: () => void;
  /** Saves the message. Resolves to a Danish error message, or null when it was saved. */
  onSend: (body: string, imagePath: string | null) => Promise<string | null>;
  /** Changes whenever the composer should take focus (e.g. after "Svar"). */
  focusSignal: number;
};

/** Message box for the community: text, optional image, reply preview. */
export function CommunityComposer({ viewerId, replyTo, onCancelReply, onSend, focusSignal }: Props) {
  const textareaId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [body, setBody] = useState("");
  const [image, setImage] = useState<{ path: string; previewUrl: string | null } | null>(null);
  const [uploadKey, setUploadKey] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    if (focusSignal > 0) document.getElementById(textareaId)?.focus();
  }, [focusSignal, textareaId]);

  async function handleUploaded(file: { path: string }) {
    const { data } = await createClient().storage.from(BUCKETS.community).createSignedUrl(file.path, 60 * 60);
    setImage({ path: file.path, previewUrl: data?.signedUrl ?? null });
  }

  async function removeImage() {
    if (!image) return;
    const path = image.path;
    setImage(null);
    setUploadKey((k) => k + 1);
    // Best effort: the file was never attached to a message.
    await removeUploadedFile(BUCKETS.community, path);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    setError(null);
    const text = body.trim();
    if (!text && !image) {
      setFieldError("Skriv en besked eller vælg et billede, før du sender.");
      return;
    }
    if (text.length > MESSAGE_MAX_LENGTH) {
      setFieldError(`Beskeden må højst være ${MESSAGE_MAX_LENGTH} tegn.`);
      return;
    }
    setFieldError(null);
    setSending(true);
    const failure = await onSend(text, image?.path ?? null);
    setSending(false);
    if (failure) {
      // Keep the text and image so nothing is lost.
      setError(failure);
      return;
    }
    setBody("");
    setImage(null);
    setUploadKey((k) => k + 1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter makes a new line; Ctrl+Enter (Cmd+Enter on Mac) sends.
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-line bg-surface p-4 sm:p-6" noValidate>
      {replyTo ? (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border-l-4 border-brand bg-brand-soft px-4 py-3">
          <div className="min-w-0">
            <p className="font-semibold">Du svarer {replyTo.authorName}</p>
            <p className="break-words text-ink-soft">{replyTo.text}</p>
          </div>
          <Button variant="ghost" className="border border-line bg-surface" onClick={onCancelReply}>
            Fortryd svar
          </Button>
        </div>
      ) : null}

      <TextareaField
        id={textareaId}
        name="body"
        label="Skriv en besked til fællesskabet"
        hint="Enter giver en ny linje. Tryk Ctrl+Enter (Cmd+Enter på Mac) eller knappen Send for at sende."
        rows={4}
        maxLength={MESSAGE_MAX_LENGTH}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        error={fieldError ?? undefined}
      />

      {image ? (
        <div className="space-y-3">
          <p className="font-semibold">Billede, der sendes med beskeden</p>
          {image.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from a private bucket
            <img src={image.previewUrl} alt="Forhåndsvisning af dit billede" className="max-h-64 w-auto max-w-full rounded-md border border-line" />
          ) : (
            <p className="text-ink-soft">Billedet er uploadet, men forhåndsvisningen kunne ikke hentes.</p>
          )}
          <Button variant="ghost" className="border border-line bg-surface" onClick={() => void removeImage()} disabled={sending}>
            Fjern billedet
          </Button>
        </div>
      ) : (
        <FileUpload
          key={uploadKey}
          label="Tilføj et billede (valgfrit)"
          hint="JPG, PNG eller WebP. Billedet kan ses af alle i fællesskabet."
          bucket={BUCKETS.community}
          folder={viewerId}
          accept="image"
          maxBytes={DEFAULT_LIMITS.imageBytes}
          onUploaded={handleUploaded}
          disabled={sending}
        />
      )}

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Button type="submit" size="lg" disabled={sending} aria-disabled={sending} className="w-full sm:w-auto">
        {sending ? <Spinner label="Sender…" /> : "Send"}
      </Button>
    </form>
  );
}
