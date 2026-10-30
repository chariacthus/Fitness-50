import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { isEntitledState, parseMembershipSummary } from "@/lib/membership";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Current membership state for the logged-in user (RLS client). Used by the
 * checkout confirmation pages to wait for the webhook – it never changes anything.
 */
export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Du er ikke logget ind." }, { status: 401, headers: NO_STORE });
  }

  const supabase = await createClient();
  const [summary, nutrition] = await Promise.all([
    supabase.rpc("membership_summary"),
    supabase.rpc("has_addon", { p_slug: "kostplan" }),
  ]);
  if (summary.error || nutrition.error) {
    return NextResponse.json({ error: "Status kunne ikke hentes." }, { status: 500, headers: NO_STORE });
  }

  const membership = parseMembershipSummary(summary.data);
  return NextResponse.json(
    {
      state: membership.state,
      entitled: isEntitledState(membership.state),
      hasNutrition: Boolean(nutrition.data),
    },
    { headers: NO_STORE },
  );
}
