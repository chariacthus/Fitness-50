"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { BUCKETS, DEFAULT_LIMITS } from "@/lib/storage";
import { fieldError, fieldValue, initialFormState } from "@/lib/profile/form-state";
import { CONTACT_PREFERENCES } from "@/lib/profile/display";
import { FileUpload, type UploadedFile } from "@/components/upload/file-upload";
import { SelectField, TextareaField, TextField } from "@/components/ui/form";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { setAvatar, updateProfile } from "./actions";

export type ProfileFormValues = {
  full_name: string;
  bio: string | null;
  phone: string | null;
  contact_preference: string | null;
};

export function ProfileForm({ profile }: { profile: ProfileFormValues }) {
  const [state, action] = useActionState(updateProfile, initialFormState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.ok && state.fieldErrors && Object.keys(state.fieldErrors).length > 0) {
      formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
    }
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-6">
      <TextField
        name="full_name"
        label="Navn"
        hint="Dit navn vises for de andre medlemmer."
        required
        maxLength={120}
        autoComplete="name"
        defaultValue={fieldValue(state, "full_name", profile.full_name)}
        error={fieldError(state, "full_name")}
      />
      <TextareaField
        name="bio"
        label="Om mig – vises for andre medlemmer"
        optional
        rows={4}
        maxLength={500}
        hint="Fx hvor du bor, hvad du træner, eller hvad du gerne vil blive bedre til. Højst 500 tegn."
        defaultValue={fieldValue(state, "bio", profile.bio)}
        error={fieldError(state, "bio")}
      />
      <TextField
        name="phone"
        label="Telefonnummer"
        optional
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        maxLength={40}
        hint="Kun træneren kan se dit telefonnummer."
        defaultValue={fieldValue(state, "phone", profile.phone)}
        error={fieldError(state, "phone")}
      />
      <SelectField
        name="contact_preference"
        label="Hvordan vil du helst kontaktes?"
        optional
        placeholder="Ingen præference"
        options={CONTACT_PREFERENCES.map((o) => ({ value: o.value, label: o.label }))}
        defaultValue={fieldValue(state, "contact_preference", profile.contact_preference)}
        error={fieldError(state, "contact_preference")}
      />
      <div aria-live="polite">
        <FormMessage state={state} />
      </div>
      <SubmitButton size="lg" pendingText="Gemmer…">
        Gem profil
      </SubmitButton>
    </form>
  );
}

/** Uploads to avatars/<userId>/… and then saves the picture on the profile. */
export function AvatarUpload({ userId, hasAvatar }: { userId: string; hasAvatar: boolean }) {
  const router = useRouter();
  async function save(file: UploadedFile) {
    const result = await setAvatar(file.path);
    if (!result.ok) throw new Error(result.error);
    router.refresh();
  }
  return (
    <FileUpload
      label={hasAvatar ? "Skift profilbillede" : "Tilføj profilbillede"}
      hint="JPG, PNG eller WebP. Højst 5 MB. Billedet vises for de andre medlemmer."
      bucket={BUCKETS.avatars}
      folder={userId}
      accept="image"
      maxBytes={DEFAULT_LIMITS.avatarBytes}
      onUploaded={save}
    />
  );
}
