import Link from "next/link";
import { formatDate } from "@/lib/format";
import { excerpt } from "@/lib/announcements/text";
import { Badge } from "@/components/ui/badge";

export type AnnouncementListEntry = {
  id: string;
  title: string;
  body: string;
  published_at: string | null;
  is_pinned: boolean;
  hasVideo: boolean;
  thumbnailUrl: string | null;
};

/** One announcement on the wall: title, date, short preview and the first image. */
export function AnnouncementListItem({ entry }: { entry: AnnouncementListEntry }) {
  const preview = excerpt(entry.body, 220);
  return (
    <article className="flex flex-col gap-5 rounded-lg border border-line bg-surface p-5 sm:flex-row sm:p-6">
      {entry.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL; decorative, the title says what it is
        <img src={entry.thumbnailUrl} alt="" loading="lazy" className="h-40 w-full shrink-0 rounded-md object-cover sm:h-32 sm:w-44" />
      ) : null}
      <div className="min-w-0 flex-1 space-y-2">
        {entry.is_pinned ? (
          <p>
            <Badge tone="brand">Fastgjort</Badge>
          </p>
        ) : null}
        <h2 className="text-2xl font-semibold leading-snug">
          <Link href={`/opslag/${entry.id}`} className="text-ink underline-offset-4 hover:underline">
            {entry.title}
          </Link>
        </h2>
        {entry.published_at ? <p className="text-ink-soft">Udgivet {formatDate(entry.published_at)}</p> : null}
        {preview ? <p className="text-lg">{preview}</p> : null}
        {entry.hasVideo ? <p className="font-semibold text-ink-soft">Indeholder video</p> : null}
        <p>
          <Link href={`/opslag/${entry.id}`} className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4">
            Læs hele opslaget<span className="sr-only">: {entry.title}</span>
          </Link>
        </p>
      </div>
    </article>
  );
}
