import { describe, expect, it } from "vitest";
import { zodFieldErrors } from "@/lib/action-result";
import { emailOnlySchema, loginSchema, resetPasswordSchema, signupSchema } from "@/lib/auth-flow/schemas";

const validSignup = {
  full_name: "  Jens Hansen ",
  email: " Jens@Eksempel.DK ",
  password: "solsikke-cykel",
  password_repeat: "solsikke-cykel",
  accept_terms: true,
};

describe("auth schemas", () => {
  it("normalises e-mail (trim + lowercase)", () => {
    const parsed = emailOnlySchema.parse({ email: "  Navn@Eksempel.DK " });
    expect(parsed.email).toBe("navn@eksempel.dk");
  });

  it("rejects invalid e-mail with a Danish message", () => {
    const result = emailOnlySchema.safeParse({ email: "ikke-en-mail" });
    expect(result.success).toBe(false);
    if (!result.success) expect(zodFieldErrors(result.error.issues).email).toMatch(/gyldig e-mailadresse/);
    const empty = emailOnlySchema.safeParse({ email: "   " });
    expect(empty.success).toBe(false);
    if (!empty.success) expect(zodFieldErrors(empty.error.issues).email).toBe("Skriv din e-mailadresse.");
  });

  it("accepts a valid signup and trims the name", () => {
    const parsed = signupSchema.parse(validSignup);
    expect(parsed.full_name).toBe("Jens Hansen");
    expect(parsed.email).toBe("jens@eksempel.dk");
  });

  it("requires 8+ characters, matching passwords and accepted terms", () => {
    const short = signupSchema.safeParse({ ...validSignup, password: "kort", password_repeat: "kort" });
    expect(short.success).toBe(false);
    if (!short.success) expect(zodFieldErrors(short.error.issues).password).toMatch(/mindst 8 tegn/);

    const mismatch = signupSchema.safeParse({ ...validSignup, password_repeat: "noget-andet" });
    expect(mismatch.success).toBe(false);
    if (!mismatch.success) expect(zodFieldErrors(mismatch.error.issues).password_repeat).toMatch(/ikke ens/);

    const terms = signupSchema.safeParse({ ...validSignup, accept_terms: false });
    expect(terms.success).toBe(false);
    if (!terms.success) expect(zodFieldErrors(terms.error.issues).accept_terms).toMatch(/handelsbetingelserne/);
  });

  it("login needs a password but no minimum length", () => {
    expect(loginSchema.safeParse({ email: "a@b.dk", password: "x" }).success).toBe(true);
    const missing = loginSchema.safeParse({ email: "a@b.dk", password: "" });
    expect(missing.success).toBe(false);
    if (!missing.success) expect(zodFieldErrors(missing.error.issues).password).toBe("Skriv din adgangskode.");
  });

  it("reset requires matching passwords", () => {
    expect(resetPasswordSchema.safeParse({ password: "langt-nok-1", password_repeat: "langt-nok-1" }).success).toBe(true);
    const mismatch = resetPasswordSchema.safeParse({ password: "langt-nok-1", password_repeat: "langt-nok-2" });
    expect(mismatch.success).toBe(false);
    if (!mismatch.success) expect(zodFieldErrors(mismatch.error.issues).password_repeat).toMatch(/ikke ens/);
  });
});
