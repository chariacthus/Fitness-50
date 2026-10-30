import { describe, expect, it } from "vitest";
import {
  HEX_COLOR,
  MIN_TEXT_CONTRAST,
  brandContrastWarning,
  contrastRatio,
  contrastWithWhite,
  formatContrast,
  normalizeHex,
  relativeLuminance,
} from "@/lib/admin/color";

describe("normalizeHex", () => {
  it("accepts 6- and 3-digit codes with or without # and upper-cases them", () => {
    expect(normalizeHex("#4f5d3a")).toBe("#4F5D3A");
    expect(normalizeHex("4F5D3A")).toBe("#4F5D3A");
    expect(normalizeHex("  #abc ")).toBe("#AABBCC");
    expect(normalizeHex("fff")).toBe("#FFFFFF");
  });

  it("rejects anything else", () => {
    for (const bad of ["", "#12345", "#1234567", "olive", "#ggg000", "rgb(0,0,0)", null, undefined]) {
      expect(normalizeHex(bad)).toBeNull();
    }
  });

  it("always produces the format the database accepts", () => {
    expect(HEX_COLOR.test(normalizeHex("#abc")!)).toBe(true);
  });
});

describe("contrast", () => {
  it("matches the WCAG reference values", () => {
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 5);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
    // #767676 on white is the well-known AA boundary (≈ 4.54:1).
    expect(contrastRatio("#767676", "#FFFFFF")).toBeGreaterThan(MIN_TEXT_CONTRAST);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeLessThan(MIN_TEXT_CONTRAST);
  });

  it("returns null for an invalid colour", () => {
    expect(contrastWithWhite("ikke en farve")).toBeNull();
  });

  it("the default olive brand colour passes with white text", () => {
    expect(contrastWithWhite("#4F5D3A")!).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    expect(brandContrastWarning("#4F5D3A")).toBeNull();
  });

  it("warns in Danish for light colours", () => {
    const warning = brandContrastWarning("#FFD700");
    expect(warning).toMatch(/kontrast/);
    expect(warning).toMatch(/4,5:1/);
    expect(brandContrastWarning("#777777")).not.toBeNull();
    expect(brandContrastWarning("ugyldig")).toBeNull();
  });

  it("formats ratios with a Danish decimal comma and never rounds up past the limit", () => {
    expect(formatContrast(21)).toBe("21,00:1");
    expect(formatContrast(4.4999)).toBe("4,49:1");
  });
});
