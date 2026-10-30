"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { UNREAD_COUNTS_REFRESH_EVENT } from "@/lib/messages/events";
import { MemberBottomNav, MemberSidebarNav, MobileNotificationsLink, type NavCounts } from "@/components/layout/member-nav";

function parseCounts(value: unknown): NavCounts | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  return { notifications: Number(v.notifications ?? 0), messages: Number(v.messages ?? 0), community: Number(v.community ?? 0) };
}

/** Keeps unread badges fresh: on navigation, on window focus and on realtime events. */
function useLiveCounts(initial: NavCounts, userId: string) {
  const [counts, setCounts] = useState(initial);
  const pathname = usePathname();

  const refresh = useCallback(async () => {
    const { data } = await createClient().rpc("unread_counts");
    const parsed = parseCounts(data);
    if (parsed) setCounts(parsed);
  }, []);

  useEffect(() => {
    let active = true;
    createClient()
      .rpc("unread_counts")
      .then(({ data }) => {
        const parsed = parseCounts(data);
        if (active && parsed) setCounts(parsed);
      });
    return () => {
      active = false;
    };
  }, [pathname]);

  useEffect(() => {
    const supabase = createClient();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    // Pages fire this after marking something as read, so badges update at once.
    window.addEventListener(UNREAD_COUNTS_REFRESH_EVENT, onFocus);
    // Unique topic: a channel that is still unsubscribing is otherwise reused
    // on a fast remount, and the new subscription would be lost silently.
    const channel = supabase
      .channel(`nav-counts-${userId}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => void refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "community_messages" }, () => void refresh())
      .subscribe();
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(UNREAD_COUNTS_REFRESH_EVENT, onFocus);
      void supabase.removeChannel(channel);
    };
  }, [refresh, userId]);

  return counts;
}

export function MemberChrome({
  children,
  initialCounts,
  userId,
  isAdmin,
  logo,
  sidebarFooter,
}: {
  children: ReactNode;
  initialCounts: NavCounts;
  userId: string;
  isAdmin: boolean;
  logo: ReactNode;
  sidebarFooter: ReactNode;
}) {
  const counts = useLiveCounts(initialCounts, userId);
  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-line bg-surface px-4 py-6 lg:flex">
        <div className="mb-8 px-3">{logo}</div>
        <MemberSidebarNav counts={counts} isAdmin={isAdmin} />
        <div className="mt-auto pt-8">{sidebarFooter}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-line bg-surface px-4 py-2 lg:hidden">
          {logo}
          <div className="flex items-center gap-1">
            {isAdmin ? (
              <Link href="/admin" className="inline-flex min-h-11 items-center rounded-md px-2 font-semibold text-brand hover:bg-muted">
                Admin
              </Link>
            ) : null}
            <MobileNotificationsLink count={counts.notifications} />
          </div>
        </header>
        <main id="indhold" className="flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>

      <MemberBottomNav counts={counts} />
    </div>
  );
}
