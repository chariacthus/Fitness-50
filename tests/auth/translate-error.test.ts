import { describe, expect, it } from "vitest";
import { AuthApiError, AuthRetryableFetchError, AuthWeakPasswordError } from "@supabase/supabase-js";
import { AUTH_ERROR_MESSAGES, authErrorKind, translateAuthError } from "@/lib/auth-flow/errors";

describe("translateAuthError", () => {
  it("translates invalid credentials", () => {
    const error = new AuthApiError("Invalid login credentials", 400, "invalid_credentials");
    expect(translateAuthError(error)).toBe("Forkert e-mail eller adgangskode.");
    // Older servers without an error code.
    expect(translateAuthError({ message: "Invalid login credentials", status: 400 })).toBe("Forkert e-mail eller adgangskode.");
  });

  it("detects an unconfirmed email", () => {
    expect(authErrorKind(new AuthApiError("Email not confirmed", 400, "email_not_confirmed"))).toBe("email_not_confirmed");
    expect(authErrorKind({ message: "Email not confirmed" })).toBe("email_not_confirmed");
    expect(translateAuthError({ code: "email_not_confirmed" })).toMatch(/ikke bekræftet/);
  });

  it("translates weak and short passwords", () => {
    expect(authErrorKind({ code: "weak_password", message: "Password should be at least 8 characters.", status: 422 })).toBe("weak_password");
    expect(authErrorKind({ message: "Password should be at least 6 characters" })).toBe("weak_password");
    expect(authErrorKind(new AuthWeakPasswordError("Password is too weak", 422, ["length"]))).toBe("weak_password");
    expect(translateAuthError({ code: "weak_password" })).toMatch(/mindst 8 tegn/);
  });

  it("recognises leaked (pwned) passwords", () => {
    expect(authErrorKind(new AuthWeakPasswordError("Password is known to be weak and easy to guess", 422, ["pwned"]))).toBe(
      "pwned_password",
    );
    expect(authErrorKind({ code: "weak_password", reasons: ["pwned"] })).toBe("pwned_password");
  });

  it("translates already registered users", () => {
    expect(authErrorKind({ code: "user_already_exists", status: 422 })).toBe("user_exists");
    expect(authErrorKind({ code: "email_exists", status: 422 })).toBe("user_exists");
    expect(authErrorKind({ message: "User already registered" })).toBe("user_exists");
  });

  it("translates rate limits and too many requests", () => {
    expect(authErrorKind({ code: "over_email_send_rate_limit", status: 429 })).toBe("rate_limit");
    expect(authErrorKind({ code: "over_request_rate_limit", status: 429 })).toBe("rate_limit");
    expect(authErrorKind({ status: 429, message: "Too Many Requests" })).toBe("rate_limit");
    expect(authErrorKind({ message: "For security purposes, you can only request this after 42 seconds." })).toBe("rate_limit");
    expect(translateAuthError({ status: 429 })).toBe(AUTH_ERROR_MESSAGES.rate_limit);
  });

  it("translates expired or invalid links", () => {
    expect(translateAuthError({ code: "otp_expired", status: 403 })).toBe("Linket er udløbet eller allerede brugt. Prøv igen.");
    expect(authErrorKind({ code: "flow_state_not_found" })).toBe("invalid_link");
    expect(authErrorKind({ code: "bad_code_verifier" })).toBe("invalid_link");
    expect(authErrorKind({ message: "Token has expired or is invalid" })).toBe("invalid_link");
    expect(authErrorKind({ message: "Email link is invalid or has expired" })).toBe("invalid_link");
  });

  it("translates reusing the same password", () => {
    expect(authErrorKind({ code: "same_password", status: 422 })).toBe("same_password");
    expect(authErrorKind({ message: "New password should be different from the old password." })).toBe("same_password");
    expect(translateAuthError({ code: "same_password" })).toMatch(/en anden/);
  });

  it("translates network problems", () => {
    expect(authErrorKind(new AuthRetryableFetchError("fetch failed", 0))).toBe("network");
    expect(authErrorKind(new TypeError("fetch failed"))).toBe("network");
    expect(authErrorKind({ status: 503, message: "Service Unavailable" })).toBe("network");
    expect(authErrorKind({ code: "request_timeout", status: 504 })).toBe("network");
    expect(translateAuthError(new AuthRetryableFetchError("fetch failed", 0))).toBe(AUTH_ERROR_MESSAGES.network);
  });

  it("translates other known cases", () => {
    expect(authErrorKind({ code: "signup_disabled" })).toBe("signup_disabled");
    expect(authErrorKind({ code: "email_address_invalid" })).toBe("invalid_email");
    expect(authErrorKind({ message: "Unable to validate email address: invalid format" })).toBe("invalid_email");
    expect(authErrorKind({ code: "email_address_not_authorized" })).toBe("email_not_authorized");
    expect(authErrorKind({ name: "AuthSessionMissingError", message: "Auth session missing!" })).toBe("session_missing");
    expect(authErrorKind({ code: "reauthentication_needed" })).toBe("reauthentication_needed");
    expect(authErrorKind({ code: "user_banned" })).toBe("user_banned");
  });

  it("falls back to a generic Danish message", () => {
    expect(translateAuthError(null)).toBe("Noget gik galt. Prøv igen.");
    expect(translateAuthError(undefined)).toBe("Noget gik galt. Prøv igen.");
    expect(translateAuthError({ code: "something_new", message: "Database error saving new user", status: 500 })).toBe(
      "Noget gik galt. Prøv igen.",
    );
    expect(translateAuthError("weird")).toBe("Noget gik galt. Prøv igen.");
  });

  it("never returns English text", () => {
    for (const message of Object.values(AUTH_ERROR_MESSAGES)) {
      expect(message).not.toMatch(/\b(the|password|error|invalid|please)\b/i);
    }
  });
});
