import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth-flow/safe-next";

// Target of the links in our Danish Supabase email templates:
// /auth/confirm?token_hash=…&type=email|recovery|invite|email_change&next=/…

const EMAIL_OTP_TYPES = new Set<string>(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.nextUrl.origin), 303);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeNext(searchParams.get("next"), "/hjem");

  if (tokenHash && type && EMAIL_OTP_TYPES.has(type)) {
    const supabase = await createClient();
    // On success the session cookies are written through next/headers cookies().
    const { error } = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash });
    if (!error) return redirectTo(request, next);
    console.error("[auth] verifyOtp failed", error.code, error.status);
  }

  return redirectTo(request, "/log-ind?fejl=link");
}
