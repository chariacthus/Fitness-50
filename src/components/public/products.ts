import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

export type PublicProduct = Pick<
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
  | "is_test"
  | "mobilepay_enabled"
>;

export type PublicProducts =
  | { ok: true; memberships: PublicProduct[]; nutrition: PublicProduct | null }
  | { ok: false; memberships: PublicProduct[]; nutrition: null };

const COLUMNS =
  "id, slug, kind, name, short_description, description, features, price_amount, billing_interval, is_test, mobilepay_enabled";

/**
 * Active products shown on the public website. Visitors may read active
 * products through RLS; the explicit is_active filter also hides inactive
 * products from logged-in administrators browsing the public pages.
 * Only products we can actually sell are returned: memberships and the
 * "kostplan" add-on (the only add-on with a purchase route).
 */
export const getPublicProducts = cache(async (): Promise<PublicProducts> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("products")
      .select(COLUMNS)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error || !data) return { ok: false, memberships: [], nutrition: null };
    return {
      ok: true,
      memberships: data.filter((p) => p.kind === "membership"),
      nutrition: data.find((p) => p.kind === "addon" && p.slug === "kostplan") ?? null,
    };
  } catch {
    return { ok: false, memberships: [], nutrition: null };
  }
});
