import Link from "next/link";
import { siteAssetUrl } from "@/lib/settings";

/** Text wordmark (replaced by the uploaded logo when one is set in admin settings). */
export function Logo({ name, logoPath, href = "/" }: { name: string; logoPath?: string | null; href?: string }) {
  const logoUrl = siteAssetUrl(logoPath);
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-2 text-2xl font-bold tracking-tight text-brand">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded logo from public bucket
        <img src={logoUrl} alt={name} className="h-10 w-auto" />
      ) : (
        <span>{name}</span>
      )}
    </Link>
  );
}
