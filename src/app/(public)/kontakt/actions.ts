"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage, fail, ok, zodFieldErrors } from "@/lib/action-result";
import { getUserId } from "@/lib/auth";
import { notifyAdmins } from "@/lib/notifications";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { getSiteSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { contactSchema, HONEYPOT_FIELD, type ContactState, type ContactValues } from "./schema";

const SEND_FAILED = "Beskeden kunne ikke sendes. Prøv igen om lidt.";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/**
 * Public contact form. contact_messages has no public insert policy, so the
 * message is stored with the service role – but only after validation,
 * a honeypot check and rate limiting per IP and per e-mail.
 */
export async function sendContactMessage(_prev: ContactState, formData: FormData): Promise<ContactState> {
  const values: ContactValues = {
    name: text(formData, "name"),
    email: text(formData, "email"),
    phone: text(formData, "phone"),
    message: text(formData, "message"),
  };

  // Filled-in honeypot: almost certainly a bot. Nothing is stored.
  if (text(formData, HONEYPOT_FIELD).trim()) {
    return { ...fail(SEND_FAILED), values };
  }

  const parsed = contactSchema.safeParse(values);
  if (!parsed.success) {
    return { ...fail("Tjek de markerede felter, og prøv igen.", zodFieldErrors(parsed.error.issues)), values };
  }
  const input = parsed.data;

  try {
    const ip = await clientIp();
    const [ipAllowed, emailAllowed] = await Promise.all([
      checkRateLimit(`contact:ip:${ip}`, 5, 3600),
      checkRateLimit(`contact:email:${input.email}`, 3, 3600),
    ]);
    if (!ipAllowed || !emailAllowed) {
      return { ...fail("Du har sendt flere beskeder på kort tid. Vent en times tid, og prøv så igen."), values };
    }

    const userId = await getUserId();
    const admin = createAdminClient();
    const { error } = await admin.from("contact_messages").insert({
      name: input.name,
      email: input.email,
      phone: input.phone,
      message: input.message,
      user_id: userId,
    });
    if (error) return { ...fail(dbErrorMessage(error, SEND_FAILED)), values };
  } catch {
    return { ...fail(SEND_FAILED), values };
  }

  // The message is saved. The notification never contains the message text.
  try {
    await notifyAdmins({
      type: "contact",
      title: "Ny kontaktbesked",
      body: `${input.name} har skrevet via kontaktformularen.`,
      link: "/admin/kontakt",
    });
  } catch {
    // The message is stored and visible under /admin/kontakt even if the notification fails.
  }

  revalidatePath("/admin/kontakt");
  const settings = await getSiteSettings();
  return ok(`Tak for din besked. Den er sendt til ${settings.coach_name}, som svarer dig på den e-mail, du har skrevet.`);
}
