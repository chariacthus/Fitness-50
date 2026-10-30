import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FaqList } from "./faq";
import { MembershipCard, NutritionCard } from "./pricing";
import type { PublicProduct } from "./products";

const membership: PublicProduct = {
  id: "00000000-0000-0000-0000-000000000001",
  slug: "medlemskab",
  kind: "membership",
  name: "Stærk50 medlemskab",
  short_description: "Personlig træningsplan og fællesskab.",
  description: null,
  features: ["Personlig træningsplan", "Adgang til fællesskabet"],
  price_amount: 9900,
  billing_interval: "month",
  is_test: true,
  mobilepay_enabled: false,
};

const nutrition: PublicProduct = {
  ...membership,
  id: "00000000-0000-0000-0000-000000000002",
  slug: "kostplan",
  kind: "addon",
  name: "Personlig kostplan",
  features: [],
  price_amount: 4900,
  billing_interval: "one_time",
  is_test: false,
};

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("pricing cards", () => {
  it("shows price, interval, test badge, renewal and card-only payment for the membership", () => {
    const html = renderToStaticMarkup(createElement(MembershipCard, { product: membership }));
    const t = text(html);
    expect(t).toContain("99,00 kr.");
    expect(t).toContain("pr. måned");
    expect(t).toContain("Testpris – ikke endelig");
    expect(t).toContain("Fornyes automatisk hver måned, indtil du opsiger.");
    expect(t).toContain("MobilePay kan ikke bruges til automatisk fornyelse.");
    expect(html).toContain('href="/bliv-medlem"');
  });

  it("says the price is coming when no price is set", () => {
    const t = text(renderToStaticMarkup(createElement(MembershipCard, { product: { ...membership, price_amount: null } })));
    expect(t).toContain("Prisen offentliggøres snart");
    expect(t).not.toContain("kr.");
  });

  it("only mentions MobilePay for the nutrition plan when it is enabled", () => {
    const without = text(renderToStaticMarkup(createElement(NutritionCard, { product: nutrition })));
    expect(without).toContain("Betales med betalingskort.");
    expect(without).not.toContain("MobilePay");
    expect(without).not.toContain("Testpris");

    const withMobilePay = renderToStaticMarkup(createElement(NutritionCard, { product: { ...nutrition, mobilepay_enabled: true } }));
    expect(text(withMobilePay)).toContain("Kan betales med betalingskort eller MobilePay.");
    expect(withMobilePay).toContain('href="/tilkoeb/kostplan"');
    expect(text(withMobilePay)).toContain("kræver medlemskab");
  });
});

describe("FaqList", () => {
  it("renders native details/summary items", () => {
    const html = renderToStaticMarkup(
      createElement(FaqList, { items: [{ id: "udstyr", question: "Skal jeg have udstyr?", answer: "Nej." }] }),
    );
    expect(html).toContain('<details id="spm-udstyr"');
    expect(html).toContain("<summary");
    expect(text(html)).toContain("Skal jeg have udstyr?");
  });
});
