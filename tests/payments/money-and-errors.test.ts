import { describe, expect, it } from "vitest";
import { oreToKronerInput, parseKronerToOre } from "@/lib/payments/money";
import { checkoutErrorMessage, isMobilePayRejection, MOBILEPAY_NOT_ACTIVE } from "@/lib/stripe/errors";
import { eventTypeLabel } from "@/lib/payments/labels";

describe("parseKronerToOre", () => {
  it("parses Danish kroner amounts", () => {
    expect(parseKronerToOre("299,00")).toBe(29900);
    expect(parseKronerToOre("299")).toBe(29900);
    expect(parseKronerToOre("299,5")).toBe(29950);
    expect(parseKronerToOre("1.299,50")).toBe(129950);
    expect(parseKronerToOre("1.299")).toBe(129900);
    expect(parseKronerToOre("299.00")).toBe(29900);
    expect(parseKronerToOre(" 299 kr. ")).toBe(29900);
    expect(parseKronerToOre("49,90")).toBe(4990);
  });

  it("rejects invalid or non-positive amounts", () => {
    for (const value of ["", "0", "0,00", "-10", "abc", "12,345", "1,2,3", "1.29,00", "29900øre"]) {
      expect(parseKronerToOre(value)).toBeNull();
    }
  });

  it("formats øre for the input field", () => {
    expect(oreToKronerInput(29900)).toBe("299,00");
    expect(oreToKronerInput(4990)).toBe("49,90");
    expect(oreToKronerInput(null)).toBe("");
    expect(parseKronerToOre(oreToKronerInput(129950))).toBe(129950);
  });
});

describe("Stripe error messages", () => {
  it("detects MobilePay not being activated", () => {
    const error = {
      type: "StripeInvalidRequestError",
      code: "payment_method_unactivated",
      param: "allowed_payment_method_types",
      message: "The payment method type provided: mobilepay is invalid. Please ensure the provided type is activated in your dashboard.",
    };
    expect(isMobilePayRejection(error)).toBe(true);
    expect(checkoutErrorMessage(error)).toBe(MOBILEPAY_NOT_ACTIVE);
  });

  it("gives calm Danish messages without technical details", () => {
    const message = checkoutErrorMessage({ type: "StripeConnectionError", message: "ECONNRESET" });
    expect(message).toMatch(/ikke blevet opkrævet/);
    expect(message).not.toMatch(/ECONNRESET/);
    expect(checkoutErrorMessage(new Error("boom"))).not.toMatch(/boom/);
  });

  it("labels event types in Danish", () => {
    expect(eventTypeLabel("invoice.payment_failed")).toBe("Betaling af faktura mislykkedes");
    expect(eventTypeLabel("payout.paid")).toMatch(/Anden hændelse/);
  });
});
