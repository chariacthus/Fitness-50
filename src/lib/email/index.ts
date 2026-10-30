import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, type EmailResult } from "@/lib/email/send";

export { sendEmail } from "@/lib/email/send";
export * from "@/lib/email/templates";

/**
 * Sends an email to a member if application emails are enabled in admin
 * settings and the member has not opted out. Returns the real outcome.
 */
export async function emailMember(
  userId: string,
  build: (brand: { businessName: string; brandColor: string; coachName: string }, name: string) => { subject: string; html: string; text: string },
): Promise<EmailResult | { sent: false; reason: "disabled" | "opted_out" | "no_address" }> {
  const admin = createAdminClient();
  const [{ data: settings }, { data: adminSettings }, { data: privateRow }, { data: profile }] = await Promise.all([
    admin.from("site_settings").select("business_name, brand_color, coach_name").eq("id", 1).maybeSingle(),
    admin.from("admin_settings").select("email_notifications_enabled").eq("id", 1).maybeSingle(),
    admin.from("profile_private").select("email, email_notifications").eq("user_id", userId).maybeSingle(),
    admin.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
  ]);
  if (!adminSettings?.email_notifications_enabled) return { sent: false, reason: "disabled" };
  if (!privateRow?.email) return { sent: false, reason: "no_address" };
  if (privateRow.email_notifications === false) return { sent: false, reason: "opted_out" };
  const brand = {
    businessName: settings?.business_name ?? "Stærk50",
    brandColor: settings?.brand_color ?? "#4F5D3A",
    coachName: settings?.coach_name ?? "Christian",
  };
  const first = (profile?.full_name ?? "").trim().split(/\s+/)[0] ?? "";
  const email = build(brand, first);
  return sendEmail({ to: privateRow.email, ...email });
}
