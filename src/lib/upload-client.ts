"use client";

import * as tus from "tus-js-client";
import { createClient } from "@/lib/supabase/client";
import { publicEnv } from "@/lib/env";
import type { BucketName } from "@/lib/storage";

export type UploadProgress = { uploaded: number; total: number; percent: number };

/**
 * Resumable (TUS) upload directly from the browser to Supabase Storage.
 * The file is streamed in 6 MB chunks – it never passes through our server.
 * Storage RLS decides whether the logged-in user may write to `bucket/path`.
 * An interrupted chunk is resumed by the automatic retries of this attempt.
 * A new attempt always starts a fresh upload at `path`: a stored earlier
 * upload would finish at its old object path, not at the one we return.
 * https://supabase.com/docs/guides/storage/uploads/resumable-uploads
 */
export async function uploadFile({
  bucket,
  path,
  file,
  onProgress,
  signal,
}: {
  bucket: BucketName;
  path: string;
  file: File;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}): Promise<{ path: string }> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Du er ikke logget ind længere. Log ind igen og prøv på ny.");

  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${publicEnv.supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${token}`,
        apikey: publicEnv.supabasePublishableKey,
        "x-upsert": "false",
      },
      uploadDataDuringCreation: true,
      // Never resume across attempts (see above). Retries within this attempt still resume.
      storeFingerprintForResuming: false,
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: file.type,
        cacheControl: "3600",
      },
      // Supabase requires exactly 6 MB chunks.
      chunkSize: 6 * 1024 * 1024,
      onError(error) {
        reject(new Error(translateUploadError(error)));
      },
      onProgress(uploaded, total) {
        onProgress?.({ uploaded, total, percent: total ? Math.round((uploaded / total) * 100) : 0 });
      },
      onSuccess() {
        resolve({ path });
      },
    });

    signal?.addEventListener("abort", () => {
      void upload.abort(true);
      reject(new Error("Upload annulleret."));
    });

    upload.start();
  });
}

function translateUploadError(error: Error) {
  const message = error.message ?? "";
  if (/413|too large|exceeded|maximum/i.test(message)) return "Filen er for stor.";
  if (/403|unauthor|row-level security|policy/i.test(message)) return "Du har ikke tilladelse til at uploade her.";
  if (/415|mime|type/i.test(message)) return "Filtypen er ikke tilladt.";
  if (/409|exists|duplicate/i.test(message)) return "Der findes allerede en fil med samme navn. Prøv igen.";
  if (/network|failed to fetch|offline/i.test(message)) return "Forbindelsen blev afbrudt. Tjek internetforbindelsen og prøv igen.";
  return "Upload mislykkedes. Prøv igen.";
}

/** Deletes an uploaded object (e.g. when the user removes it before saving). */
export async function removeUploadedFile(bucket: BucketName, path: string) {
  const { error } = await createClient().storage.from(bucket).remove([path]);
  return !error;
}
