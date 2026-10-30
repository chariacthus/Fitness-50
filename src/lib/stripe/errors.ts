// Turns Stripe API errors into calm Danish messages. Technical details are
// logged on the server, never shown to members.

type StripeLikeError = { type?: unknown; code?: unknown; param?: unknown; message?: unknown; statusCode?: unknown };

function asStripeError(error: unknown): StripeLikeError {
  return error && typeof error === "object" ? (error as StripeLikeError) : {};
}

/** True when Stripe rejected the request because MobilePay is not activated / not allowed. */
export function isMobilePayRejection(error: unknown): boolean {
  const e = asStripeError(error);
  const haystack = [e.code, e.param, e.message].filter((v) => typeof v === "string").join(" ").toLowerCase();
  return haystack.includes("mobilepay");
}

/** True for "No such price/product/customer" errors (e.g. a test-mode id used with live keys). */
export function isMissingResource(error: unknown): boolean {
  const e = asStripeError(error);
  return e.code === "resource_missing" || e.statusCode === 404;
}

export const CHECKOUT_FAILED = "Vi kunne ikke åbne betalingssiden lige nu. Prøv igen om lidt – du er ikke blevet opkrævet.";

export const MOBILEPAY_NOT_ACTIVE =
  "MobilePay er ikke aktiveret hos betalingsudbyderen endnu, så betalingen kan ikke startes. Prøv igen senere, eller kontakt os.";

/** Danish message for a failed Checkout Session creation. */
export function checkoutErrorMessage(error: unknown): string {
  if (isMobilePayRejection(error)) return MOBILEPAY_NOT_ACTIVE;
  const e = asStripeError(error);
  if (e.type === "StripeConnectionError" || e.type === "StripeAPIError") {
    return "Betalingsudbyderen svarer ikke lige nu. Prøv igen om lidt – du er ikke blevet opkrævet.";
  }
  if (isMissingResource(error)) {
    return "Prisen kunne ikke findes hos betalingsudbyderen. Vi har brug for at rette opsætningen – prøv igen senere.";
  }
  return CHECKOUT_FAILED;
}

/** Danish message for admin operations against Stripe (sync, refund). */
export function adminStripeErrorMessage(error: unknown, fallback: string): string {
  const e = asStripeError(error);
  if (e.type === "StripeAuthenticationError") return "Stripe afviste nøglen. Tjek STRIPE_SECRET_KEY.";
  if (e.type === "StripePermissionError") return "Stripe-nøglen har ikke adgang til at gøre dette.";
  if (e.type === "StripeConnectionError" || e.type === "StripeAPIError") return "Stripe svarer ikke lige nu. Prøv igen om lidt.";
  if (e.code === "charge_already_refunded") return "Betalingen er allerede refunderet hos Stripe.";
  if (typeof e.message === "string" && e.message) return `${fallback} (Stripe: ${e.message.slice(0, 200)})`;
  return fallback;
}

/** Short technical description for server logs (no secrets). */
export function describeStripeError(error: unknown): string {
  const e = asStripeError(error);
  return [e.type, e.code, e.param, e.message].filter((v) => typeof v === "string" && v).join(" | ") || String(error);
}
