"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, fail, ok, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { getAdminOrNull } from "@/lib/auth";
import { parseKronerToOre } from "@/lib/payments/money";
import { getStripe } from "@/lib/stripe/client";
import { isStripeTestMode, serverEnv } from "@/lib/server-env";
import { adminStripeErrorMessage, describeStripeError } from "@/lib/stripe/errors";
import { syncProductWithStripe } from "@/lib/stripe/product-sync";
import { getCheckoutReadiness } from "@/lib/stripe/readiness";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

const NOT_ADMIN = "Kun administratorer kan ændre produkter og betalinger.";
const MAX_PRICE_ORE = 9_999_999;

function revalidateProductPages() {
  revalidatePath("/admin/produkter");
  revalidatePath("/bliv-medlem");
  revalidatePath("/tilkoeb/kostplan");
  revalidatePath("/medlemskab");
  revalidatePath("/");
}

const productSchema = z.object({
  id: z.uuid({ error: "Ukendt produkt." }),
  name: z.string().trim().min(1, "Skriv et navn.").max(120, "Navnet må højst være 120 tegn."),
  short_description: z.string().trim().max(400, "Den korte beskrivelse må højst være 400 tegn."),
  description: z.string().trim().max(4000, "Beskrivelsen må højst være 4000 tegn."),
  features: z
    .array(z.string().max(200, "Hvert punkt må højst være 200 tegn."))
    .max(20, "Der må højst være 20 punkter."),
  price: z.string().trim(),
  billing_interval: z.enum(["one_time", "month", "quarter", "year"], { error: "Vælg hvor ofte der betales." }),
  is_active: z.boolean(),
  is_test: z.boolean(),
  mobilepay_enabled: z.boolean(),
  sort_order: z.coerce
    .number({ error: "Skriv et helt tal." })
    .int("Skriv et helt tal.")
    .min(-1000, "Skriv et tal mellem -1000 og 1000.")
    .max(1000, "Skriv et tal mellem -1000 og 1000."),
  confirm_price_change: z.boolean(),
});

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

type ProductRow = Tables<"products">;

async function syncAndSave(product: ProductRow, previousIds: Pick<ProductRow, "stripe_product_id" | "stripe_price_id">) {
  const stripe = getStripe();
  if (!stripe) return { synced: false as const, reason: "not_configured" as const };
  try {
    const result = await syncProductWithStripe(stripe, { ...product, ...previousIds });
    const supabase = await createClient();
    const { error } = await supabase
      .from("products")
      .update({ stripe_product_id: result.stripe_product_id, stripe_price_id: result.stripe_price_id })
      .eq("id", product.id);
    if (error) return { synced: false as const, reason: "db" as const, message: dbErrorMessage(error) };
    return { synced: true as const, createdPrice: result.createdPrice };
  } catch (error) {
    console.error("[admin/produkter] Stripe-synkronisering:", describeStripeError(error));
    return { synced: false as const, reason: "stripe" as const, message: adminStripeErrorMessage(error, "Stripe kunne ikke opdateres.") };
  }
}

export async function updateProduct(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await getAdminOrNull();
  if (!viewer) return fail(NOT_ADMIN);

  const parsed = productSchema.safeParse({
    id: text(formData, "id"),
    name: text(formData, "name"),
    short_description: text(formData, "short_description"),
    description: text(formData, "description"),
    features: text(formData, "features")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    price: text(formData, "price"),
    billing_interval: text(formData, "billing_interval"),
    is_active: formData.get("is_active") === "on",
    is_test: formData.get("is_test") === "on",
    mobilepay_enabled: formData.get("mobilepay_enabled") === "on",
    sort_order: text(formData, "sort_order") || "0",
    confirm_price_change: formData.get("confirm_price_change") === "on",
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const [key, message] of Object.entries(zodFieldErrors(parsed.error.issues))) {
      const field = key.startsWith("features") ? "features" : key;
      errors[field] ??= message;
    }
    return fail("Tjek de markerede felter, og prøv igen.", errors);
  }
  const input = parsed.data;

  let priceAmount: number | null = null;
  if (input.price) {
    priceAmount = parseKronerToOre(input.price);
    if (priceAmount == null || priceAmount > MAX_PRICE_ORE) {
      return fail("Tjek de markerede felter, og prøv igen.", { price: "Skriv prisen i kroner, f.eks. 299,00." });
    }
  }

  const supabase = await createClient();
  const { data: existing, error: loadError } = await supabase.from("products").select("*").eq("id", input.id).maybeSingle();
  if (loadError) return fail(dbErrorMessage(loadError));
  if (!existing) return fail("Produktet blev ikke fundet.");

  if (existing.kind === "membership" && input.billing_interval === "one_time") {
    return fail("Tjek de markerede felter, og prøv igen.", {
      billing_interval: "Medlemskabet skal fornyes automatisk – vælg måned, kvartal eller år.",
    });
  }
  if (existing.kind === "addon" && input.billing_interval !== "one_time") {
    return fail("Tjek de markerede felter, og prøv igen.", { billing_interval: "Tilkøb betales én gang." });
  }
  const mobilepay = input.billing_interval === "one_time" && input.mobilepay_enabled;

  const priceChanged = existing.price_amount !== priceAmount || existing.billing_interval !== input.billing_interval;
  if (priceChanged && !input.confirm_price_change) {
    return fail("Bekræft prisændringen, før du gemmer.", {
      confirm_price_change: "Sæt flueben for at bekræfte den nye pris.",
    });
  }
  const testChanged = existing.is_test !== input.is_test;

  // A changed price must never be sold with the old Stripe price, so the link is
  // cleared in the same update and set again once Stripe has the new price.
  const { data: saved, error: saveError } = await supabase
    .from("products")
    .update({
      name: input.name,
      short_description: input.short_description || null,
      description: input.description || null,
      features: input.features,
      price_amount: priceAmount,
      billing_interval: input.billing_interval,
      is_active: input.is_active,
      is_test: input.is_test,
      mobilepay_enabled: mobilepay,
      sort_order: input.sort_order,
      ...(priceChanged || testChanged ? { stripe_price_id: null } : {}),
      ...(testChanged ? { stripe_product_id: null } : {}),
    })
    .eq("id", existing.id)
    .select("*")
    .single();
  if (saveError || !saved) return fail(dbErrorMessage(saveError, "Produktet kunne ikke gemmes. Prøv igen."));

  revalidateProductPages();

  if (saved.price_amount == null) {
    return ok("Produktet er gemt. Sæt en pris, før det kan købes.");
  }
  const sync = await syncAndSave(saved, {
    stripe_product_id: existing.stripe_product_id,
    stripe_price_id: existing.stripe_price_id,
  });
  revalidateProductPages();
  if (sync.synced) {
    return ok(
      sync.createdPrice && priceChanged
        ? "Produktet er gemt, og der er oprettet en ny pris i Stripe. Den gælder for nye køb."
        : "Produktet er gemt og opdateret i Stripe.",
    );
  }
  if (sync.reason === "not_configured") {
    return ok(
      "Produktet er gemt. Stripe er ikke sat op endnu, så prisen sendes til Stripe senere – tryk “Synkroniser med Stripe”, når nøglerne er sat.",
    );
  }
  return fail(
    `Produktet er gemt, men Stripe blev ikke opdateret – ${sync.message} Tryk “Synkroniser med Stripe” for at prøve igen. Indtil da kan produktet ikke købes.`,
  );
}

export async function syncProduct(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await getAdminOrNull();
  if (!viewer) return fail(NOT_ADMIN);
  const parsed = z.uuid().safeParse(text(formData, "id"));
  if (!parsed.success) return fail("Ukendt produkt.");

  const supabase = await createClient();
  const { data: product, error } = await supabase.from("products").select("*").eq("id", parsed.data).maybeSingle();
  if (error) return fail(dbErrorMessage(error));
  if (!product) return fail("Produktet blev ikke fundet.");
  if (product.price_amount == null) return fail("Sæt en pris på produktet, før det kan sendes til Stripe.");

  const sync = await syncAndSave(product, {
    stripe_product_id: product.stripe_product_id,
    stripe_price_id: product.stripe_price_id,
  });
  revalidateProductPages();
  if (sync.synced) {
    return ok(sync.createdPrice ? "Prisen er oprettet i Stripe, og produktet er forbundet." : "Produktet var allerede opdateret i Stripe.");
  }
  if (sync.reason === "not_configured") return fail("Stripe er ikke sat op endnu. Sæt STRIPE_SECRET_KEY på serveren først.");
  return fail(sync.message ?? "Stripe kunne ikke opdateres.");
}

export async function setCheckoutEnabled(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const viewer = await getAdminOrNull();
  if (!viewer) return fail(NOT_ADMIN);
  const enabled = text(formData, "enabled") === "true";
  const supabase = await createClient();

  if (enabled) {
    const { data: membership, error } = await supabase
      .from("products")
      .select("is_active, price_amount, stripe_price_id, is_test")
      .eq("slug", "medlemskab")
      .maybeSingle();
    if (error) return fail(dbErrorMessage(error));
    const readiness = getCheckoutReadiness(membership, { checkout_enabled: true });
    if (!readiness.ready) {
      return fail(`Tilmelding kan ikke åbnes endnu: ${readiness.reasons.join(" ")}`);
    }
  }

  // Record which Stripe mode the server runs in, so subscriptions/purchases made
  // in the other mode (e.g. test purchases before go-live) stop granting access
  // at once instead of only after the first webhook in the new mode.
  const stripeLivemode = serverEnv.stripeSecretKey ? !isStripeTestMode() : null;
  const { data, error } = await supabase
    .from("admin_settings")
    .update({
      checkout_enabled: enabled,
      updated_by: viewer.userId,
      ...(stripeLivemode === null ? {} : { stripe_livemode: stripeLivemode }),
    })
    .eq("id", 1)
    .select("checkout_enabled")
    .maybeSingle();
  if (error || !data) return fail(dbErrorMessage(error, "Indstillingen kunne ikke gemmes. Prøv igen."));

  revalidateProductPages();
  return ok(enabled ? "Tilmelding og køb er nu åbent." : "Tilmelding og køb er nu lukket. Ingen kan starte en ny betaling.");
}
