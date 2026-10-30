import "server-only";
import type Stripe from "stripe";
import { isMissingResource } from "@/lib/stripe/errors";
import { priceMatches, recurringParamsForInterval } from "@/lib/payments/stripe-mapping";
import type { Tables } from "@/lib/database.types";

export type SyncableProduct = Pick<
  Tables<"products">,
  "id" | "slug" | "name" | "short_description" | "price_amount" | "billing_interval" | "stripe_product_id" | "stripe_price_id"
>;

export type ProductSyncResult = {
  stripe_product_id: string;
  stripe_price_id: string;
  createdProduct: boolean;
  createdPrice: boolean;
};

async function retrieveOrNull<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    if (isMissingResource(error)) return null;
    throw error;
  }
}

/**
 * Makes Stripe match the product in our database:
 * - creates the Stripe Product if it is missing (or belongs to the other mode),
 * - creates a NEW Price when amount or interval changed (Stripe prices are
 *   immutable) and deactivates the old one. Existing subscriptions keep their
 *   old price until it is changed in Stripe.
 */
export async function syncProductWithStripe(stripe: Stripe, product: SyncableProduct): Promise<ProductSyncResult> {
  if (product.price_amount == null) {
    throw new Error("Produktet har ingen pris.");
  }

  let stripeProductId: string | null = null;
  let createdProduct = false;
  if (product.stripe_product_id) {
    const existing = await retrieveOrNull(() => stripe.products.retrieve(product.stripe_product_id!));
    if (existing && !("deleted" in existing && existing.deleted)) {
      stripeProductId = existing.id;
      const description = product.short_description?.trim() || undefined;
      if (existing.name !== product.name || (description && existing.description !== description) || !existing.active) {
        await stripe.products.update(existing.id, { name: product.name, description, active: true });
      }
    }
  }
  if (!stripeProductId) {
    const created = await stripe.products.create({
      name: product.name,
      description: product.short_description?.trim() || undefined,
      metadata: { product_id: product.id, slug: product.slug },
    });
    stripeProductId = created.id;
    createdProduct = true;
  }

  let stripePriceId: string | null = null;
  let oldPriceToDeactivate: string | null = null;
  if (product.stripe_price_id) {
    const price = await retrieveOrNull(() => stripe.prices.retrieve(product.stripe_price_id!));
    if (price) {
      const priceProduct = typeof price.product === "string" ? price.product : price.product.id;
      const matches =
        priceProduct === stripeProductId &&
        priceMatches(price, { amount: product.price_amount, interval: product.billing_interval });
      if (matches) stripePriceId = price.id;
      else if (price.active && priceProduct === stripeProductId) oldPriceToDeactivate = price.id;
    }
  }

  let createdPrice = false;
  if (!stripePriceId) {
    const recurring = recurringParamsForInterval(product.billing_interval);
    const created = await stripe.prices.create({
      product: stripeProductId,
      currency: "dkk",
      unit_amount: product.price_amount,
      ...(recurring ? { recurring } : {}),
      metadata: { product_id: product.id, slug: product.slug },
    });
    stripePriceId = created.id;
    createdPrice = true;
    if (oldPriceToDeactivate) {
      try {
        await stripe.prices.update(oldPriceToDeactivate, { active: false });
      } catch {
        // The new price is in use either way; an old active price is harmless.
      }
    }
  }

  return { stripe_product_id: stripeProductId, stripe_price_id: stripePriceId, createdProduct, createdPrice };
}
