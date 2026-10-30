import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { clearAuthCookies } from "@/lib/auth-flow/server";

function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.nextUrl.origin), 303);
}

/** "Log ud" button (a plain POST form, works without JavaScript). Logs out this device. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) {
    // Supabase could not be reached: remove the session cookies ourselves, so the
    // visitor really is logged out on this device before we say so.
    console.error("[auth] signOut failed", error.code, error.status);
    await clearAuthCookies();
  }
  revalidatePath("/", "layout");
  return redirectTo(request, "/log-ind?besked=logget-ud");
}

/** Visiting /log-ud directly does nothing; logging out always needs the button. */
export function GET(request: NextRequest) {
  return redirectTo(request, "/min-profil");
}
