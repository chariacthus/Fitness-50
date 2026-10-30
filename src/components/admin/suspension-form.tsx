import { ConfirmButton } from "@/components/ui/confirm-button";
import { ActionForm, FormTextarea, type FormAction } from "@/components/admin/action-form";

/** Pause or restore a member's community access, with a logged reason (rpc set_community_suspension). */
export function SuspensionForm({
  action,
  userId,
  name,
  suspended,
}: {
  action: FormAction;
  userId: string;
  name: string;
  suspended: boolean;
}) {
  if (suspended) {
    return (
      <ActionForm action={action} hidden={{ user_id: userId, suspend: "false" }} pendingText="Genåbner adgangen…">
        <FormTextarea name="reason" label="Note til loggen" optional rows={2} maxLength={1000} />
        <ConfirmButton
          variant="primary"
          title={`Genåbn adgangen for ${name}?`}
          description={`${name} kan igen læse og skrive i fællesskabet og sende private beskeder. ${name} får en notifikation om det.`}
          confirmLabel="Ja, genåbn adgangen"
        >
          Genåbn adgang til fællesskabet
        </ConfirmButton>
      </ActionForm>
    );
  }
  return (
    <ActionForm action={action} hidden={{ user_id: userId, suspend: "true" }} pendingText="Sætter adgangen på pause…">
      <FormTextarea
        name="reason"
        label="Begrundelse"
        hint="Skriv kort, hvorfor adgangen sættes på pause. Begrundelsen gemmes i moderationsloggen."
        rows={3}
        maxLength={1000}
      />
      <ConfirmButton
        title={`Sæt adgangen på pause for ${name}?`}
        description={`${name} kan ikke længere læse eller skrive i fællesskabet og kan kun sende private beskeder til dig. Medlemskabet og træningsplanen påvirkes ikke. ${name} får en notifikation om det.`}
        confirmLabel="Ja, sæt på pause"
      >
        Sæt adgang til fællesskabet på pause
      </ConfirmButton>
    </ActionForm>
  );
}
