"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dbErrorMessage, fail, ok, type ActionResult } from "@/lib/action-result";
import { getUserId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { safeRelativeLink } from "@/lib/messages/links";

const idSchema = z.object({ id: z.guid("Notifikationen blev ikke fundet.") });

const NOT_LOGGED_IN = "Du er ikke logget ind længere. Log ind igen, og prøv på ny.";

/**
 * "Åbn": marks the notification as read and goes to its link. The link is read
 * from the database through Row Level Security (never from the form) and only
 * relative links inside the site are followed.
 */
export async function openNotification(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return fail("Notifikationen blev ikke fundet. Genindlæs siden, og prøv igen.");
  if (!(await getUserId())) return fail(NOT_LOGGED_IN);

  const supabase = await createClient();
  const { data, error } = await supabase.from("notifications").select("id, link").eq("id", parsed.data.id).maybeSingle();
  if (error) return fail(dbErrorMessage(error, "Notifikationen kunne ikke åbnes. Prøv igen."));
  if (!data) return fail("Notifikationen blev ikke fundet. Genindlæs siden, og prøv igen.");

  const link = safeRelativeLink(data.link);
  if (!link) return fail("Denne notifikation har ikke noget at åbne.");

  // Marking as read is a convenience – the member should still get to the content if it fails.
  await supabase.rpc("mark_notifications_read", { p_ids: [data.id] });
  revalidatePath("/notifikationer");
  redirect(link);
}

/** "Markér som læst" for one notification. */
export async function markNotificationRead(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return fail("Notifikationen blev ikke fundet. Genindlæs siden, og prøv igen.");
  if (!(await getUserId())) return fail(NOT_LOGGED_IN);

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notifications_read", { p_ids: [parsed.data.id] });
  if (error) return fail(dbErrorMessage(error, "Notifikationen kunne ikke markeres som læst. Prøv igen."));
  revalidatePath("/notifikationer");
  return ok("Notifikationen er markeret som læst.");
}

/** "Markér alle som læst". */
export async function markAllNotificationsRead(_prev: ActionResult): Promise<ActionResult> {
  if (!(await getUserId())) return fail(NOT_LOGGED_IN);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_notifications_read", {});
  if (error) return fail(dbErrorMessage(error, "Notifikationerne kunne ikke markeres som læst. Prøv igen."));
  revalidatePath("/notifikationer");
  const count = Number(data ?? 0);
  if (count === 0) return ok("Alle notifikationer var allerede læst.");
  return ok(count === 1 ? "1 notifikation er markeret som læst." : `${count} notifikationer er markeret som læst.`);
}
