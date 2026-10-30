"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, fail, ok, type ActionResult } from "@/lib/action-result";
import { getAdminOrNull } from "@/lib/auth";
import { getStripe } from "@/lib/stripe/client";
import { adminStripeErrorMessage, describeStripeError } from "@/lib/stripe/errors";
import { createClient } from "@/lib/supabase/server";

/**
 * Creates a refund in Stripe for a paid one-time purchase. The purchase status
 * is NOT changed here – the verified charge.refunded webhook does that.
 */
export async function refundPurchase(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await getAdminOrNull();
  if (!viewer) return fail("Kun administratorer kan refundere betalinger.");

  const parsed = z.uuid().safeParse(formData.get("purchaseId"));
  if (!parsed.success) return fail("Ukendt køb.");

  const supabase = await createClient();
  const { data: purchase, error } = await supabase
    .from("purchases")
    .select("id, status, provider, provider_payment_intent_id")
    .eq("id", parsed.data)
    .maybeSingle();
  if (error) return fail(dbErrorMessage(error));
  if (!purchase) return fail("Købet blev ikke fundet.");
  if (purchase.provider !== "stripe" || purchase.status !== "paid" || !purchase.provider_payment_intent_id) {
    return fail("Kun betalte køb via Stripe kan refunderes her.");
  }

  const stripe = getStripe();
  if (!stripe) return fail("Stripe er ikke sat op, så der kan ikke refunderes herfra.");

  try {
    await stripe.refunds.create(
      { payment_intent: purchase.provider_payment_intent_id, metadata: { purchase_id: purchase.id, requested_by: viewer.userId } },
      { idempotencyKey: `refund-${purchase.id}` },
    );
  } catch (err) {
    console.error("[admin/betalinger] refusion:", describeStripeError(err));
    return fail(adminStripeErrorMessage(err, "Refusionen kunne ikke oprettes."));
  }

  revalidatePath("/admin/betalinger");
  return ok("Refusionen er oprettet hos Stripe. Status opdateres, når Stripe bekræfter.");
}
