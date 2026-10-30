"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dbErrorMessage, fail, ok, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { getUserId, getViewer } from "@/lib/auth";
import { confirmRedirectUrl } from "@/lib/auth-flow/server";
import { authErrorKind } from "@/lib/auth-flow/errors";
import { formatDate } from "@/lib/format";
import { parseMembershipSummary } from "@/lib/membership";
import { accessEndsAt, subscriptionPeriod, unixToIso } from "@/lib/payments/stripe-mapping";
import { checkRateLimit } from "@/lib/rate-limit";
import { BUCKETS } from "@/lib/storage";
import { getStripe } from "@/lib/stripe/client";
import { describeStripeError } from "@/lib/stripe/errors";
import { createCustomerPortalUrl } from "@/lib/stripe/portal";
import { createClient } from "@/lib/supabase/server";
import { CHECK_FIELDS, failForm, NOT_LOGGED_IN, readText, readValues, type FormState } from "@/lib/profile/form-state";
import {
  avatarPathSchema,
  changeEmailSchema,
  changePasswordSchema,
  isOwnAvatarPath,
  PROFILE_FIELDS,
  profileSchema,
  profileAuthErrorMessage,
} from "@/lib/profile/schemas";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const STRIPE_UNAVAILABLE = "Betalingsoplysninger er ikke tilgængelige lige nu. Prøv igen senere, eller kontakt os.";

function revalidateProfile() {
  revalidatePath("/min-profil");
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/** Name, "Om mig", phone and contact preference – the member's own rows through RLS. */
export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const userId = await getUserId();
  if (!userId) return failForm(NOT_LOGGED_IN);

  const values = readValues(formData, PROFILE_FIELDS);
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) return failForm(CHECK_FIELDS, zodFieldErrors(parsed.error.issues), values);

  const supabase = await createClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.full_name, bio: parsed.data.bio })
    .eq("id", userId)
    .select("id")
    .maybeSingle();
  if (profileError || !profile) return failForm(dbErrorMessage(profileError, "Din profil kunne ikke gemmes. Prøv igen."), undefined, values);

  const { data: contact, error: contactError } = await supabase
    .from("profile_private")
    .update({ phone: parsed.data.phone, contact_preference: parsed.data.contact_preference })
    .eq("user_id", userId)
    .select("user_id")
    .maybeSingle();
  revalidateProfile();
  if (contactError || !contact) {
    return failForm(
      `Dit navn og “Om mig” er gemt, men telefonnummer og kontaktønske kunne ikke gemmes. ${dbErrorMessage(contactError, "Prøv igen.")}`,
      undefined,
      values,
    );
  }
  return { ok: true, message: "Din profil er gemt." };
}

/** Called by the upload field once the picture is in avatars/<userId>/…; replaces the old picture. */
export async function setAvatar(path: string): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return fail(NOT_LOGGED_IN);
  const parsed = avatarPathSchema.safeParse(path);
  if (!parsed.success || !isOwnAvatarPath(parsed.data, userId)) return fail("Billedet ligger det forkerte sted. Prøv at uploade det igen.");

  const supabase = await createClient();
  const { data: current } = await supabase.from("profiles").select("avatar_path").eq("id", userId).maybeSingle();
  const { data, error } = await supabase.from("profiles").update({ avatar_path: parsed.data }).eq("id", userId).select("id").maybeSingle();
  if (error || !data) {
    await supabase.storage.from(BUCKETS.avatars).remove([parsed.data]);
    return fail(dbErrorMessage(error, "Billedet kunne ikke gemmes på din profil. Prøv igen."));
  }
  const old = current?.avatar_path;
  if (old && old !== parsed.data && isOwnAvatarPath(old, userId)) {
    // The new picture is saved; a leftover old file is only a storage matter.
    await supabase.storage.from(BUCKETS.avatars).remove([old]);
  }
  revalidateProfile();
  return ok("Dit profilbillede er gemt.");
}

/** "Fjern billede". */
export async function removeAvatar(): Promise<FormState> {
  const userId = await getUserId();
  if (!userId) return failForm(NOT_LOGGED_IN);

  const supabase = await createClient();
  const { data: current, error: loadError } = await supabase.from("profiles").select("avatar_path").eq("id", userId).maybeSingle();
  if (loadError || !current) return failForm(dbErrorMessage(loadError, "Din profil kunne ikke hentes. Prøv igen."));
  if (!current.avatar_path) return { ok: true, message: "Du har ikke noget profilbillede." };

  const { error } = await supabase.from("profiles").update({ avatar_path: null }).eq("id", userId);
  if (error) return failForm(dbErrorMessage(error, "Billedet kunne ikke fjernes. Prøv igen."));
  if (isOwnAvatarPath(current.avatar_path, userId)) {
    await supabase.storage.from(BUCKETS.avatars).remove([current.avatar_path]);
  }
  revalidateProfile();
  return { ok: true, message: "Dit profilbillede er fjernet." };
}

// ---------------------------------------------------------------------------
// Membership & billing
// ---------------------------------------------------------------------------

/** The subscription the membership summary describes, read through RLS (never an id from the browser). */
async function loadOwnSubscription(supabase: Supabase, userId: string) {
  const { data: summaryData, error: summaryError } = await supabase.rpc("membership_summary");
  if (summaryError) return { error: true as const, subscription: null };
  const summary = parseMembershipSummary(summaryData);
  if (!summary.subscription_id) return { error: false as const, subscription: null };
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, provider, provider_subscription_id, status, cancel_at_period_end, cancel_at")
    .eq("id", summary.subscription_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { error: true as const, subscription: null };
  return { error: false as const, subscription: data };
}

/** "Opsig medlemskab": cancels at the end of the paid period in Stripe. The webhook updates our database. */
export async function cancelMembership(): Promise<FormState> {
  const userId = await getUserId();
  if (!userId) return failForm(NOT_LOGGED_IN);
  const stripe = getStripe();
  if (!stripe) return failForm(STRIPE_UNAVAILABLE);

  const supabase = await createClient();
  const { error, subscription } = await loadOwnSubscription(supabase, userId);
  if (error) return failForm("Vi kunne ikke hente dit medlemskab. Prøv igen om lidt.");
  if (!subscription || subscription.provider !== "stripe" || !["active", "trialing", "past_due"].includes(subscription.status)) {
    return failForm("Du har ikke et aktivt medlemskab, der kan opsiges.");
  }
  if (subscription.cancel_at_period_end || subscription.cancel_at) return { ok: true, message: "Dit medlemskab er allerede opsagt." };

  let accessUntil: string | null;
  try {
    const updated = await stripe.subscriptions.update(subscription.provider_subscription_id, { cancel_at_period_end: true });
    accessUntil = accessEndsAt({ cancel_at: unixToIso(updated.cancel_at), current_period_end: subscriptionPeriod(updated).end });
  } catch (err) {
    console.error("[profile] cancel subscription:", describeStripeError(err));
    return failForm("Opsigelsen kunne ikke gennemføres lige nu. Dit medlemskab er uændret – prøv igen om lidt.");
  }
  revalidateProfile();
  return {
    ok: true,
    message: `Opsigelsen er registreret hos Stripe. ${
      accessUntil ? `Du har adgang til og med ${formatDate(accessUntil)}, og` : "Du har adgang resten af den betalte periode, og"
    } du bliver ikke trukket flere gange. Der kan gå et øjeblik, før siden viser ændringen.`,
  };
}

/** "Genoptag medlemskab": undoes a cancellation that has not taken effect yet. */
export async function resumeMembership(): Promise<FormState> {
  const userId = await getUserId();
  if (!userId) return failForm(NOT_LOGGED_IN);
  const stripe = getStripe();
  if (!stripe) return failForm(STRIPE_UNAVAILABLE);

  const supabase = await createClient();
  const { error, subscription } = await loadOwnSubscription(supabase, userId);
  if (error) return failForm("Vi kunne ikke hente dit medlemskab. Prøv igen om lidt.");
  if (!subscription || subscription.provider !== "stripe" || !["active", "trialing"].includes(subscription.status)) {
    return failForm("Medlemskabet kan ikke genoptages her. Tegn et nyt medlemskab under “Bliv medlem”.");
  }
  if (!subscription.cancel_at_period_end && !subscription.cancel_at) return { ok: true, message: "Dit medlemskab er ikke opsagt." };

  let renewsOn: string | null;
  try {
    const updated = await stripe.subscriptions.update(
      subscription.provider_subscription_id,
      subscription.cancel_at_period_end ? { cancel_at_period_end: false } : { cancel_at: "" },
    );
    renewsOn = subscriptionPeriod(updated).end;
  } catch (err) {
    console.error("[profile] resume subscription:", describeStripeError(err));
    return failForm("Medlemskabet kunne ikke genoptages lige nu. Prøv igen om lidt.");
  }
  revalidateProfile();
  return {
    ok: true,
    message: `Dit medlemskab er genoptaget hos Stripe og fornyes automatisk igen${renewsOn ? ` ${formatDate(renewsOn)}` : ""}. Der kan gå et øjeblik, før siden viser ændringen.`,
  };
}

/** "Administrer betaling og kvitteringer" / "Opdater betalingskort": opens Stripe's customer portal. */
export async function openBillingPortal(): Promise<FormState> {
  const userId = await getUserId();
  if (!userId) return failForm(NOT_LOGGED_IN);
  const result = await createCustomerPortalUrl(userId, "/min-profil");
  if (!result.ok) return failForm(result.error);
  redirect(result.url);
}

// ---------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await getUserId())) return failForm(NOT_LOGGED_IN);
  const parsed = changePasswordSchema.safeParse({
    password: readText(formData, "password"),
    password_repeat: readText(formData, "password_repeat"),
  });
  // Passwords are never sent back to the browser.
  if (!parsed.success) return failForm(CHECK_FIELDS, zodFieldErrors(parsed.error.issues));

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    const kind = authErrorKind(error);
    const message = profileAuthErrorMessage(error);
    return failForm(message, ["weak_password", "pwned_password", "same_password"].includes(kind) ? { password: message } : undefined);
  }
  return { ok: true, message: "Din adgangskode er ændret. Brug den nye adgangskode, næste gang du logger ind." };
}

export async function changeEmail(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) return failForm(NOT_LOGGED_IN);
  const values = readValues(formData, ["email"]);
  const parsed = changeEmailSchema.safeParse(values);
  if (!parsed.success) return failForm(CHECK_FIELDS, zodFieldErrors(parsed.error.issues), values);
  if (viewer.email && parsed.data.email === viewer.email.toLowerCase()) {
    return failForm("Det er allerede din e-mailadresse.", { email: "Det er allerede din e-mailadresse." }, values);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ email: parsed.data.email }, { emailRedirectTo: confirmRedirectUrl("/min-profil") });
  if (error) return failForm(profileAuthErrorMessage(error), undefined, values);
  return {
    ok: true,
    message:
      "Vi har sendt et bekræftelseslink til den nye adresse. Din e-mailadresse skifter først, når du har klikket på linket. Tjek også din nuværende indbakke – måske skal du også bekræfte skiftet dér.",
  };
}

/** "Log ud på alle enheder": ends every session for this account. */
export async function signOutEverywhere(): Promise<FormState> {
  if (!(await getUserId())) return failForm(NOT_LOGGED_IN);
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) return failForm("Vi kunne ikke logge dig ud på alle enheder lige nu. Prøv igen om lidt.");
  revalidatePath("/", "layout");
  redirect("/log-ind?besked=logget-ud");
}

// ---------------------------------------------------------------------------
// Privacy
// ---------------------------------------------------------------------------

export async function setEmailNotifications(_prev: FormState, formData: FormData): Promise<FormState> {
  const userId = await getUserId();
  if (!userId) return failForm(NOT_LOGGED_IN);
  const value = z.enum(["on", "off"]).safeParse(readText(formData, "email_notifications"));
  if (!value.success) return failForm("Vælg, om du vil have e-mails.");

  const enabled = value.data === "on";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profile_private")
    .update({ email_notifications: enabled })
    .eq("user_id", userId)
    .select("user_id")
    .maybeSingle();
  if (error || !data) return failForm(dbErrorMessage(error, "Indstillingen kunne ikke gemmes. Prøv igen."));
  revalidateProfile();
  return { ok: true, message: enabled ? "Du får nu besked på e-mail, når der er nyt til dig." : "Du får ikke længere besked på e-mail om nyt." };
}

/** Withdraws consent; the database then deletes the health information (withdraw_health_consent()). */
export async function withdrawHealthConsent(): Promise<FormState> {
  if (!(await getUserId())) return failForm(NOT_LOGGED_IN);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("withdraw_health_consent");
  if (error) return failForm(dbErrorMessage(error, "Samtykket kunne ikke trækkes tilbage. Prøv igen."));
  revalidateProfile();
  revalidatePath("/onboarding");
  if (!data) return { ok: true, message: "Vi har ingen helbredsoplysninger om dig, så der var intet at slette." };
  return { ok: true, message: "Dit samtykke er trukket tilbage, og dine helbredsoplysninger er slettet." };
}

/** "Anmod om sletning af konto": the database forces status "pending" and notifies the administrators. */
export async function requestAccountDeletion(): Promise<FormState> {
  const userId = await getUserId();
  if (!userId) return failForm(NOT_LOGGED_IN);
  const supabase = await createClient();

  const { data: existing, error: loadError } = await supabase
    .from("data_requests")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "deletion")
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();
  if (loadError) return failForm(dbErrorMessage(loadError, "Anmodningen kunne ikke sendes. Prøv igen."));
  if (existing) return { ok: true, message: "Du har allerede sendt en anmodning om sletning. Den bliver behandlet hurtigst muligt." };

  let allowed = true;
  try {
    allowed = await checkRateLimit(`deletion-request:${userId}`, 5, 24 * 60 * 60);
  } catch {
    allowed = true;
  }
  if (!allowed) return failForm("Du har sendt og annulleret mange anmodninger i dag. Prøv igen i morgen, eller kontakt os.");

  const { error } = await supabase.from("data_requests").insert({ user_id: userId, type: "deletion" });
  if (error) return failForm(dbErrorMessage(error, "Anmodningen kunne ikke sendes. Prøv igen."));
  revalidateProfile();
  return { ok: true, message: "Din anmodning om sletning er sendt. Du hører fra os, når den er behandlet." };
}

export async function cancelDataRequest(_prev: FormState, formData: FormData): Promise<FormState> {
  const userId = await getUserId();
  if (!userId) return failForm(NOT_LOGGED_IN);
  const id = z.guid().safeParse(readText(formData, "id"));
  if (!id.success) return failForm("Anmodningen blev ikke fundet. Genindlæs siden, og prøv igen.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("data_requests")
    .update({ status: "canceled" })
    .eq("id", id.data)
    .eq("user_id", userId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) return failForm(dbErrorMessage(error, "Anmodningen kunne ikke annulleres. Prøv igen."));
  if (!data) return failForm("Anmodningen kan ikke annulleres længere – den er måske allerede behandlet.");
  revalidateProfile();
  return { ok: true, message: "Din anmodning er annulleret. Din konto bliver ikke slettet." };
}
