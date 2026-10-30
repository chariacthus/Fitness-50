import "server-only";
import Stripe from "stripe";
import { serverEnv } from "@/lib/server-env";

let stripe: Stripe | null = null;

/** Stripe SDK instance, or null when STRIPE_SECRET_KEY is not configured. */
export function getStripe(): Stripe | null {
  if (!serverEnv.stripeSecretKey) return null;
  if (!stripe) {
    stripe = new Stripe(serverEnv.stripeSecretKey, {
      appInfo: { name: "Staerk50" },
      maxNetworkRetries: 2,
    });
  }
  return stripe;
}
