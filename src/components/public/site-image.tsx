import { cn } from "@/components/ui/cn";
import { ImagePlaceholder } from "@/components/ui/layout";
import { siteAssetUrl } from "@/lib/settings";

/** Image uploaded in admin settings (public "site" bucket), or a marked placeholder. */
export function SiteImage({
  path,
  alt,
  placeholderLabel,
  className,
  priority = false,
}: {
  path: string | null | undefined;
  alt: string;
  placeholderLabel: string;
  className?: string;
  priority?: boolean;
}) {
  const url = siteAssetUrl(path);
  if (!url) return <ImagePlaceholder label={placeholderLabel} className={className} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded image from the public site bucket
    <img
      src={url}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      className={cn("aspect-[4/3] w-full rounded-lg bg-muted object-cover", className)}
    />
  );
}
