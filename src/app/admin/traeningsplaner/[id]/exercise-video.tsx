"use client";

import { BUCKETS, formatFileSize } from "@/lib/storage";
import { FileUpload } from "@/components/upload/file-upload";
import { ActionForm, FormSelect } from "@/components/admin/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { attachUploadedVideo, chooseExerciseVideo, removeExerciseVideo } from "./actions";

export type VideoChoice = { value: string; label: string };

/** Demonstration video for one exercise: upload a new one, reuse an earlier one, or remove it. */
export function ExerciseVideo({
  exerciseId,
  exerciseName,
  current,
  library,
  maxBytes,
}: {
  exerciseId: string;
  exerciseName: string;
  current: { id: string; title: string; url: string | null } | null;
  library: VideoChoice[];
  maxBytes: number;
}) {
  const choices = library.filter((v) => v.value !== current?.id);
  return (
    <div className="space-y-6">
      {current ? (
        <div className="space-y-3">
          <p>
            Øvelsen viser videoen <strong>{current.title}</strong>.
          </p>
          {current.url ? (
            <p>
              <a
                href={current.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4"
              >
                Se videoen<span className="font-normal">&nbsp;(åbner i en ny fane)</span>
              </a>
            </p>
          ) : null}
          <ActionForm action={removeExerciseVideo} hidden={{ exercise_id: exerciseId }} pendingText="Fjerner videoen…">
            <SubmitButton variant="secondary" size="sm" pendingText="Fjerner…">
              Fjern videoen fra øvelsen<span className="sr-only">: {exerciseName}</span>
            </SubmitButton>
          </ActionForm>
        </div>
      ) : (
        <p className="text-ink-soft">Øvelsen har ingen uploadet video.</p>
      )}

      <FileUpload
        label={current ? "Upload en anden video" : "Upload en video"}
        hint={`MP4, WebM eller MOV. Højst ${formatFileSize(maxBytes)} (Supabase Free-planen tillader højst 50 MB pr. fil).`}
        bucket={BUCKETS.trainingMedia}
        folder="exercises"
        accept="video"
        maxBytes={maxBytes}
        onUploaded={async (file) => {
          const result = await attachUploadedVideo({
            exerciseId,
            path: file.path,
            mimeType: file.mimeType,
            size: file.size,
            name: file.name,
          });
          if (!result.ok) throw new Error(result.error || "Videoen kunne ikke gemmes. Prøv igen.");
        }}
      />

      {choices.length > 0 ? (
        <ActionForm action={chooseExerciseVideo} hidden={{ exercise_id: exerciseId }} pendingText="Gemmer…">
          <FormSelect name="media_id" label="Eller brug en video, du har uploadet før" placeholder="Vælg en video" options={choices} defaultValue="" />
          <SubmitButton variant="secondary">Brug den valgte video</SubmitButton>
        </ActionForm>
      ) : null}
    </div>
  );
}
