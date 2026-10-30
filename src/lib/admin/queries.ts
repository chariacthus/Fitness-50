import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { normalizeMemberRows, type AdminMemberRow } from "@/lib/admin/members";

type Client = SupabaseClient<Database>;

/** Profile names for a set of user ids (RLS: administrators can read every profile). */
export async function loadNames(supabase: Client, ids: readonly (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", unique);
  return new Map((data ?? []).map((p) => [p.id, p.full_name.trim()]));
}

/** rpc admin_member_list with normalised rows. */
export async function loadMemberList(supabase: Client, search?: string): Promise<{ rows: AdminMemberRow[]; error: boolean }> {
  const { data, error } = await supabase.rpc("admin_member_list", search ? { p_search: search } : {});
  if (error) return { rows: [], error: true };
  return { rows: normalizeMemberRows(data), error: false };
}

/** User ids that currently have a published nutrition plan. */
export async function loadMembersWithPublishedNutrition(supabase: Client): Promise<Set<string>> {
  const { data } = await supabase.from("nutrition_plans").select("member_id").eq("status", "published");
  return new Set((data ?? []).map((p) => p.member_id));
}

/** Upload limits from admin settings (in bytes). */
export async function loadUploadLimits(supabase: Client) {
  const { data } = await supabase.from("admin_settings").select("max_image_mb, max_video_mb").eq("id", 1).maybeSingle();
  const MB = 1024 * 1024;
  return {
    imageBytes: (data?.max_image_mb ?? 10) * MB,
    videoBytes: (data?.max_video_mb ?? 50) * MB,
  };
}
