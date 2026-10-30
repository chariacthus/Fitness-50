import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCheckoutReadiness, type CheckoutReadiness } from "@/lib/stripe/readiness";
import type { Tables } from "@/lib/database.types";

export type CheckoutProduct = Pick<
  Tables<"products">,
  | "id"
  | "slug"
  | "kind"
  | "name"
  | "short_description"
  | "description"
  | "features"
  | "price_amount"
  | "billing_interval"
  | "stripe_price_id"
  | "is_test"
  | "is_active"
  | "mobilepay_enabled"
>;

const PRODUCT_COLUMNS =
  "id, slug, kind, name, short_description, description, features, price_amount, billing_interval, stripe_price_id, is_test, is_active, mobilepay_enabled";

/**
 * Product by slug through RLS: visitors and members only see active
 * products, administrators also see inactive ones (so they get the reasons).
 */
export async function loadProduct(slug: string): Promise<{ product: CheckoutProduct | null; error: boolean }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("products").select(PRODUCT_COLUMNS).eq("slug", slug).maybeSingle();
    return { product: data ?? null, error: Boolean(error) };
  } catch {
    return { product: null, error: true };
  }
}

/**
 * Whether checkout is open (admin_settings.checkout_enabled). admin_settings is
 * only readable by administrators through RLS, so this single non-sensitive
 * flag is read with the service role. Fails closed.
 */
export async function isCheckoutEnabled(): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("admin_settings").select("checkout_enabled").eq("id", 1).maybeSingle();
    if (error) return false;
    return Boolean(data?.checkout_enabled);
  } catch {
    return false;
  }
}

export async function loadCheckoutContext(
  slug: string,
): Promise<{ product: CheckoutProduct | null; readiness: CheckoutReadiness; loadError: boolean }> {
  const [{ product, error }, checkoutEnabled] = await Promise.all([loadProduct(slug), isCheckoutEnabled()]);
  return {
    product,
    readiness: getCheckoutReadiness(product, { checkout_enabled: checkoutEnabled }),
    loadError: error,
  };
}
