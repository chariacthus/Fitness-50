import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { exportFileName } from "@/lib/profile/display";

// "Hent mine data": a JSON file with everything the member can see about
// himself. Every query runs through the member's own client, so Row Level
// Security decides what is included – never another member's data.

export const dynamic = "force-dynamic";

function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.nextUrl.origin), 303);
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return redirectTo(request, "/log-ind?next=/min-profil");
  const user = auth.user;
  const userId = user.id;

  let allowed = true;
  try {
    allowed = await checkRateLimit(`data-export:${userId}`, 10, 60 * 60);
  } catch {
    allowed = true; // The limiter is a convenience; the member's right to his data comes first.
  }
  if (!allowed) return redirectTo(request, "/min-profil?eksport=vent#privatliv");

  const [
    settings,
    profile,
    contact,
    onboarding,
    billingCustomer,
    subscriptions,
    purchases,
    trainingPlans,
    workoutCompletions,
    nutritionPlans,
    communityMessages,
    privateMessages,
    notifications,
    dataRequests,
  ] = await Promise.all([
    getSiteSettings(),
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("profile_private").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("onboarding_submissions").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("billing_customers").select("stripe_customer_id, created_at").eq("user_id", userId).maybeSingle(),
    supabase.from("subscriptions").select("*").eq("user_id", userId).order("created_at"),
    supabase.from("purchases").select("*, products(name, slug)").eq("user_id", userId).order("created_at"),
    supabase.from("training_plans").select("*, training_sessions(*, exercises(*))").eq("member_id", userId).order("created_at"),
    supabase.from("workout_completions").select("*").eq("member_id", userId).order("completed_at"),
    supabase.from("nutrition_plans").select("*, nutrition_meals(*)").eq("member_id", userId).order("created_at"),
    supabase
      .from("community_messages")
      .select("id, body, image_path, reply_to_id, created_at, edited_at, deleted_at")
      .eq("author_id", userId)
      .order("created_at"),
    supabase.from("private_messages").select("id, conversation_id, body, created_at, deleted_at").eq("sender_id", userId).order("created_at"),
    supabase.from("notifications").select("*").eq("user_id", userId).order("created_at"),
    supabase.from("data_requests").select("*").eq("user_id", userId).order("created_at"),
  ]);

  const results = {
    profile,
    contact,
    onboarding,
    billingCustomer,
    subscriptions,
    purchases,
    trainingPlans,
    workoutCompletions,
    nutritionPlans,
    communityMessages,
    privateMessages,
    notifications,
    dataRequests,
  };
  const failed = Object.entries(results).filter(([, r]) => r.error);
  if (failed.length > 0) {
    // Never hand out an incomplete file without saying so.
    console.error("[profile] data export failed:", failed.map(([name, r]) => `${name}: ${r.error?.code ?? ""} ${r.error?.message ?? ""}`).join("; "));
    return redirectTo(request, "/min-profil?eksport=fejl#privatliv");
  }

  const now = new Date();
  const payload = {
    beskrivelse: `Dine data fra ${settings.business_name}. Filen indeholder de oplysninger, der er gemt om dig, og som du selv har adgang til.`,
    dannet: now.toISOString(),
    konto: {
      id: userId,
      email: user.email ?? null,
      oprettet: user.created_at ?? null,
      senest_logget_ind: user.last_sign_in_at ?? null,
    },
    profil: profile.data,
    kontaktoplysninger: contact.data,
    spoergeskema: onboarding.data,
    betalingskunde: billingCustomer.data,
    medlemskaber: subscriptions.data ?? [],
    tilkoeb: purchases.data ?? [],
    traeningsplaner: trainingPlans.data ?? [],
    gennemfoerte_traeninger: workoutCompletions.data ?? [],
    kostplaner: nutritionPlans.data ?? [],
    beskeder_i_faellesskabet: communityMessages.data ?? [],
    private_beskeder_sendt_af_dig: privateMessages.data ?? [],
    notifikationer: notifications.data ?? [],
    anmodninger_om_data: dataRequests.data ?? [],
  };

  // Log the export (data_requests can only be marked completed by the server).
  try {
    const { error } = await createAdminClient()
      .from("data_requests")
      .insert({ user_id: userId, user_email: user.email ?? null, type: "export", status: "completed", completed_at: now.toISOString() });
    if (error) console.error("[profile] could not log data export:", error.code, error.message);
  } catch (error) {
    console.error("[profile] could not log data export:", error instanceof Error ? error.message : error);
  }

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(now)}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
