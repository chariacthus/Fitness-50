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

/** Verified claims of the logged-in user (validates the JWT), or null. Cached per request. */
const getClaims = cache(async (): Promise<{ sub: string; email: string | null } | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return { sub: data.claims.sub, email: typeof data.claims.email === "string" ? data.claims.email : null };
});

/** Verified id of the logged-in user, or null. Cached per request. */
export const getUserId = cache(async (): Promise<string | null> => (await getClaims())?.sub ?? null);

/** Everything the UI needs about the logged-in user. Cached per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const claims = await getClaims();
  if (!claims) return null;
  const userId = claims.sub;
  const supabase = await createClient();

  // The e-mail comes from the verified token – no extra round trip to the auth server.
  const [{ data: profile }, { data: isAdmin }, { data: summary }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.rpc("is_admin"),
    supabase.rpc("membership_summary"),
  ]);
  if (!profile) return null;

  const membership = parseMembershipSummary(summary);
  return {
    userId,
    email: claims.email,
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
