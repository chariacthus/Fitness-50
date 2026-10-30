// Kroner text ↔ øre. Pure helpers for the admin price form.

/**
 * Parses a Danish kroner amount ("299", "299,00", "1.299,50", "299.00", "299 kr.")
 * into øre. Returns null when the text is not a valid positive amount.
 */
export function parseKronerToOre(input: string): number | null {
  let text = input.trim().toLowerCase().replace(/\s+/g, "").replace(/(kr\.?|dkk)$/, "");
  if (!text) return null;

  if (text.includes(",")) {
    // Danish format: dots are thousands separators, comma is the decimal mark.
    if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(text) && !/^\d+(,\d{1,2})?$/.test(text)) return null;
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    // "1.299" – dot as thousands separator.
    text = text.replace(/\./g, "");
  } else if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return null;
  }

  const ore = Math.round(Number(text) * 100);
  if (!Number.isSafeInteger(ore) || ore <= 0) return null;
  return ore;
}

/** Øre → "299,00" for an input field (no currency sign, no thousands separator). */
export function oreToKronerInput(ore: number | null | undefined): string {
  if (ore == null) return "";
  return (ore / 100).toFixed(2).replace(".", ",");
}
