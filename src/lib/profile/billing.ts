import "server-only";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import { describeStripeError } from "@/lib/stripe/errors";
import { createClient } from "@/lib/supabase/server";
import { formatCard, paymentMethodLabel } from "@/lib/profile/display";

export type BillingInfo =
  /** Stripe is not configured or could not be reached. */
  | { status: "unavailable" }
  | { status: "ok"; hasCustomer: boolean; paymentMethod: string | null };

function describePaymentMethod(pm: Stripe.PaymentMethod | null): string | null {
  if (!pm) return null;
  if (pm.type === "card" && pm.card) {
    return formatCard({ brand: pm.card.brand, last4: pm.card.last4, exp_month: pm.card.exp_month, exp_year: pm.card.exp_year });
  }
  return paymentMethodLabel(pm.type);
}

async function resolvePaymentMethod(stripe: Stripe, ref: string | Stripe.PaymentMethod | null | undefined) {
  if (!ref) return null;
  if (typeof ref !== "string") return ref;
  return stripe.paymentMethods.retrieve(ref);
}

/**
 * The member's own payment method as shown on /min-profil: brand, last four
 * digits and expiry only. The customer and subscription ids are read through
 * RLS, so a member only ever sees his own card.
 */
export async function loadBillingInfo(userId: string, subscriptionRowId: string | undefined): Promise<BillingInfo> {
  const stripe = getStripe();
  if (!stripe) return { status: "unavailable" };

  const supabase = await createClient();
  const [customerRes, subscriptionRes] = await Promise.all([
    supabase.from("billing_customers").select("stripe_customer_id").eq("user_id", userId).maybeSingle(),
    subscriptionRowId
      ? supabase
          .from("subscriptions")
          .select("provider, provider_subscription_id, status")
          .eq("id", subscriptionRowId)
          .eq("user_id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (customerRes.error || subscriptionRes.error) return { status: "unavailable" };

  const customerId = customerRes.data?.stripe_customer_id ?? null;
  const subscription = subscriptionRes.data;
  if (!customerId) return { status: "ok", hasCustomer: false, paymentMethod: null };

  try {
    let pm: Stripe.PaymentMethod | null = null;
    if (subscription?.provider === "stripe" && !["canceled", "incomplete_expired"].includes(subscription.status)) {
      const sub = await stripe.subscriptions.retrieve(subscription.provider_subscription_id, { expand: ["default_payment_method"] });
      pm = await resolvePaymentMethod(stripe, sub.default_payment_method);
    }
    if (!pm) {
      const customer = await stripe.customers.retrieve(customerId, { expand: ["invoice_settings.default_payment_method"] });
      if (!("deleted" in customer && customer.deleted)) {
        pm = await resolvePaymentMethod(stripe, (customer as Stripe.Customer).invoice_settings?.default_payment_method);
      }
    }
    return { status: "ok", hasCustomer: true, paymentMethod: describePaymentMethod(pm) };
  } catch (error) {
    console.error("[profile] payment method:", describeStripeError(error));
    return { status: "unavailable" };
  }
}
