import "server-only";
import { publicEnv } from "@/lib/env";
import { getStripe } from "@/lib/stripe/client";
import { createClient } from "@/lib/supabase/server";

export type PortalResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Stripe Customer Portal link for the logged-in member (cancel at period end,
 * update card, invoices – configured in the Stripe Dashboard, see docs/STRIPE.md).
 * The customer id is read through RLS, so a member can only open their own portal.
 * Intended for a server action on /min-profil: `redirect(result.url)` when ok.
 */
export async function createCustomerPortalUrl(userId: string, returnPath = "/min-profil"): Promise<PortalResult> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "Betalingssiden er ikke tilgængelig lige nu. Prøv igen senere." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { ok: false, error: "Vi kunne ikke hente dine betalingsoplysninger. Prøv igen om lidt." };
  if (!data) return { ok: false, error: "Der er ingen betalingsoplysninger knyttet til din konto endnu." };

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${publicEnv.siteUrl}${returnPath.startsWith("/") ? returnPath : "/min-profil"}`,
      locale: "da",
    });
    return { ok: true, url: session.url };
  } catch (err) {
    console.error("[stripe] customer portal:", err instanceof Error ? err.message : err);
    return { ok: false, error: "Betalingssiden kunne ikke åbnes lige nu. Prøv igen om lidt." };
  }
}
