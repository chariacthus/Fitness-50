import "server-only";
import { isEntitledState, toMembershipState, type MembershipState } from "@/lib/membership";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { TablesInsert } from "@/lib/database.types";
import {
  accessEndsAt,
  mapStripeSubscription,
  metadataUuid,
  sameSubscriptionValues,
  subscriptionEnded,
  type SubscriptionLike,
} from "@/lib/payments/stripe-mapping";
import {
  onMembershipActivated,
  onMembershipCanceling,
  onMembershipExpired,
} from "@/lib/payments/side-effects";

type AdminClient = ReturnType<typeof createAdminClient>;

export async function membershipStateOf(admin: AdminClient, userId: string): Promise<MembershipState> {
  const { data, error } = await admin.rpc("_membership_state", { p_user: userId });
  if (error) throw new Error(`_membership_state: ${error.message}`);
  return toMembershipState(data);
}

async function resolveUserId(admin: AdminClient, subscription: SubscriptionLike, customerId: string | null, hint?: string | null) {
  const fromMetadata = metadataUuid(subscription.metadata, "user_id");
  if (fromMetadata) return fromMetadata;
  if (customerId) {
    const { data, error } = await admin
      .from("billing_customers")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (error) throw new Error(`billing_customers: ${error.message}`);
    if (data?.user_id) return data.user_id;
  }
  return hint ?? null;
}

async function resolveProductId(admin: AdminClient, priceId: string | null, metadataProductId: string | null) {
  if (priceId) {
    const { data } = await admin.from("products").select("id").eq("stripe_price_id", priceId).maybeSingle();
    if (data?.id) return data.id;
  }
  if (metadataProductId) {
    const { data } = await admin.from("products").select("id").eq("id", metadataProductId).maybeSingle();
    if (data?.id) return data.id;
  }
  return null;
}

/**
 * Runs the member/admin side effects for a change in membership state.
 * `previousStatus` is the stored Stripe status before this write (null for a
 * new row): a cancelled subscription that Stripe ends at the period end
 * already reads "expired" before the write, so the status change is what
 * tells us that it ended now.
 */
async function applyTransition(
  admin: AdminClient,
  userId: string,
  before: MembershipState,
  after: MembershipState,
  previousStatus: string | null,
  row: { status: string; cancel_at: string | null; current_period_end: string | null },
) {
  if (before === "admin" || after === "admin") return;
  const changed = before !== after;
  const wasEntitled = isEntitledState(before);
  if (changed && !wasEntitled && isEntitledState(after)) await onMembershipActivated(admin, userId);
  if (changed && before !== "canceling" && after === "canceling") await onMembershipCanceling(admin, userId, accessEndsAt(row));
  const stateEnded = changed && (wasEntitled || before === "past_due");
  if (after === "expired" && (stateEnded || subscriptionEnded(previousStatus, row.status))) await onMembershipExpired(userId);
}

/** True when an insert failed because the user no longer exists (account deleted). */
function isMissingUser(error: { code?: string; message?: string; details?: string | null }) {
  return error.code === "23503" && `${error.message ?? ""} ${error.details ?? ""}`.includes("user_id");
}

/**
 * Stores the latest state of a Stripe subscription and runs side effects when
 * the member's access changes. Returns the user id.
 *
 * Stripe sends several events at once after a checkout, and each re-reads the
 * same subscription. Writes are therefore conditional (insert, or update only
 * if the row is unchanged since we read it), so exactly one delivery performs
 * a given change and its notifications – never two.
 *
 * Returns null when the subscription belongs to no user of this site: no user
 * could be found, or the account has been deleted (the deletion cancels the
 * subscription, and Stripe's event arrives afterwards). The event is then
 * ignored instead of failing and being retried for days.
 */
export async function syncSubscription(
  admin: AdminClient,
  subscription: SubscriptionLike,
  hints: { userId?: string | null } = {},
): Promise<string | null> {
  const mapped = mapStripeSubscription(subscription);
  const resolvedUserId = await resolveUserId(admin, subscription, mapped.provider_customer_id, hints.userId);
  const resolvedProductId = await resolveProductId(
    admin,
    mapped.provider_price_id,
    metadataUuid(subscription.metadata, "product_id"),
  );

  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: existing, error: readError } = await admin
      .from("subscriptions")
      .select("*")
      .eq("provider", "stripe")
      .eq("provider_subscription_id", mapped.provider_subscription_id)
      .maybeSingle();
    if (readError) throw new Error(`subscriptions: ${readError.message}`);

    // A subscription never moves between users.
    const userId = existing?.user_id ?? resolvedUserId;
    if (!userId) {
      console.warn("[stripe-webhook] ingen bruger fundet for abonnement", mapped.provider_subscription_id);
      return null;
    }

    const before = await membershipStateOf(admin, userId);
    const values = {
      user_id: userId,
      product_id: resolvedProductId ?? existing?.product_id ?? null,
      ...mapped,
      // A paid (active) subscription is no longer in a dunning cycle.
      ...(mapped.status === "active" || mapped.status === "trialing" ? { payment_failed_at: null } : {}),
    };

    if (!existing) {
      const insert: TablesInsert<"subscriptions"> = { provider: "stripe", ...values };
      const { error } = await admin.from("subscriptions").insert(insert);
      if (error?.code === "23505") continue; // inserted by a parallel delivery – read again
      if (error && isMissingUser(error)) {
        console.warn("[stripe-webhook] brugeren findes ikke længere – abonnement ignoreres", mapped.provider_subscription_id);
        return null;
      }
      if (error) throw new Error(`subscriptions insert: ${error.message}`);
    } else if (sameSubscriptionValues(existing, values)) {
      return userId; // nothing changed
    } else {
      const { data: updated, error } = await admin
        .from("subscriptions")
        .update(values)
        .eq("id", existing.id)
        .eq("updated_at", existing.updated_at)
        .select("id");
      if (error) throw new Error(`subscriptions update: ${error.message}`);
      if (!updated || updated.length === 0) continue; // changed by a parallel delivery – read again
    }

    const after = await membershipStateOf(admin, userId);
    await applyTransition(admin, userId, before, after, existing?.status ?? null, values);
    return userId;
  }
  throw new Error(`Abonnement ${mapped.provider_subscription_id} blev ændret af flere hændelser samtidig. Stripe prøver igen.`);
}
