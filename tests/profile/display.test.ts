import { describe, expect, it } from "vitest";
import { exportFileName, formatCard, paymentMethodLabel, sortDataRequests } from "@/lib/profile/display";
import { changePasswordSchema, isOwnAvatarPath, profileAuthErrorMessage, profileSchema } from "@/lib/profile/schemas";

describe("formatCard", () => {
  it("shows brand, last four digits and expiry", () => {
    expect(formatCard({ brand: "visa", last4: "4242", exp_month: 12, exp_year: 2028 })).toBe("Visa •••• 4242, udløber 12/2028");
    expect(formatCard({ brand: "mastercard", last4: "0005", exp_month: 3, exp_year: 2027 })).toBe("Mastercard •••• 0005, udløber 03/2027");
    expect(formatCard({ brand: "amex", last4: "8431", exp_month: 1, exp_year: 2030 })).toBe("American Express •••• 8431, udløber 01/2030");
  });

  it("falls back gracefully for unknown brands and missing parts", () => {
    expect(formatCard({ brand: "unknown", last4: "1234", exp_month: 5, exp_year: 2029 })).toBe("Betalingskort •••• 1234, udløber 05/2029");
    expect(formatCard({ brand: "visa", last4: null, exp_month: null, exp_year: null })).toBe("Visa");
    expect(formatCard({})).toBe("Betalingskort");
  });

  it("never shows anything but four digits", () => {
    expect(formatCard({ brand: "visa", last4: "4242424242424242", exp_month: 12, exp_year: 2028 })).toBe("Visa, udløber 12/2028");
    expect(formatCard({ brand: "visa", last4: "abcd", exp_month: 13, exp_year: 2028 })).toBe("Visa");
  });
});

describe("paymentMethodLabel", () => {
  it("names non-card methods in Danish", () => {
    expect(paymentMethodLabel("mobilepay")).toBe("MobilePay");
    expect(paymentMethodLabel("sepa_debit")).toBe("Betalingsmetode gemt hos Stripe");
    expect(paymentMethodLabel(null)).toBe("Betalingsmetode gemt hos Stripe");
  });
});

describe("exportFileName", () => {
  it("uses today's date in Copenhagen", () => {
    expect(exportFileName(new Date("2026-10-30T10:00:00.000Z"))).toBe("staerk50-data-2026-10-30.json");
    // 23:30 UTC on 31 December is already 1 January in Copenhagen.
    expect(exportFileName(new Date("2026-12-31T23:30:00.000Z"))).toBe("staerk50-data-2027-01-01.json");
    // 22:30 UTC in summer is 00:30 the next day in Copenhagen.
    expect(exportFileName(new Date("2026-06-30T22:30:00.000Z"))).toBe("staerk50-data-2026-07-01.json");
  });

  it("is a safe file name", () => {
    expect(exportFileName()).toMatch(/^staerk50-data-\d{4}-\d{2}-\d{2}\.json$/);
  });
});

describe("sortDataRequests", () => {
  it("puts pending requests first, newest first within each group", () => {
    const rows = [
      { id: "a", status: "completed", created_at: "2026-10-29T10:00:00Z" },
      { id: "b", status: "pending", created_at: "2026-10-01T10:00:00Z" },
      { id: "c", status: "rejected", created_at: "2026-10-30T10:00:00Z" },
      { id: "d", status: "pending", created_at: "2026-10-20T10:00:00Z" },
    ];
    expect(sortDataRequests(rows).map((r) => r.id)).toEqual(["d", "b", "c", "a"]);
    expect(rows[0].id).toBe("a"); // input is not mutated
  });
});

describe("isOwnAvatarPath", () => {
  const user = "00000000-0000-4000-8000-000000000001";
  it("accepts a file directly in the user's own folder", () => {
    expect(isOwnAvatarPath(`${user}/b1d7.jpg`, user)).toBe(true);
  });
  it("rejects other folders, nesting and traversal", () => {
    expect(isOwnAvatarPath("00000000-0000-4000-8000-000000000002/b1d7.jpg", user)).toBe(false);
    expect(isOwnAvatarPath(`${user}/`, user)).toBe(false);
    expect(isOwnAvatarPath(`${user}/a/b.jpg`, user)).toBe(false);
    expect(isOwnAvatarPath(`${user}/..`, user)).toBe(false);
    expect(isOwnAvatarPath(`x${user}/b.jpg`, user)).toBe(false);
    expect(isOwnAvatarPath(`${user}b.jpg`, user)).toBe(false);
  });
});

describe("profileSchema", () => {
  it("trims and turns empty optional fields into null", () => {
    const result = profileSchema.parse({ full_name: "  Jens Hansen ", bio: "  ", phone: "", contact_preference: "" });
    expect(result).toEqual({ full_name: "Jens Hansen", bio: null, phone: null, contact_preference: null });
  });

  it("validates lengths, phone and contact preference", () => {
    expect(profileSchema.safeParse({ full_name: "J", bio: "", phone: "", contact_preference: "" }).success).toBe(false);
    expect(profileSchema.safeParse({ full_name: "Jens", bio: "x".repeat(501), phone: "", contact_preference: "" }).success).toBe(false);
    expect(profileSchema.safeParse({ full_name: "Jens", bio: "x".repeat(500), phone: "+45 12 34 56 78", contact_preference: "telefon" }).success).toBe(true);
    expect(profileSchema.safeParse({ full_name: "Jens", bio: "", phone: "ring til mig", contact_preference: "" }).success).toBe(false);
    expect(profileSchema.safeParse({ full_name: "Jens", bio: "", phone: "", contact_preference: "brevdue" }).success).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  it("requires two equal passwords of at least 8 characters", () => {
    expect(changePasswordSchema.safeParse({ password: "kort", password_repeat: "kort" }).success).toBe(false);
    const mismatch = changePasswordSchema.safeParse({ password: "langtkodeord1", password_repeat: "langtkodeord2" });
    expect(mismatch.success).toBe(false);
    expect(mismatch.error?.issues[0].path).toEqual(["password_repeat"]);
    expect(changePasswordSchema.safeParse({ password: "langtkodeord1", password_repeat: "langtkodeord1" }).success).toBe(true);
  });
});

describe("profileAuthErrorMessage", () => {
  it("explains that a fresh login is needed", () => {
    expect(profileAuthErrorMessage({ code: "reauthentication_needed", status: 400 })).toMatch(/logge ind igen/);
  });
  it("uses the shared Danish auth messages otherwise", () => {
    expect(profileAuthErrorMessage({ code: "same_password", status: 422 })).toMatch(/anden end den/);
    expect(profileAuthErrorMessage({ code: "weak_password", status: 422 })).toMatch(/for svag/);
  });
});
