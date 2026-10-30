"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, zodFieldErrors } from "@/lib/action-result";
import { getAdminOrNull } from "@/lib/auth";
import { BUCKETS } from "@/lib/storage";
import { getStripe } from "@/lib/stripe/client";
import { describeStripeError, isMissingResource } from "@/lib/stripe/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { removeStorageFolder } from "@/lib/profile/storage-cleanup";
import { CHECK_FIELDS, failForm, NOT_ADMIN, readText, readValues, type FormState } from "@/lib/profile/form-state";

const idSchema = z.guid("Anmodningen blev ikke fundet.");
const rejectSchema = z.object({
  id: idSchema,
  note: z.string().trim().min(1, "Skriv kort, hvorfor anmodningen afvises.").max(1000, "Begrundelsen må højst være 1.000 tegn."),
});

// Subscription statuses that can still charge the member or be resumed.
const ENDED_STATUSES = ["canceled", "incomplete_expired"];

function revalidateRequests() {
  revalidatePath("/admin/anmodninger");
  revalidatePath("/admin");
}

/**
 * "Gennemfør sletning": cancels the member's subscriptions in Stripe at once,
 * removes his files, marks the request completed and deletes the account
 * (the database removes everything that belongs to it). Payment records stay
 * with Stripe, as bookkeeping law requires.
 */
export async function completeDeletion(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await getAdminOrNull();
  if (!admin) return failForm(NOT_ADMIN);
  const id = idSchema.safeParse(readText(formData, "id"));
  if (!id.success) return failForm("Anmodningen blev ikke fundet. Genindlæs siden, og prøv igen.");

  const supabase = await createClient();
  const { data: request, error: requestError } = await supabase
    .from("data_requests")
    .select("id, user_id, type, status")
    .eq("id", id.data)
    .maybeSingle();
  if (requestError) return failForm(dbErrorMessage(requestError, "Anmodningen kunne ikke hentes. Prøv igen."));
  if (!request || request.type !== "deletion") return failForm("Anmodningen blev ikke fundet.");
  if (request.status !== "pending") return failForm("Anmodningen er allerede behandlet.");

  const service = createAdminClient();
  const now = new Date().toISOString();
  const markCompleted = () =>
    service
      .from("data_requests")
      .update({ status: "completed", handled_by: admin.userId, completed_at: now })
      .eq("id", request.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

  const uid = request.user_id;
  if (!uid) {
    const { error } = await markCompleted();
    revalidateRequests();
    if (error) return failForm(dbErrorMessage(error, "Anmodningen kunne ikke markeres som gennemført. Prøv igen."));
    return { ok: true, message: "Kontoen var allerede slettet. Anmodningen er markeret som gennemført." };
  }
  if (uid === admin.userId) return failForm("Du kan ikke slette din egen administratorkonto herfra.");
  const { data: targetRole, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", uid)
    .eq("role", "admin")
    .maybeSingle();
  if (roleError) return failForm(dbErrorMessage(roleError, "Kontoen kunne ikke kontrolleres. Prøv igen."));
  if (targetRole) return failForm("Kontoen tilhører en administrator. Fjern administratorrollen, før kontoen kan slettes.");

  // 1. Stop all payments first – nothing is deleted if this fails.
  const { data: subscriptions, error: subsError } = await service
    .from("subscriptions")
    .select("id, provider, provider_subscription_id, status")
    .eq("user_id", uid);
  if (subsError) return failForm(dbErrorMessage(subsError, "Medlemmets abonnementer kunne ikke hentes. Intet er slettet."));
  const running = (subscriptions ?? []).filter((s) => !ENDED_STATUSES.includes(s.status));
  if (running.some((s) => s.provider !== "stripe")) {
    return failForm("Medlemmet har et abonnement, der ikke kører gennem Stripe. Stop det hos betalingsudbyderen først. Intet er slettet.");
  }
  if (running.length > 0) {
    const stripe = getStripe();
    if (!stripe) {
      return failForm("Medlemmet har et aktivt abonnement, men Stripe er ikke sat op, så det kan ikke stoppes herfra. Intet er slettet.");
    }
    for (const sub of running) {
      try {
        await stripe.subscriptions.cancel(sub.provider_subscription_id);
      } catch (error) {
        // Already gone in Stripe (e.g. other mode): nothing more will be charged.
        if (isMissingResource(error)) continue;
        console.error("[admin] cancel subscription before deletion:", describeStripeError(error));
        return failForm("Abonnementet kunne ikke stoppes hos Stripe. Prøv igen om lidt. Intet er slettet.");
      }
    }
  }

  // 2. Messages and uploaded files (the database rows go with the account).
  const [communityRes, privateRes] = await Promise.all([
    service.from("community_messages").delete().eq("author_id", uid),
    service.from("private_messages").delete().eq("sender_id", uid),
  ]);
  if (communityRes.error || privateRes.error) {
    return failForm(
      `Abonnementet er stoppet${running.length ? "" : " (der var intet aktivt)"}, men medlemmets beskeder kunne ikke slettes. Kontoen er ikke slettet – prøv igen.`,
    );
  }
  const [avatarsOk, communityOk] = await Promise.all([
    removeStorageFolder(service, BUCKETS.avatars, uid),
    removeStorageFolder(service, BUCKETS.community, uid),
  ]);
  if (!avatarsOk || !communityOk) {
    return failForm("Medlemmets billeder kunne ikke slettes fra lageret. Kontoen er ikke slettet – prøv igen om lidt.");
  }

  // 3. Mark the request completed before the account (and its id) disappears.
  const { data: marked, error: markError } = await markCompleted();
  if (markError || !marked) {
    return failForm(dbErrorMessage(markError, "Anmodningen kunne ikke markeres som gennemført. Kontoen er ikke slettet – prøv igen."));
  }

  // 4. Delete the account. All rows that belong to it are removed by the database.
  const { error: deleteError } = await service.auth.admin.deleteUser(uid);
  if (deleteError) {
    console.error("[admin] deleteUser failed:", deleteError.status, deleteError.message);
    await service.from("data_requests").update({ status: "pending", handled_by: null, completed_at: null }).eq("id", request.id);
    revalidateRequests();
    return failForm("Abonnement, beskeder og billeder er fjernet, men selve kontoen kunne ikke slettes. Anmodningen venter stadig – prøv igen.");
  }

  revalidateRequests();
  revalidatePath("/admin/medlemmer");
  return {
    ok: true,
    message: `Kontoen er slettet.${running.length ? ` ${running.length === 1 ? "Abonnementet er" : `${running.length} abonnementer er`} stoppet hos Stripe.` : ""} Betalingsoplysningerne er stadig gemt hos Stripe.`,
  };
}

/** "Afvis" with a short reason. */
export async function rejectRequest(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await getAdminOrNull();
  if (!admin) return failForm(NOT_ADMIN);
  const values = readValues(formData, ["note"]);
  const parsed = rejectSchema.safeParse({ id: readText(formData, "id"), note: values.note });
  if (!parsed.success) return failForm(CHECK_FIELDS, zodFieldErrors(parsed.error.issues), values);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("data_requests")
    .update({ status: "rejected", note: parsed.data.note, handled_by: admin.userId, completed_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) return failForm(dbErrorMessage(error, "Anmodningen kunne ikke afvises. Prøv igen."), undefined, values);
  if (!data) return failForm("Anmodningen er allerede behandlet eller annulleret.", undefined, values);
  revalidateRequests();
  return { ok: true, message: "Anmodningen er afvist." };
}

/** "Markér som håndteret" for an export request. */
export async function markRequestHandled(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await getAdminOrNull();
  if (!admin) return failForm(NOT_ADMIN);
  const id = idSchema.safeParse(readText(formData, "id"));
  if (!id.success) return failForm("Anmodningen blev ikke fundet. Genindlæs siden, og prøv igen.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("data_requests")
    .update({ status: "completed", handled_by: admin.userId, completed_at: new Date().toISOString() })
    .eq("id", id.data)
    .eq("type", "export")
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) return failForm(dbErrorMessage(error, "Anmodningen kunne ikke opdateres. Prøv igen."));
  if (!data) return failForm("Anmodningen er allerede behandlet eller annulleret.");
  revalidateRequests();
  return { ok: true, message: "Anmodningen er markeret som håndteret." };
}
