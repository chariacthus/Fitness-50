import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth-flow/safe-next";

// PKCE callback: used when Supabase sends its default links (…/auth/callback?code=…)
// instead of our token_hash templates.

function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.nextUrl.origin), 303);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"), "/hjem");

  if (code && !searchParams.get("error")) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return redirectTo(request, next);
    console.error("[auth] exchangeCodeForSession failed", error.code, error.status);
  }

  return redirectTo(request, "/log-ind?fejl=link");
}
