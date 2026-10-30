"use client";

import { useId, useRef, useState } from "react";
import { uploadFile, type UploadProgress } from "@/lib/upload-client";
import { formatFileSize, isAllowedImage, isAllowedVideo, fileExtension, type BucketName } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export type UploadedFile = { path: string; mimeType: string; size: number; kind: "image" | "video"; name: string };

/**
 * Accessible file picker + upload with a real progress bar.
 * Validates type and size before uploading; reports the real outcome.
 */
export function FileUpload({
  label,
  hint,
  bucket,
  folder,
  accept = "image",
  maxBytes,
  onUploaded,
  disabled,
}: {
  label: string;
  hint?: string;
  bucket: BucketName;
  /** Object path prefix, e.g. the user id (required by RLS for avatars/community). */
  folder: string;
  accept?: "image" | "video" | "both";
  maxBytes: number;
  onUploaded: (file: UploadedFile) => void | Promise<void>;
  disabled?: boolean;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const acceptAttr =
    accept === "image"
      ? "image/jpeg,image/png,image/webp"
      : accept === "video"
        ? "video/mp4,video/webm,video/quicktime"
        : "image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime";

  async function handleFile(file: File) {
    setError(null);
    setDone(null);
    const isImage = isAllowedImage(file.type);
    const isVideo = isAllowedVideo(file.type);
    if ((accept === "image" && !isImage) || (accept === "video" && !isVideo) || (!isImage && !isVideo)) {
      setError(
        accept === "image"
          ? "Vælg et billede i formatet JPG, PNG eller WebP."
          : accept === "video"
            ? "Vælg en video i formatet MP4, WebM eller MOV."
            : "Vælg et billede (JPG, PNG, WebP) eller en video (MP4, WebM, MOV).",
      );
      return;
    }
    if (file.size > maxBytes) {
      setError(`Filen fylder ${formatFileSize(file.size)}. Den må højst fylde ${formatFileSize(maxBytes)}.`);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setProgress({ uploaded: 0, total: file.size, percent: 0 });
    try {
      const path = `${folder}/${crypto.randomUUID()}.${fileExtension(file.type)}`;
      await uploadFile({ bucket, path, file, onProgress: setProgress, signal: controller.signal });
      await onUploaded({ path, mimeType: file.type, size: file.size, kind: isVideo ? "video" : "image", name: file.name });
      setDone(`${file.name} er uploadet.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload mislykkedes. Prøv igen.");
    } finally {
      setProgress(null);
      abortRef.current = null;
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <label htmlFor={inputId} className="block font-semibold">
        {label}
      </label>
      {hint ? <p className="text-ink-soft">{hint}</p> : null}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={acceptAttr}
        disabled={disabled || progress !== null}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
        className="block w-full rounded-md border-2 border-dashed border-line-strong bg-surface p-3 text-base file:mr-4 file:min-h-11 file:cursor-pointer file:rounded-md file:border-0 file:bg-brand file:px-4 file:font-semibold file:text-white"
      />
      {progress ? (
        <div className="space-y-2">
          <div
            role="progressbar"
            aria-label="Upload"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
            className="h-4 w-full overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full bg-brand transition-all" style={{ width: `${progress.percent}%` }} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p aria-live="polite">
              Uploader… {progress.percent}% ({formatFileSize(progress.uploaded)} af {formatFileSize(progress.total)})
            </p>
            <Button variant="ghost" size="sm" onClick={() => abortRef.current?.abort()}>
              Annuller upload
            </Button>
          </div>
        </div>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {done ? (
        <Alert tone="success" title={null}>
          {done}
        </Alert>
      ) : null}
    </div>
  );
}
