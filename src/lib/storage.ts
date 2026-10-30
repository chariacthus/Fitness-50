// Storage buckets and upload limits shared by client and server code.

export const BUCKETS = {
  avatars: "avatars",
  community: "community",
  announcements: "announcements",
  trainingMedia: "training-media",
  site: "site",
} as const;

export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS];

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;

export const MB = 1024 * 1024;
// Defaults; administrators can lower them in settings. The Supabase Free plan
// never allows more than 50 MB per file.
export const DEFAULT_LIMITS = {
  avatarBytes: 5 * MB,
  imageBytes: 10 * MB,
  videoBytes: 50 * MB,
} as const;

export function isAllowedImage(type: string) {
  return (IMAGE_TYPES as readonly string[]).includes(type);
}

export function isAllowedVideo(type: string) {
  return (VIDEO_TYPES as readonly string[]).includes(type);
}

export function fileExtension(type: string) {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
  };
  return map[type] ?? "bin";
}

/** Random object path inside the user's own folder: "<userId>/<uuid>.<ext>". */
export function userObjectPath(userId: string, mimeType: string) {
  return `${userId}/${crypto.randomUUID()}.${fileExtension(mimeType)}`;
}

export function formatFileSize(bytes: number) {
  if (bytes >= MB) return `${(bytes / MB).toLocaleString("da-DK", { maximumFractionDigits: 1 })} MB`;
  return `${Math.ceil(bytes / 1024).toLocaleString("da-DK")} KB`;
}
