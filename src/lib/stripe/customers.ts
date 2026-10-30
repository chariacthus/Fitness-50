import "server-only";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingResource } from "@/lib/stripe/errors";

/**
 * Returns the Stripe customer id for a user, creating the customer the first
 * time. billing_customers can only be written with the service role.
 * The idempotency key makes two simultaneous first checkouts share one customer.
 */
export async function getOrCreateStripeCustomer(stripe: Stripe, userId: string, email: string | null): Promise<string> {
  const admin = createAdminClient();
  const { data: existing, error } = await admin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`billing_customers: ${error.message}`);

  if (existing?.stripe_customer_id) {
    // The id may belong to the other Stripe mode (test vs. live). Verify it exists.
    try {
      const customer = await stripe.customers.retrieve(existing.stripe_customer_id);
      if (!("deleted" in customer && customer.deleted)) return existing.stripe_customer_id;
    } catch (err) {
      if (!isMissingResource(err)) throw err;
    }
  }

  const customer = await stripe.customers.create(
    { email: email ?? undefined, metadata: { user_id: userId } },
    { idempotencyKey: `customer-${userId}-${existing?.stripe_customer_id ?? "new"}` },
  );

  const { error: saveError } = await admin
    .from("billing_customers")
    .upsert({ user_id: userId, stripe_customer_id: customer.id }, { onConflict: "user_id" });
  if (saveError) throw new Error(`billing_customers: ${saveError.message}`);
  return customer.id;
}
