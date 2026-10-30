"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbErrorMessage, zodFieldErrors } from "@/lib/action-result";
import { getAdminOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CHECK_FIELDS_MESSAGE, NOT_ADMIN_MESSAGE, failForm, nullIfEmpty, readValues, type FormState } from "@/lib/admin/forms";
import { newNutritionPlanSchema } from "@/lib/admin/schemas";

const FIELDS = ["member_id", "title", "intro"] as const;

/** Creates an empty nutrition plan draft for a member with the add-on and opens the editor. */
export async function createNutritionPlan(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await getAdminOrNull();
  if (!admin) return failForm(NOT_ADMIN_MESSAGE);

  const values = readValues(formData, FIELDS);
  const parsed = newNutritionPlanSchema.safeParse(values);
  if (!parsed.success) return failForm(CHECK_FIELDS_MESSAGE, zodFieldErrors(parsed.error.issues), values);
  const input = parsed.data;

  const supabase = await createClient();
  // Same rule as public._has_addon(): a paid or granted purchase of "kostplan".
  const { data: purchases, error: purchaseError } = await supabase
    .from("purchases")
    .select("id, status, products(slug)")
    .eq("user_id", input.member_id)
    .in("status", ["paid", "granted"]);
  if (purchaseError) return failForm(dbErrorMessage(purchaseError), undefined, values);
  const hasAddon = (purchases ?? []).some((p) => (p.products as { slug?: string } | null)?.slug === "kostplan");
  if (!hasAddon) {
    return failForm(CHECK_FIELDS_MESSAGE, { member_id: "Medlemmet har ikke adgang til en kostplan. Giv adgang på medlemmets side først." }, values);
  }

  const { data: plan, error } = await supabase
    .from("nutrition_plans")
    .insert({
      member_id: input.member_id,
      title: input.title,
      intro: nullIfEmpty(input.intro),
      status: "draft",
      created_by: admin.userId,
    })
    .select("id")
    .single();
  if (error || !plan) return failForm(dbErrorMessage(error), undefined, values);

  revalidatePath("/admin/kostplaner");
  revalidatePath(`/admin/medlemmer/${input.member_id}`);
  redirect(`/admin/kostplaner/${plan.id}`);
}
