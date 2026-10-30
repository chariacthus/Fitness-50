"use client";

import { BUCKETS, formatFileSize } from "@/lib/storage";
import type { SiteImageField as ImageField } from "@/lib/admin/schemas";
import { FileUpload } from "@/components/upload/file-upload";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { removeSiteImage, saveSiteImage } from "./actions";

/** One brand image (logo, coach photo, hero image) in the public "site" bucket. */
export function SiteImageField({
  field,
  title,
  description,
  currentUrl,
  maxBytes,
}: {
  field: ImageField;
  title: string;
  description: string;
  currentUrl: string | null;
  maxBytes: number;
}) {
  return (
    <div className="space-y-4 rounded-lg border border-line bg-surface p-5">
      <div className="space-y-1">
        <h3 className="text-xl font-semibold">{title}</h3>
        <p className="text-ink-soft">{description}</p>
      </div>
      {currentUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- public brand image chosen by the administrator
        <img src={currentUrl} alt={`Nuværende: ${title}`} className="max-h-48 w-auto rounded-md border border-line bg-muted object-contain" />
      ) : (
        <p className="rounded-md border-2 border-dashed border-line-strong bg-muted px-4 py-6 text-center text-ink-soft">Der er ikke valgt et billede endnu.</p>
      )}
      <FileUpload
        label={`Upload ${currentUrl ? "nyt " : ""}billede: ${title}`}
        hint={`JPG, PNG eller WebP. Højst ${formatFileSize(maxBytes)}. Billedet vises offentligt på hjemmesiden.`}
        bucket={BUCKETS.site}
        folder="brand"
        accept="image"
        maxBytes={maxBytes}
        onUploaded={async (file) => {
          const result = await saveSiteImage({ field, path: file.path });
          if (!result.ok) throw new Error(result.error || "Billedet kunne ikke gemmes. Prøv igen.");
        }}
      />
      {currentUrl ? (
        <ActionForm action={removeSiteImage} hidden={{ field }} pendingText="Fjerner billedet…">
          <ConfirmButton title={`Fjern ${title.toLowerCase()}?`} description="Billedet fjernes fra hjemmesiden." confirmLabel="Ja, fjern billedet">
            Fjern billedet<span className="sr-only">: {title}</span>
          </ConfirmButton>
        </ActionForm>
      ) : null}
    </div>
  );
}
