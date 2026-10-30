"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, type ActionResult } from "@/lib/action-result";
import { requireViewer } from "@/lib/auth";
import { createAddonCheckout } from "@/lib/payments/checkout";
import { loadCheckoutContext } from "@/lib/payments/checkout-context";
import { checkRateLimit } from "@/lib/rate-limit";
import { getStripe } from "@/lib/stripe/client";
import { CHECKOUT_FAILED, checkoutErrorMessage, describeStripeError } from "@/lib/stripe/errors";
import { createClient } from "@/lib/supabase/server";

const CONSENT_ERROR = "Sæt flueben for at bekræfte, at arbejdet med kostplanen må starte med det samme.";

const schema = z.object({
  consent: z.literal("on", { error: CONSENT_ERROR }),
});

/** Starts a one-time Stripe Checkout for the nutrition plan add-on. */
export async function startNutritionCheckout(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await requireViewer("/tilkoeb/kostplan");

  const parsed = schema.safeParse({ consent: formData.get("consent") ?? undefined });
  if (!parsed.success) return fail(CONSENT_ERROR, { consent: CONSENT_ERROR });

  if (!viewer.isEntitled) return fail("Kostplanen kræver et aktivt medlemskab.");

  const supabase = await createClient();
  const { data: alreadyBought, error: addonError } = await supabase.rpc("has_addon", { p_slug: "kostplan" });
  if (addonError) return fail("Vi kunne ikke tjekke dine køb. Prøv igen om lidt.");
  if (alreadyBought) return fail("Du har allerede købt kostplanen.");

  const { product, readiness } = await loadCheckoutContext("kostplan");
  if (!product || product.kind !== "addon" || !readiness.ready) {
    return fail("Kostplanen kan ikke købes lige nu. Prøv igen senere.");
  }
  const stripe = getStripe();
  if (!stripe) return fail("Kostplanen kan ikke købes lige nu. Prøv igen senere.");

  if (!(await checkRateLimit(`checkout:addon:${viewer.userId}`, 10, 3600))) {
    return fail("Du har prøvet mange gange på kort tid. Vent lidt, og prøv igen.");
  }

  let url: string | null = null;
  try {
    url = await createAddonCheckout(stripe, { userId: viewer.userId, email: viewer.email }, product, {
      success: "/tilkoeb/kostplan/bekraeftelse",
      cancel: "/tilkoeb/kostplan",
    });
  } catch (error) {
    console.error("[checkout] kostplan:", describeStripeError(error));
    return fail(checkoutErrorMessage(error));
  }
  if (!url) return fail(CHECKOUT_FAILED);
  redirect(url);
}
