import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import type { Tables } from "@/lib/database.types";

export type SiteSettings = Tables<"site_settings">;

const DEFAULT_SETTINGS: SiteSettings = {
  id: 1,
  business_name: "Stærk50",
  slogan: "Mere styrke. Mere overskud. Sammen.",
  coach_name: "Christian",
  coach_badge_label: "Christian · Træner",
  coach_short_bio: null,
  coach_bio: null,
  coach_photo_path: null,
  hero_image_path: null,
  contact_email: null,
  contact_phone: null,
  company_name: null,
  cvr_number: null,
  company_address: null,
  brand_color: "#4F5D3A",
  logo_path: null,
  membership_description: null,
  nutrition_description: null,
  community_welcome_message: "Velkommen til fællesskabet, {navn}!",
  coach_user_id: null,
  updated_at: new Date(0).toISOString(),
  updated_by: null,
};

/** Public brand/business settings. Falls back to defaults if the database is unreachable. */
export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("site_settings").select("*").eq("id", 1).maybeSingle();
    return data ?? DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
});

/** Public URL for a file in the public "site" bucket. */
export function siteAssetUrl(path: string | null | undefined) {
  if (!path) return null;
  return `${publicEnv.supabaseUrl}/storage/v1/object/public/site/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Text placeholder used where Christian has not filled in real information yet. */
export function placeholder(value: string | null | undefined, label: string) {
  return value && value.trim() ? value : `[${label} – udfyldes af Christian]`;
}
