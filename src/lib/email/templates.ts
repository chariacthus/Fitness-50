import { publicEnv } from "@/lib/env";

// Danish application emails. They deliberately contain no health information,
// no message contents and no payment card details – only a link back to the site.

type Brand = { businessName: string; brandColor: string };

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(brand: Brand, heading: string, paragraphs: string[], cta?: { label: string; path: string }) {
  const url = cta ? `${publicEnv.siteUrl}${cta.path}` : publicEnv.siteUrl;
  const html = `<!doctype html>
<html lang="da"><body style="margin:0;background:#f7f5f0;font-family:Arial,Helvetica,sans-serif;color:#1f2420;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e3ded3;border-radius:8px;">
<tr><td style="padding:28px 28px 8px 28px;font-size:22px;font-weight:bold;color:${brand.brandColor};">${escapeHtml(brand.businessName)}</td></tr>
<tr><td style="padding:8px 28px 0 28px;font-size:22px;font-weight:bold;">${escapeHtml(heading)}</td></tr>
${paragraphs.map((p) => `<tr><td style="padding:12px 28px 0 28px;font-size:18px;line-height:1.55;">${escapeHtml(p)}</td></tr>`).join("\n")}
${cta ? `<tr><td style="padding:24px 28px 8px 28px;"><a href="${url}" style="display:inline-block;background:${brand.brandColor};color:#ffffff;text-decoration:none;font-size:18px;font-weight:bold;padding:14px 24px;border-radius:6px;">${escapeHtml(cta.label)}</a></td></tr>` : ""}
<tr><td style="padding:24px 28px 28px 28px;font-size:14px;line-height:1.5;color:#5b615c;">Du modtager denne e-mail, fordi du har en konto hos ${escapeHtml(brand.businessName)}. Du kan slå e-mails fra under Min profil.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [brand.businessName, "", heading, "", ...paragraphs.flatMap((p) => [p, ""]), cta ? `${cta.label}: ${url}` : url].join("\n");
  return { html, text };
}

export function membershipConfirmationEmail(brand: Brand, name: string) {
  const subject = `Velkommen til ${brand.businessName}`;
  return {
    subject,
    ...layout(
      brand,
      `Velkommen${name ? `, ${name}` : ""}!`,
      [
        "Dit medlemskab er nu aktivt. Tak fordi du er med.",
        "Næste skridt er et kort spørgeskema om dine mål, din hverdag og dine erfaringer. Christian bruger dine svar til at lave din personlige træningsplan.",
      ],
      { label: "Udfyld spørgeskemaet", path: "/onboarding" },
    ),
  };
}

export function trainingPlanEmail(brand: Brand, name: string, updated: boolean) {
  const subject = updated ? "Din træningsplan er opdateret" : "Din træningsplan er klar";
  return {
    subject,
    ...layout(
      brand,
      subject,
      [
        `Hej${name ? ` ${name}` : ""}. Christian har ${updated ? "opdateret" : "lavet"} din personlige træningsplan.`,
        "Log ind for at se planen under Min træning.",
      ],
      { label: "Se min træning", path: "/min-traening" },
    ),
  };
}

export function billingUpdateEmail(
  brand: Brand,
  name: string,
  kind: "payment_failed" | "canceled" | "expired" | "renewed",
) {
  const content = {
    payment_failed: {
      subject: "Vi kunne ikke gennemføre din betaling",
      lines: [
        "Din seneste betaling for medlemskabet gik ikke igennem. Du har stadig adgang i en periode, mens vi prøver igen.",
        "Opdater gerne dit betalingskort under Min profil, så du ikke mister adgangen.",
      ],
      cta: { label: "Opdater betaling", path: "/min-profil" },
    },
    canceled: {
      subject: "Dit medlemskab er opsagt",
      lines: [
        "Vi har registreret din opsigelse. Du beholder adgangen resten af den periode, du har betalt for.",
        "Du kan altid genoptage medlemskabet under Min profil.",
      ],
      cta: { label: "Se mit medlemskab", path: "/min-profil" },
    },
    expired: {
      subject: "Dit medlemskab er udløbet",
      lines: ["Dit medlemskab er nu udløbet. Du er altid velkommen tilbage."],
      cta: { label: "Bliv medlem igen", path: "/bliv-medlem" },
    },
    renewed: {
      subject: "Dit medlemskab er fornyet",
      lines: ["Tak – din betaling er gennemført, og dit medlemskab fortsætter."],
      cta: { label: "Gå til forsiden", path: "/hjem" },
    },
  }[kind];
  return {
    subject: content.subject,
    ...layout(brand, content.subject, [`Hej${name ? ` ${name}` : ""}.`, ...content.lines], content.cta),
  };
}

export function genericNoticeEmail(brand: Brand, subject: string, lines: string[], cta?: { label: string; path: string }) {
  return { subject, ...layout(brand, subject, lines, cta) };
}
