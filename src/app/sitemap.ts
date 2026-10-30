import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";

const PUBLIC_PAGES: { path: string; priority: number }[] = [
  { path: "/", priority: 1 },
  { path: "/saadan-fungerer-det", priority: 0.8 },
  { path: "/om-christian", priority: 0.8 },
  { path: "/medlemskab", priority: 0.9 },
  { path: "/bliv-medlem", priority: 0.8 },
  { path: "/faq", priority: 0.7 },
  { path: "/kontakt", priority: 0.6 },
  { path: "/privatlivspolitik", priority: 0.3 },
  { path: "/handelsbetingelser", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map(({ path, priority }) => ({
    url: path === "/" ? `${publicEnv.siteUrl}/` : `${publicEnv.siteUrl}${path}`,
    changeFrequency: "monthly",
    priority,
  }));
}
