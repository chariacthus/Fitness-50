"use client";

import { useState } from "react";
import { brandContrastWarning, contrastWithWhite, formatContrast, normalizeHex } from "@/lib/admin/color";
import { useFormField } from "@/components/admin/action-form";
import { FieldShell } from "@/components/ui/form";

/** Hex colour field with a live preview and a contrast check against white text. */
export function BrandColorField({ defaultValue }: { defaultValue: string }) {
  const field = useFormField("brand_color");
  const initial = field.submitted ?? defaultValue;
  const [value, setValue] = useState(initial);
  const normalized = normalizeHex(value);
  const ratio = contrastWithWhite(normalized);
  const warning = brandContrastWarning(normalized);
  const hintId = `${field.id}-hint`;
  const statusId = `${field.id}-status`;

  return (
    <FieldShell
      id={field.id}
      label="Brandfarve"
      hint="Bruges på knapper, links og overskrifter. Skriv farven som en hex-kode, f.eks. #4F5D3A."
      error={field.error}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-12 w-24 shrink-0 items-center justify-center rounded-md border-2 border-line-strong font-semibold text-white"
          style={{ background: normalized ?? "transparent" }}
        >
          {normalized ? "Aa" : ""}
        </span>
        <input
          id={field.id}
          name="brand_color"
          defaultValue={initial}
          onChange={(e) => setValue(e.target.value)}
          maxLength={7}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={field.error ? true : undefined}
          aria-describedby={[hintId, statusId, field.error ? `${field.id}-error` : null].filter(Boolean).join(" ")}
          className="block w-40 rounded-md border-2 border-line-strong bg-surface px-4 py-3 font-mono text-base uppercase text-ink focus:border-focus aria-[invalid=true]:border-danger"
        />
      </div>
      <div id={statusId} aria-live="polite">
        {!normalized ? (
          <p className="text-ink-soft">Skriv en gyldig farvekode for at se kontrasten.</p>
        ) : warning ? (
          <p className="rounded-md border-l-4 border-warning bg-warning-soft px-4 py-3 font-semibold">{warning}</p>
        ) : (
          <p className="text-ink-soft">Kontrast med hvid tekst: {ratio != null ? formatContrast(ratio) : ""} – god læsbarhed.</p>
        )}
      </div>
    </FieldShell>
  );
}
