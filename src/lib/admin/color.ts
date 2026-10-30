// Pure colour helpers for the brand colour setting (WCAG 2.2 contrast).
// No server-only imports: also used by the live check in the settings form.

/** The format stored in site_settings.brand_color. */
export const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/** WCAG AA minimum for normal text (white text on a brand-coloured button). */
export const MIN_TEXT_CONTRAST = 4.5;

/** "#4f5d3a", "4F5D3A" or "#abc" → "#4F5D3A". Returns null for anything else. */
export function normalizeHex(input: string | null | undefined): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((input ?? "").trim());
  if (!match) return null;
  const digits =
    match[1].length === 3
      ? match[1]
          .split("")
          .map((c) => c + c)
          .join("")
      : match[1];
  return `#${digits.toUpperCase()}`;
}

function channel(value: number) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance (0–1) as defined by WCAG. */
export function relativeLuminance(hex: string): number {
  const normalized = normalizeHex(hex);
  if (!normalized) throw new Error(`Ugyldig farve: ${hex}`);
  const n = Number.parseInt(normalized.slice(1), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio between two colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/** Contrast of white text on the colour, or null when the colour is invalid. */
export function contrastWithWhite(hex: string | null | undefined): number | null {
  const normalized = normalizeHex(hex);
  return normalized ? contrastRatio(normalized, "#FFFFFF") : null;
}

/** 4.4876 → "4,48:1" (rounded down, so a value is never shown as passing when it does not). */
export function formatContrast(ratio: number): string {
  const floored = Math.floor(ratio * 100) / 100;
  return `${floored.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}:1`;
}

/** Danish warning when white text on the colour is hard to read, otherwise null. */
export function brandContrastWarning(hex: string | null | undefined): string | null {
  const ratio = contrastWithWhite(hex);
  if (ratio == null || ratio >= MIN_TEXT_CONTRAST) return null;
  return `Hvid tekst på denne farve har kun en kontrast på ${formatContrast(ratio)}. Den bør være mindst 4,5:1, så knapper og overskrifter er lette at læse. Vælg en mørkere farve.`;
}
