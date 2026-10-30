import Link from "next/link";
import { siteAssetUrl } from "@/lib/settings";

/** "Stærk50" → "Stærk" + accented "50" (any trailing digits get the brand colour). */
function Wordmark({ name }: { name: string }) {
  const match = name.match(/^(.*?)(\d+)$/);
  if (!match) return <span>{name}</span>;
  return (
    <span>
      {match[1]}
      <span className="text-brand">{match[2]}</span>
    </span>
  );
}

/** Text wordmark (replaced by the uploaded logo when one is set in admin settings). */
export function Logo({ name, logoPath, href = "/" }: { name: string; logoPath?: string | null; href?: string }) {
  const logoUrl = siteAssetUrl(logoPath);
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-2 font-display text-[1.7rem] leading-none tracking-tight text-ink">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded logo from public bucket
        <img src={logoUrl} alt={name} className="h-10 w-auto" />
      ) : (
        <Wordmark name={name} />
      )}
    </Link>
  );
}
