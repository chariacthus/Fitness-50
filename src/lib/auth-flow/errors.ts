// Maps Supabase Auth errors to calm, plain Danish messages.
// Works on any error-like value (AuthError, plain objects in tests, unknown).

export type AuthErrorKind =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "weak_password"
  | "pwned_password"
  | "user_exists"
  | "rate_limit"
  | "invalid_link"
  | "same_password"
  | "network"
  | "signup_disabled"
  | "invalid_email"
  | "email_not_authorized"
  | "session_missing"
  | "reauthentication_needed"
  | "user_banned"
  | "unknown";

export const AUTH_ERROR_MESSAGES: Record<AuthErrorKind, string> = {
  invalid_credentials: "Forkert e-mail eller adgangskode.",
  email_not_confirmed: "Din e-mailadresse er ikke bekræftet endnu. Klik på linket i den e-mail, vi har sendt dig.",
  weak_password: "Adgangskoden er for svag. Brug mindst 8 tegn – gerne en blanding af bogstaver og tal.",
  pwned_password: "Den adgangskode er kendt fra datalæk på internettet og er ikke sikker. Vælg en anden.",
  user_exists: "Der findes allerede en konto med den e-mail. Prøv at logge ind, eller nulstil din adgangskode.",
  rate_limit: "Der har været for mange forsøg. Vent et par minutter, og prøv så igen.",
  invalid_link: "Linket er udløbet eller allerede brugt. Prøv igen.",
  same_password: "Den nye adgangskode skal være en anden end den, du har nu.",
  network: "Vi kunne ikke få forbindelse lige nu. Tjek din internetforbindelse, og prøv igen om lidt.",
  signup_disabled: "Det er ikke muligt at oprette en konto lige nu. Prøv igen senere.",
  invalid_email: "E-mailadressen ser ikke ud til at være gyldig. Tjek, at den er skrevet rigtigt.",
  email_not_authorized: "Vi kan ikke sende e-mails til den adresse lige nu. Kontakt os, så hjælper vi dig.",
  session_missing: "Du er ikke længere logget ind. Log ind igen.",
  reauthentication_needed: "Af sikkerhedshensyn skal du bede om et nyt link, før du kan skifte adgangskode.",
  user_banned: "Din konto er spærret. Kontakt os, hvis du mener, at det er en fejl.",
  unknown: "Noget gik galt. Prøv igen.",
};

const CODE_KINDS: Record<string, AuthErrorKind> = {
  invalid_credentials: "invalid_credentials",
  email_not_confirmed: "email_not_confirmed",
  weak_password: "weak_password",
  user_already_exists: "user_exists",
  email_exists: "user_exists",
  identity_already_exists: "user_exists",
  over_request_rate_limit: "rate_limit",
  over_email_send_rate_limit: "rate_limit",
  over_sms_send_rate_limit: "rate_limit",
  otp_expired: "invalid_link",
  flow_state_expired: "invalid_link",
  flow_state_not_found: "invalid_link",
  bad_code_verifier: "invalid_link",
  invite_not_found: "invalid_link",
  bad_oauth_state: "invalid_link",
  bad_oauth_callback: "invalid_link",
  same_password: "same_password",
  request_timeout: "network",
  hook_timeout: "network",
  hook_timeout_after_retry: "network",
  signup_disabled: "signup_disabled",
  email_provider_disabled: "signup_disabled",
  email_address_invalid: "invalid_email",
  email_address_not_authorized: "email_not_authorized",
  session_not_found: "session_missing",
  session_expired: "session_missing",
  refresh_token_not_found: "session_missing",
  refresh_token_already_used: "session_missing",
  bad_jwt: "session_missing",
  reauthentication_needed: "reauthentication_needed",
  reauthentication_not_valid: "reauthentication_needed",
  user_banned: "user_banned",
};

type ErrorLike = { code?: unknown; status?: unknown; message?: unknown; name?: unknown; reasons?: unknown };

function readError(error: unknown) {
  const e: ErrorLike = typeof error === "object" && error !== null ? (error as ErrorLike) : {};
  return {
    code: typeof e.code === "string" ? e.code : "",
    status: typeof e.status === "number" ? e.status : undefined,
    message: typeof e.message === "string" ? e.message : typeof error === "string" ? error : "",
    name: typeof e.name === "string" ? e.name : "",
    reasons: Array.isArray(e.reasons) ? e.reasons.map(String) : [],
  };
}

/** Classifies an auth error so callers can react (e.g. offer to resend a confirmation email). */
export function authErrorKind(error: unknown): AuthErrorKind {
  if (!error) return "unknown";
  const { code, status, message, name, reasons } = readError(error);

  // Network problems between our server and Supabase.
  if (
    name === "AuthRetryableFetchError" ||
    status === 0 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    /fetch failed|failed to fetch|network|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(message)
  ) {
    return "network";
  }

  const byCode = CODE_KINDS[code];
  if (byCode === "weak_password" || (!byCode && name === "AuthWeakPasswordError")) {
    return reasons.includes("pwned") || /known to be weak|easy to guess|pwned/i.test(message) ? "pwned_password" : "weak_password";
  }
  if (byCode) return byCode;
  if (status === 429) return "rate_limit";

  // Fallbacks on the message for older servers or errors without a code.
  if (/invalid login credentials/i.test(message)) return "invalid_credentials";
  if (/email not confirmed/i.test(message)) return "email_not_confirmed";
  if (/different from the old password|same password/i.test(message)) return "same_password";
  if (/known to be weak|easy to guess|pwned/i.test(message)) return "pwned_password";
  if (/password should (be|contain)|weak password|password is too/i.test(message)) return "weak_password";
  if (/already (been )?registered|already exists/i.test(message)) return "user_exists";
  if (/rate limit|too many requests|for security purposes, you can only request/i.test(message)) return "rate_limit";
  if (/(link|token|otp|code).*(invalid|expired)|(invalid|expired).*(link|token|otp|code)/i.test(message)) return "invalid_link";
  if (/auth session missing|session.*(not found|expired)/i.test(message)) return "session_missing";
  if (/email.*(invalid|is not valid)|invalid.*email/i.test(message)) return "invalid_email";
  if (/signups? not allowed|signup.*disabled/i.test(message)) return "signup_disabled";
  return "unknown";
}

/** Danish, user-safe message for a Supabase Auth error. */
export function translateAuthError(error: unknown): string {
  return AUTH_ERROR_MESSAGES[authErrorKind(error)];
}
