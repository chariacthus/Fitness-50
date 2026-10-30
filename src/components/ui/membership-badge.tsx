import { Badge } from "@/components/ui/badge";
import { MEMBERSHIP_LABELS, MEMBERSHIP_TONES, type MembershipState } from "@/lib/membership";

const toneMap = { success: "success", warning: "warning", danger: "danger", neutral: "neutral" } as const;

export function MembershipBadge({ state }: { state: MembershipState }) {
  return <Badge tone={toneMap[MEMBERSHIP_TONES[state]]}>{MEMBERSHIP_LABELS[state]}</Badge>;
}
