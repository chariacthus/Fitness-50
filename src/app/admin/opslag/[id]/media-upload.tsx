"use client";

import { useActionState } from "react";
import { BUCKETS, DEFAULT_LIMITS } from "@/lib/storage";
import { fieldError, fieldValue, initialFormState } from "@/lib/profile/form-state";
import { FileUpload, type UploadedFile } from "@/components/upload/file-upload";
import { TextField } from "@/components/ui/form";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { attachAnnouncementMedia, saveMediaTitle } from "./actions";

/**
 * Uploads straight to announcements/<announcement id>/… and then attaches the
 * file through a server action. Two fields, so the size limit for images
 * (10 MB) and videos (50 MB) is checked before anything is uploaded.
 */
export function AnnouncementMediaUpload({ announcementId }: { announcementId: string }) {
  async function attach(file: UploadedFile) {
    const result = await attachAnnouncementMedia({
      announcementId,
      path: file.path,
      mimeType: file.mimeType,
      size: file.size,
    });
    if (!result.ok) throw new Error(result.error);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <FileUpload
        label="Tilføj billede"
        hint="JPG, PNG eller WebP. Højst 10 MB."
        bucket={BUCKETS.announcements}
        folder={announcementId}
        accept="image"
        maxBytes={DEFAULT_LIMITS.imageBytes}
        onUploaded={attach}
      />
      <FileUpload
        label="Tilføj video"
        hint="MP4, WebM eller MOV. Højst 50 MB."
        bucket={BUCKETS.announcements}
        folder={announcementId}
        accept="video"
        maxBytes={DEFAULT_LIMITS.videoBytes}
        onUploaded={attach}
      />
    </div>
  );
}

/** Description of one image, used as its alternative text. */
export function MediaTitleForm({
  announcementId,
  mediaId,
  title,
  label,
}: {
  announcementId: string;
  mediaId: string;
  title: string | null;
  label: string;
}) {
  const [state, action] = useActionState(saveMediaTitle, initialFormState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="announcementId" value={announcementId} />
      <input type="hidden" name="mediaId" value={mediaId} />
      <TextField
        id={`media-title-${mediaId}`}
        name="title"
        label={label}
        optional
        maxLength={200}
        hint="Beskriv kort, hvad billedet viser. Teksten læses op for medlemmer, der bruger skærmlæser."
        defaultValue={fieldValue(state, "title", title)}
        error={fieldError(state, "title")}
      />
      <SubmitButton variant="secondary" size="sm" pendingText="Gemmer…">
        Gem beskrivelse
      </SubmitButton>
      <div aria-live="polite">
        <FormMessage state={state} />
      </div>
    </form>
  );
}
