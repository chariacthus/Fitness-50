"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";

/**
 * Shows `loggedIn` or `loggedOut` depending on the browser session. Lets
 * public pages stay pre-rendered (fast) while still offering "Min side" to
 * members. Reads the session locally – no server round trip.
 */
export function AuthSwitch({ loggedIn, loggedOut }: { loggedIn: ReactNode; loggedOut: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setIsLoggedIn(Boolean(data.session));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setIsLoggedIn(Boolean(session)));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return <>{isLoggedIn ? loggedIn : loggedOut}</>;
}
