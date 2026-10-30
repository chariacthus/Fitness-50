"use client";

import { useActionState, useEffect, useRef } from "react";
import { fieldChecked, fieldError, fieldValue, initialFormState } from "@/lib/profile/form-state";
import { CheckboxField, TextareaField, TextField } from "@/components/ui/form";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveAnnouncement } from "./actions";

export type EditorValues = {
  id: string;
  status: string;
  title: string;
  body: string;
  video_title: string | null;
  video_description: string | null;
  location_name: string | null;
  location_address: string | null;
  map_url: string | null;
  is_pinned: boolean;
  is_important: boolean;
  /** datetime-local value in Copenhagen time ("" when not set). */
  published_at_local: string;
};

/** The announcement editor: text, video caption, place, options and the save/publish buttons. */
export function AnnouncementEditorForm({ announcement }: { announcement: EditorValues }) {
  const [state, action] = useActionState(saveAnnouncement, initialFormState);
  const formRef = useRef<HTMLFormElement>(null);
  const isPublished = announcement.status === "published";

  useEffect(() => {
    if (!state.ok && state.fieldErrors && Object.keys(state.fieldErrors).length > 0) {
      formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
    }
  }, [state]);

  const text = (name: keyof EditorValues) => fieldValue(state, name, announcement[name] as string | null);

  return (
    <form ref={formRef} action={action} className="space-y-8">
      <input type="hidden" name="id" value={announcement.id} />

      <fieldset className="space-y-6">
        <legend className="sr-only">Tekst</legend>
        <TextField name="title" label="Overskrift" required maxLength={200} defaultValue={text("title")} error={fieldError(state, "title")} />
        <TextareaField
          name="body"
          label="Tekst"
          optional
          rows={12}
          maxLength={20000}
          hint="Lav en tom linje mellem afsnit. Linjeskift bliver vist, som du skriver dem."
          defaultValue={text("body")}
          error={fieldError(state, "body")}
        />
      </fieldset>

      <fieldset className="space-y-6 border-t border-line pt-6">
        <legend className="text-xl font-semibold">Video</legend>
        <p className="text-ink-soft">Udfyld kun, hvis du har tilføjet en video nedenfor. Teksten vises under videoen.</p>
        <TextField
          name="video_title"
          label="Videoens titel"
          optional
          maxLength={200}
          defaultValue={text("video_title")}
          error={fieldError(state, "video_title")}
        />
        <TextareaField
          name="video_description"
          label="Beskrivelse af videoen"
          optional
          rows={3}
          maxLength={2000}
          defaultValue={text("video_description")}
          error={fieldError(state, "video_description")}
        />
      </fieldset>

      <fieldset className="space-y-6 border-t border-line pt-6">
        <legend className="text-xl font-semibold">Sted</legend>
        <p className="text-ink-soft">Fx til en fælles træning. Lad felterne stå tomme, hvis opslaget ikke handler om et sted.</p>
        <TextField
          name="location_name"
          label="Stedets navn"
          optional
          maxLength={200}
          defaultValue={text("location_name")}
          error={fieldError(state, "location_name")}
        />
        <TextField
          name="location_address"
          label="Adresse"
          optional
          maxLength={300}
          autoComplete="off"
          defaultValue={text("location_address")}
          error={fieldError(state, "location_address")}
        />
        <TextField
          name="map_url"
          label="Link til kort"
          optional
          type="url"
          inputMode="url"
          maxLength={2000}
          placeholder="https://"
          hint="Kopiér linket fra fx Google Maps. Det skal starte med https://"
          defaultValue={text("map_url")}
          error={fieldError(state, "map_url")}
        />
      </fieldset>

      <fieldset className="space-y-4 border-t border-line pt-6">
        <legend className="text-xl font-semibold">Visning</legend>
        <CheckboxField
          name="is_pinned"
          label="Fastgør øverst på opslagstavlen"
          defaultChecked={fieldChecked(state, "is_pinned", announcement.is_pinned)}
          error={fieldError(state, "is_pinned")}
        />
        <CheckboxField
          name="is_important"
          label="Vigtigt opslag"
          hint="Medlemmerne får en notifikation, når opslaget udgives."
          defaultChecked={fieldChecked(state, "is_important", announcement.is_important)}
          error={fieldError(state, "is_important")}
        />
        <TextField
          name="published_at"
          label="Udgivelsestidspunkt"
          optional
          type="datetime-local"
          hint={
            isPublished
              ? "Dansk tid. Lader du feltet stå tomt, bliver tidspunktet sat til nu, når du gemmer."
              : "Dansk tid. Lad feltet stå tomt for at udgive med det samme. Vælger du et tidspunkt i fremtiden, bliver opslaget først synligt der – og der sendes ikke notifikation, når tidspunktet kommer."
          }
          defaultValue={fieldValue(state, "published_at", announcement.published_at_local)}
          error={fieldError(state, "published_at")}
          className="max-w-md"
        />
      </fieldset>

      <div aria-live="polite">
        <FormMessage state={state} />
      </div>

      <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:flex-wrap">
        {isPublished ? (
          <>
            <SubmitButton name="intent" value="save" size="lg" pendingText="Gemmer…">
              Gem ændringer
            </SubmitButton>
            <SubmitButton name="intent" value="unpublish" variant="secondary" size="lg" pendingText="Afpublicerer…">
              Afpublicér
            </SubmitButton>
          </>
        ) : (
          <>
            {/* "Gem kladde" comes first, so pressing Enter in a field never publishes by accident. */}
            <SubmitButton name="intent" value="save" variant="secondary" size="lg" pendingText="Gemmer…">
              Gem kladde
            </SubmitButton>
            <SubmitButton name="intent" value="publish" size="lg" pendingText="Udgiver…">
              Udgiv
            </SubmitButton>
          </>
        )}
      </div>
    </form>
  );
}
