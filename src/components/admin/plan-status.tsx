import type { ReactNode } from "react";
import { planStatus } from "@/lib/admin/labels";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

export function PlanStatusBadge({ status }: { status: string }) {
  const info = planStatus(status);
  return <Badge tone={info.tone}>{info.label}</Badge>;
}

/** Large banner at the top of a plan editor: who can see the plan right now. */
export function PlanStatusBanner({ status, children }: { status: string; children?: ReactNode }) {
  const info = planStatus(status);
  return (
    <Alert tone={info.alert} title={info.banner}>
      {children}
    </Alert>
  );
}
