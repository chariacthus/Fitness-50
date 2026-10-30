"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbErrorMessage, zodFieldErrors } from "@/lib/action-result";
import { getAdminOrNull } from "@/lib/auth";
import { isEntitledState, toMembershipState } from "@/lib/membership";
import { createClient } from "@/lib/supabase/server";
import { CHECK_FIELDS_MESSAGE, NOT_ADMIN_MESSAGE, failForm, nullIfEmpty, readValues, type FormState } from "@/lib/admin/forms";
import { newTrainingPlanSchema } from "@/lib/admin/schemas";

const FIELDS = ["member_id", "title", "goal", "description"] as const;

/** Creates an empty draft for the chosen member and opens the editor. */
export async function createTrainingPlan(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await getAdminOrNull();
  if (!admin) return failForm(NOT_ADMIN_MESSAGE);

  const values = readValues(formData, FIELDS);
  const parsed = newTrainingPlanSchema.safeParse(values);
  if (!parsed.success) return failForm(CHECK_FIELDS_MESSAGE, zodFieldErrors(parsed.error.issues), values);
  const input = parsed.data;

  const supabase = await createClient();
  const [{ data: profile, error: profileError }, { data: state, error: stateError }] = await Promise.all([
    supabase.from("profiles").select("id").eq("id", input.member_id).maybeSingle(),
    supabase.rpc("membership_state", { p_user: input.member_id }),
  ]);
  if (profileError || stateError) return failForm(dbErrorMessage(profileError ?? stateError), undefined, values);
  const membership = toMembershipState(state);
  if (!profile || membership === "admin" || !isEntitledState(membership)) {
    return failForm(CHECK_FIELDS_MESSAGE, { member_id: "Vælg et medlem med et aktivt medlemskab." }, values);
  }

  const { data: plan, error } = await supabase
    .from("training_plans")
    .insert({
      member_id: input.member_id,
      title: input.title,
      goal: nullIfEmpty(input.goal),
      description: nullIfEmpty(input.description),
      status: "draft",
      created_by: admin.userId,
    })
    .select("id")
    .single();
  if (error || !plan) return failForm(dbErrorMessage(error), undefined, values);

  revalidatePath("/admin/traeningsplaner");
  revalidatePath(`/admin/medlemmer/${input.member_id}`);
  redirect(`/admin/traeningsplaner/${plan.id}`);
}
