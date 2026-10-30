import type { Metadata } from "next";
import { requireViewer } from "@/lib/auth";
import { formatMessageTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { safeRelativeLink } from "@/lib/messages/links";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { EmptyState, PageHeader } from "@/components/ui/layout";
import { NotificationsLive } from "@/components/notifications/notifications-live";
import { MarkAllReadForm, NotificationActions } from "./notification-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Notifikationer" };

export default async function NotificationsPage() {
  const viewer = await requireViewer("/notifikationer");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, title, body, link, read_at, created_at")
    .eq("user_id", viewer.userId)
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = data ?? [];
  const unreadCount = rows.filter((n) => !n.read_at).length;

  return (
    <>
      <PageHeader
        title="Notifikationer"
        description={
          unreadCount === 0
            ? "Her samles besked om nye beskeder, opslag, træningsplaner og dit medlemskab."
            : unreadCount === 1
              ? "Du har 1 ulæst notifikation."
              : `Du har ${unreadCount} ulæste notifikationer.`
        }
        actions={unreadCount > 0 ? <MarkAllReadForm /> : null}
      />
      <NotificationsLive userId={viewer.userId} />

      {error ? (
        <Alert tone="danger" title="Notifikationerne kunne ikke hentes">
          Prøv at genindlæse siden om et øjeblik.
        </Alert>
      ) : rows.length === 0 ? (
        <EmptyState title="Du har ingen notifikationer">
          Når der sker noget nyt – fx en ny besked eller en ny træningsplan – kan du se det her.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {rows.map((n) => {
            const unread = !n.read_at;
            return (
              <li key={n.id} className={cn("space-y-3 px-4 py-5 sm:px-6", unread && "border-l-4 border-l-brand bg-brand-soft")}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {unread ? <Badge tone="brand">Ny</Badge> : null}
                  <h2 className="text-lg font-semibold">{n.title}</h2>
                </div>
                {n.body ? <p className="max-w-prose break-words">{n.body}</p> : null}
                <p className="text-ink-soft">
                  <time dateTime={n.created_at}>{formatMessageTime(n.created_at)}</time>
                  {unread ? null : <span> · Læst</span>}
                </p>
                <NotificationActions id={n.id} title={n.title} canOpen={Boolean(safeRelativeLink(n.link))} unread={unread} />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
