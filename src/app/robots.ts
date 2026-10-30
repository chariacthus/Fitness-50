import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";

// Member, admin, auth and checkout routes are private or useless to search engines.
const PRIVATE_PATHS = [
  "/admin",
  "/api/",
  "/auth/",
  "/log-ind",
  "/log-ud",
  "/opret-konto",
  "/tjek-din-email",
  "/glemt-adgangskode",
  "/nulstil-adgangskode",
  "/hjem",
  "/faellesskab",
  "/beskeder",
  "/min-traening",
  "/min-profil",
  "/notifikationer",
  "/opslag",
  "/onboarding",
  "/medlemmer/",
  "/bliv-medlem/",
  "/tilkoeb/",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS },
    sitemap: `${publicEnv.siteUrl}/sitemap.xml`,
  };
}
