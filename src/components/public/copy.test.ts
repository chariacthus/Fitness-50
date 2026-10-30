import { describe, expect, it } from "vitest";
import { genitive, isPlaceholderText, paragraphs, renewalNotice, renewalPhrase, telHref } from "./copy";

describe("public copy helpers", () => {
  it("derives the renewal wording from the billing interval", () => {
    expect(renewalPhrase("month")).toBe("hver måned");
    expect(renewalPhrase("quarter")).toBe("hvert kvartal");
    expect(renewalPhrase("year")).toBe("hvert år");
    expect(renewalPhrase("one_time")).toBeNull();
    expect(renewalNotice("month")).toBe(
      "Fornyes automatisk hver måned, indtil du opsiger. Du kan opsige når som helst og beholder adgangen resten af den betalte periode.",
    );
    expect(renewalNotice(null)).toMatch(/^Fornyes automatisk, indtil du opsiger\./);
  });

  it("recognises missing and bracketed placeholder texts", () => {
    expect(isPlaceholderText(null)).toBe(true);
    expect(isPlaceholderText("   ")).toBe(true);
    expect(isPlaceholderText("[Indsæt en kort præsentation af Christian]")).toBe(true);
    expect(isPlaceholderText("Jeg har trænet mænd i mange år.")).toBe(false);
  });

  it("splits text into paragraphs on blank lines", () => {
    expect(paragraphs("Første afsnit.\n\n  Andet afsnit.\nSamme afsnit.\n\n\n")).toEqual([
      "Første afsnit.",
      "Andet afsnit.\nSamme afsnit.",
    ]);
  });

  it("forms the Danish genitive", () => {
    expect(genitive("Christian")).toBe("Christians");
    expect(genitive("Lars")).toBe("Lars'");
  });

  it("builds tel: links without spaces", () => {
    expect(telHref("+45 12 34 56 78")).toBe("tel:+4512345678");
  });
});
