import { notFound } from "next/navigation";
import { PromoFilm } from "./film";

export const dynamic = "force-dynamic";

/**
 * Promotional film (development only). Uses the real design system with
 * clearly labelled sample data. Not reachable in production builds.
 * Play it at /promo, or render it to video with scripts/record-promo.mjs.
 */
export default async function PromoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  return <PromoFilm record={params.record !== undefined} />;
}
