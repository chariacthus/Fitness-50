import type { AnnouncementMediaItem } from "@/lib/announcements/queries";
import { paragraphs } from "@/lib/announcements/text";

export type AnnouncementContentData = {
  body: string;
  video_title: string | null;
  video_description: string | null;
  location_name: string | null;
  location_address: string | null;
  map_url: string | null;
};

/** Body text, images, videos and place of one announcement. Read-only – there are no comments or replies. */
export function AnnouncementContent({
  announcement,
  media,
  coachName,
}: {
  announcement: AnnouncementContentData;
  media: AnnouncementMediaItem[];
  coachName: string;
}) {
  const text = paragraphs(announcement.body);
  const images = media.filter((m) => m.kind === "image" && m.url);
  const videos = media.filter((m) => m.kind === "video" && m.url);
  const missing = media.some((m) => !m.url);
  const hasPlace = Boolean(announcement.location_name || announcement.location_address || announcement.map_url);

  return (
    <div className="space-y-8">
      {text.length > 0 ? (
        <div className="max-w-prose space-y-5 text-lg leading-relaxed">
          {text.map((p, i) => (
            <p key={i} className="whitespace-pre-line">
              {p}
            </p>
          ))}
        </div>
      ) : null}

      {images.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {images.map((image) => (
            <figure key={image.id} className={images.length === 1 ? "sm:col-span-2" : undefined}>
              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
              <img
                src={image.url ?? ""}
                alt={image.title || `Billede fra ${coachName}`}
                loading="lazy"
                className="h-auto w-full rounded-md border border-line bg-muted"
              />
            </figure>
          ))}
        </div>
      ) : null}

      {videos.map((video, i) => (
        <figure key={video.id} className="space-y-3">
          <video controls playsInline preload="metadata" className="w-full rounded-md" src={video.url ?? undefined}>
            Din browser kan ikke afspille videoen.
          </video>
          {i === 0 && (announcement.video_title || announcement.video_description) ? (
            <figcaption className="space-y-1">
              {announcement.video_title ? <span className="block text-xl font-semibold">{announcement.video_title}</span> : null}
              {announcement.video_description ? (
                <span className="block whitespace-pre-line text-ink-soft">{announcement.video_description}</span>
              ) : null}
            </figcaption>
          ) : null}
        </figure>
      ))}

      {missing ? <p className="text-ink-soft">Nogle billeder eller videoer kunne ikke hentes lige nu. Prøv at genindlæse siden.</p> : null}

      {hasPlace ? (
        <section aria-labelledby="sted-titel" className="max-w-prose space-y-2 rounded-lg border border-line bg-surface p-5">
          <h2 id="sted-titel" className="text-xl font-semibold">
            Sted
          </h2>
          {announcement.location_name ? <p className="text-lg font-semibold">{announcement.location_name}</p> : null}
          {announcement.location_address ? <p className="whitespace-pre-line text-lg">{announcement.location_address}</p> : null}
          {announcement.map_url ? (
            <p>
              <a
                href={announcement.map_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4"
              >
                Se stedet på et kort (åbner i et nyt vindue)
              </a>
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
