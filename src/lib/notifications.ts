import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TablesInsert } from "@/lib/database.types";

export type NotificationType = TablesInsert<"notifications">["type"];

type NotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  /** Never put sensitive details (health, message text) here. */
  body?: string;
  link?: string;
  data?: Record<string, string | number | boolean | null>;
};

/** Creates an in-app notification. Returns false if it could not be saved. */
export async function notifyUser(input: NotificationInput) {
  const admin = createAdminClient();
  const { error } = await admin.from("notifications").insert({
    user_id: input.userId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    link: input.link ?? null,
    data: input.data ?? {},
  });
  return !error;
}

/** Notifies every administrator. */
export async function notifyAdmins(input: Omit<NotificationInput, "userId">) {
  const admin = createAdminClient();
  const { error } = await admin.rpc("_notify_admins", {
    p_type: input.type,
    p_title: input.title,
    p_body: input.body ?? "",
    p_link: input.link ?? "/admin",
    p_data: input.data ?? {},
  });
  return !error;
}
