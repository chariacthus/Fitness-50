"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/action-result";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { markAllNotificationsRead, markNotificationRead, openNotification } from "./actions";

/** "Åbn" and "Markér som læst" for one notification. */
export function NotificationActions({ id, title, canOpen, unread }: { id: string; title: string; canOpen: boolean; unread: boolean }) {
  const [openState, openAction] = useActionState(openNotification, initialActionState);
  const [readState, readAction] = useActionState(markNotificationRead, initialActionState);

  if (!canOpen && !unread) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {canOpen ? (
          <form action={openAction}>
            <input type="hidden" name="id" value={id} />
            <SubmitButton pendingText="Åbner…">
              Åbn<span className="sr-only">: {title}</span>
            </SubmitButton>
          </form>
        ) : null}
        {unread ? (
          <form action={readAction}>
            <input type="hidden" name="id" value={id} />
            <SubmitButton variant="secondary" pendingText="Gemmer…">
              Markér som læst<span className="sr-only">: {title}</span>
            </SubmitButton>
          </form>
        ) : null}
      </div>
      <div aria-live="polite">
        <FormMessage state={openState} />
        <FormMessage state={readState} />
      </div>
    </div>
  );
}

/** "Markér alle som læst". */
export function MarkAllReadForm() {
  const [state, action] = useActionState(markAllNotificationsRead, initialActionState);
  return (
    <form action={action} className="space-y-3">
      <SubmitButton variant="secondary" pendingText="Gemmer…">
        Markér alle som læst
      </SubmitButton>
      <div aria-live="polite">
        <FormMessage state={state} />
      </div>
    </form>
  );
}
