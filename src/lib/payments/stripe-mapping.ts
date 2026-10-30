// Pure mapping between Stripe objects and our database rows. No I/O here, so
// every rule is unit-tested (tests/payments/stripe-mapping.test.ts).
//
// Stripe has moved fields between API versions. Since 2025-03-31 ("basil"):
//   - current_period_start/end live on each subscription item, not on the subscription
//   - an invoice's subscription is under invoice.parent.subscription_details.subscription
// Webhook payloads use the API version configured on the webhook endpoint, so
// both the old and the new shape are handled defensively.

/** A Stripe reference that may be an id or an expanded object. */
export type StripeRef = string | { id: string } | null | undefined;

export type RecurringLike = { interval: string; interval_count?: number | null } | null | undefined;

export type PriceLike = {
  id: string;
  unit_amount?: number | null;
  currency?: string | null;
  recurring?: RecurringLike;
};

export type SubscriptionItemLike = {
  current_period_start?: number | null;
  current_period_end?: number | null;
  quantity?: number | null;
  price?: PriceLike | null;
};

export type SubscriptionLike = {
  id: string;
  status: string;
  customer: StripeRef;
  cancel_at_period_end?: boolean | null;
  cancel_at?: number | null;
  canceled_at?: number | null;
  ended_at?: number | null;
  /** Legacy (API versions before 2025-03-31). */
  current_period_start?: number | null;
  /** Legacy (API versions before 2025-03-31). */
  current_period_end?: number | null;
  metadata?: Record<string, string> | null;
  items?: { data?: SubscriptionItemLike[] | null } | null;
};

export type InvoiceLike = {
  id?: string;
  /** Legacy (API versions before 2025-03-31). */
  subscription?: StripeRef;
  parent?: {
    subscription_details?: { subscription?: StripeRef } | null;
  } | null;
  lines?: {
    data?: Array<{
      /** Legacy line shape. */
      subscription?: StripeRef;
      parent?: { subscription_item_details?: { subscription?: string | null } | null } | null;
    }> | null;
  } | null;
};

/** Statuses accepted by the subscriptions.status check constraint. */
export const SUBSCRIPTION_STATUSES = [
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export type BillingInterval = "month" | "quarter" | "year";

/** The provider-derived columns of a subscriptions row (user/product are resolved separately). */
export type MappedSubscription = {
  provider_subscription_id: string;
  provider_customer_id: string | null;
  provider_price_id: string | null;
  status: SubscriptionStatus;
  cancel_at_period_end: boolean;
  cancel_at: string | null;
  canceled_at: string | null;
  ended_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  amount: number | null;
  billing_interval: string | null;
};

/** Id of a Stripe reference (string id or expanded object). */
export function stripeId(ref: StripeRef): string | null {
  if (!ref) return null;
  if (typeof ref === "string") return ref || null;
  return typeof ref.id === "string" && ref.id ? ref.id : null;
}

/** Unix seconds → ISO timestamp (or null). */
export function unixToIso(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value * 1000).toISOString();
}

/**
 * Stripe status → our status. An unknown future status is treated as "unpaid",
 * which never grants access (the safe default).
 */
export function mapSubscriptionStatus(status: string): SubscriptionStatus {
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(status) ? (status as SubscriptionStatus) : "unpaid";
}

/** Stripe recurring settings → our billing interval. month×3 is a quarter. */
export function billingIntervalFromRecurring(recurring: RecurringLike): string | null {
  if (!recurring?.interval) return null;
  const count = recurring.interval_count ?? 1;
  if (recurring.interval === "month" && count === 1) return "month";
  if (recurring.interval === "month" && count === 3) return "quarter";
  if (recurring.interval === "month" && count === 12) return "year";
  if (recurring.interval === "year" && count === 1) return "year";
  return count === 1 ? recurring.interval : null;
}

/** Our billing interval → Stripe `recurring` price params (null for one-time prices). */
export function recurringParamsForInterval(
  interval: string,
): { interval: "month" | "year"; interval_count: number } | null {
  switch (interval) {
    case "month":
      return { interval: "month", interval_count: 1 };
    case "quarter":
      return { interval: "month", interval_count: 3 };
    case "year":
      return { interval: "year", interval_count: 1 };
    default:
      return null;
  }
}

/** True when a Stripe price has exactly the amount and interval we expect. */
export function priceMatches(
  price: PriceLike & { active?: boolean | null },
  expected: { amount: number; interval: string; currency?: string },
): boolean {
  if (price.active === false) return false;
  if ((price.currency ?? "").toLowerCase() !== (expected.currency ?? "dkk")) return false;
  if (price.unit_amount !== expected.amount) return false;
  if (expected.interval === "one_time") return !price.recurring;
  return billingIntervalFromRecurring(price.recurring) === expected.interval;
}

function firstItem(subscription: SubscriptionLike): SubscriptionItemLike | null {
  return subscription.items?.data?.[0] ?? null;
}

/** Current period, from the subscription items (new API) or the subscription itself (old API). */
export function subscriptionPeriod(subscription: SubscriptionLike): { start: string | null; end: string | null } {
  const items = subscription.items?.data ?? [];
  const starts = items.map((i) => i.current_period_start).filter((v): v is number => typeof v === "number");
  const ends = items.map((i) => i.current_period_end).filter((v): v is number => typeof v === "number");
  const start = starts.length ? Math.min(...starts) : subscription.current_period_start;
  const end = ends.length ? Math.max(...ends) : subscription.current_period_end;
  return { start: unixToIso(start), end: unixToIso(end) };
}

/** Maps a Stripe subscription (old or new API shape) to our subscriptions columns. */
export function mapStripeSubscription(subscription: SubscriptionLike): MappedSubscription {
  const item = firstItem(subscription);
  const price = item?.price ?? null;
  const quantity = typeof item?.quantity === "number" && item.quantity > 0 ? item.quantity : 1;
  const period = subscriptionPeriod(subscription);
  return {
    provider_subscription_id: subscription.id,
    provider_customer_id: stripeId(subscription.customer),
    provider_price_id: price?.id ?? null,
    status: mapSubscriptionStatus(subscription.status),
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    cancel_at: unixToIso(subscription.cancel_at),
    canceled_at: unixToIso(subscription.canceled_at),
    ended_at: unixToIso(subscription.ended_at),
    current_period_start: period.start,
    current_period_end: period.end,
    amount: typeof price?.unit_amount === "number" ? price.unit_amount * quantity : null,
    billing_interval: billingIntervalFromRecurring(price?.recurring),
  };
}

/** Subscription id of an invoice, from the new `parent` shape, the old top-level field or the lines. */
export function subscriptionIdFromInvoice(invoice: InvoiceLike): string | null {
  const fromParent = stripeId(invoice.parent?.subscription_details?.subscription);
  if (fromParent) return fromParent;
  const legacy = stripeId(invoice.subscription);
  if (legacy) return legacy;
  for (const line of invoice.lines?.data ?? []) {
    const fromLine = line.parent?.subscription_item_details?.subscription || stripeId(line.subscription);
    if (fromLine) return fromLine;
  }
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** A uuid from Stripe metadata (set by our own server when creating the checkout), or null. */
export function metadataUuid(metadata: Record<string, string> | null | undefined, key: string): string | null {
  const value = metadata?.[key];
  return isUuid(value) ? value.toLowerCase() : null;
}

/** When access ends for a subscription that has been cancelled (earliest of cancel_at and period end). */
export function accessEndsAt(row: Pick<MappedSubscription, "cancel_at" | "current_period_end">): string | null {
  const candidates = [row.cancel_at, row.current_period_end].filter((v): v is string => Boolean(v));
  if (candidates.length === 0) return null;
  return candidates.reduce((min, v) => (Date.parse(v) < Date.parse(min) ? v : min));
}

type ComparableRow = Partial<Record<keyof MappedSubscription | "user_id" | "product_id", unknown>>;

const TIMESTAMP_FIELDS = new Set(["cancel_at", "canceled_at", "ended_at", "current_period_start", "current_period_end"]);

/**
 * True when an existing database row already holds exactly these values.
 * Timestamps are compared as instants ("…+00:00" from Postgres vs "…Z" from us).
 */
export function sameSubscriptionValues(existing: ComparableRow, next: ComparableRow): boolean {
  return Object.keys(next).every((key) => {
    const a = existing[key as keyof ComparableRow] ?? null;
    const b = next[key as keyof ComparableRow] ?? null;
    if (TIMESTAMP_FIELDS.has(key) && typeof a === "string" && typeof b === "string") {
      return Date.parse(a) === Date.parse(b);
    }
    return a === b;
  });
}
