import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isEntitledState, parseMembershipSummary, type MembershipSummary } from "@/lib/membership";
import type { Tables } from "@/lib/database.types";

export type Viewer = {
  userId: string;
  email: string | null;
  profile: Tables<"profiles">;
  isAdmin: boolean;
  membership: MembershipSummary;
  isEntitled: boolean;
};

/** Verified id of the logged-in user (validates the JWT), or null. Cached per request. */
export const getUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub;
});

/** Everything the UI needs about the logged-in user. Cached per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const userId = await getUserId();
  if (!userId) return null;
  const supabase = await createClient();

  const [{ data: userData }, { data: profile }, { data: isAdmin }, { data: summary }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.rpc("is_admin"),
    supabase.rpc("membership_summary"),
  ]);
  if (!profile) return null;

  const membership = parseMembershipSummary(summary);
  return {
    userId,
    email: userData.user?.email ?? null,
    profile,
    isAdmin: Boolean(isAdmin),
    membership,
    isEntitled: isEntitledState(membership.state),
  };
});

function loginUrl(next?: string) {
  return next ? `/log-ind?next=${encodeURIComponent(next)}` : "/log-ind";
}

/** Requires a logged-in user; redirects to the login page otherwise. */
export async function requireViewer(next?: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(loginUrl(next));
  return viewer;
}

/** Requires an active (entitled) membership; otherwise sends the user to the membership page. */
export async function requireEntitledViewer(next?: string): Promise<Viewer> {
  const viewer = await requireViewer(next);
  if (!viewer.isEntitled) redirect("/bliv-medlem?krav=medlemskab");
  return viewer;
}

/** Requires an administrator. Non-admins are sent to their dashboard. */
export async function requireAdmin(next?: string): Promise<Viewer> {
  const viewer = await requireViewer(next);
  if (!viewer.isAdmin) redirect("/hjem");
  return viewer;
}

/** For server actions: returns the viewer or null without redirecting. */
export async function getAdminOrNull(): Promise<Viewer | null> {
  const viewer = await getViewer();
  return viewer?.isAdmin ? viewer : null;
}
