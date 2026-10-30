import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getSiteSettings } from "@/lib/settings";
import { publicEnv } from "@/lib/env";
import { RippleEffect } from "@/components/ui/ripple";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  return {
    metadataBase: new URL(publicEnv.siteUrl),
    title: { default: `${settings.business_name} – ${settings.slogan}`, template: `%s · ${settings.business_name}` },
    description:
      "Personlig træning og et stærkt fællesskab for mænd over 50. Få en plan, der passer til din hverdag, dit niveau og dine mål.",
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#faf8f4",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettings();
  const brand = /^#[0-9a-fA-F]{6}$/.test(settings.brand_color) ? settings.brand_color : "#4f5d3a";
  return (
    <html lang="da" style={{ ["--brand" as string]: brand }}>
      <body className="min-h-screen antialiased">
        <a
          href="#indhold"
          className="sr-only z-50 rounded-md bg-surface px-4 py-3 font-semibold text-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Gå til indhold
        </a>
        {children}
        <RippleEffect />
      </body>
    </html>
  );
}
