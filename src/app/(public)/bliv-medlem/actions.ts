"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, type ActionResult } from "@/lib/action-result";
import { requireViewer } from "@/lib/auth";
import { createMembershipCheckout, type CheckoutStart } from "@/lib/payments/checkout";
import { loadCheckoutContext } from "@/lib/payments/checkout-context";
import { checkRateLimit } from "@/lib/rate-limit";
import { getStripe } from "@/lib/stripe/client";
import { CHECKOUT_FAILED, checkoutErrorMessage, describeStripeError } from "@/lib/stripe/errors";

const CONSENT_ERROR = "Sæt flueben for at bekræfte, at medlemskabet starter med det samme.";

const schema = z.object({
  consent: z.literal("on", { error: CONSENT_ERROR }),
});

/** Starts Stripe Checkout for the membership. Payment is confirmed by the webhook only. */
export async function startMembershipCheckout(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireViewer("/bliv-medlem");

  const parsed = schema.safeParse({ consent: formData.get("consent") ?? undefined });
  if (!parsed.success) return fail(CONSENT_ERROR, { consent: CONSENT_ERROR });

  const state = viewer.membership.state;
  if (viewer.isEntitled) return fail("Du er allerede medlem – du skal ikke betale igen.");
  if (state === "pending") {
    return fail("Vi venter allerede på bekræftelse af en betaling. Vent et øjeblik, og genindlæs siden.");
  }
  if (state === "past_due") {
    return fail("Din seneste betaling mislykkedes. Opdater dit betalingskort under Min profil i stedet for at starte et nyt medlemskab.");
  }

  const { product, readiness } = await loadCheckoutContext("medlemskab");
  if (!product || product.kind !== "membership" || !readiness.ready) {
    return fail("Tilmelding er ikke åben lige nu. Prøv igen senere.");
  }
  const stripe = getStripe();
  if (!stripe) return fail("Tilmelding er ikke åben lige nu. Prøv igen senere.");

  if (!(await checkRateLimit(`checkout:membership:${viewer.userId}`, 10, 3600))) {
    return fail("Du har prøvet mange gange på kort tid. Vent lidt, og prøv igen.");
  }

  let start: CheckoutStart;
  try {
    start = await createMembershipCheckout(stripe, { userId: viewer.userId, email: viewer.email }, product);
  } catch (error) {
    console.error("[checkout] medlemskab:", describeStripeError(error));
    return fail(checkoutErrorMessage(error));
  }
  // E.g. a membership that already runs in Stripe, or an earlier payment that is being confirmed.
  if ("refused" in start) return fail(start.refused);
  if (!start.url) return fail(CHECKOUT_FAILED);
  redirect(start.url);
}
