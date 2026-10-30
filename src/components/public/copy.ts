// Small text helpers shared by the public pages.

const RENEWAL_PHRASES: Record<string, string> = {
  month: "hver måned",
  quarter: "hvert kvartal",
  year: "hvert år",
};

/** "hver måned" / "hvert kvartal" / "hvert år" – or null for unknown intervals. */
export function renewalPhrase(interval: string | null | undefined) {
  return interval ? (RENEWAL_PHRASES[interval] ?? null) : null;
}

/** Automatic renewal and cancellation notice for a membership product. */
export function renewalNotice(interval: string | null | undefined) {
  const phrase = renewalPhrase(interval);
  return `Fornyes automatisk${phrase ? ` ${phrase}` : ""}, indtil du opsiger. Du kan opsige når som helst og beholder adgangen resten af den betalte periode.`;
}

export const CARD_PAYMENT_NOTE =
  "Medlemskabet betales med betalingskort. MobilePay kan ikke bruges til automatisk fornyelse.";

/** True when a settings text is missing or is a bracketed "[…]" placeholder. */
export function isPlaceholderText(value: string | null | undefined) {
  const text = (value ?? "").trim();
  return !text || (text.startsWith("[") && text.endsWith("]"));
}

/** Splits a longer text into paragraphs on blank lines. */
export function paragraphs(text: string) {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Danish genitive: "Christians", but "Lars'" for names ending in s, x or z. */
export function genitive(name: string) {
  return /[sxz]$/i.test(name) ? `${name}'` : `${name}s`;
}

/** Removes spaces etc. so a phone number can be used in a tel: link. */
export function telHref(phone: string) {
  return `tel:${phone.replace(/[^0-9+]/g, "")}`;
}
