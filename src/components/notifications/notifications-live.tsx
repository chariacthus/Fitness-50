"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Refreshes the notification list when a new notification arrives
 * (Supabase Realtime, only the viewer's own rows) and announces it.
 */
export function NotificationsLive({ userId }: { userId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifikationer-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => {
        setMessage("Du har fået en ny notifikation. Listen er opdateret.");
        router.refresh();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router, userId]);

  return (
    <p aria-live="polite" role="status" className="sr-only">
      {message}
    </p>
  );
}
