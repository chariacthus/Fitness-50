import "server-only";
import { isVippsRecurringConfigured } from "@/lib/server-env";

export type MobilePayRecurringStatus = {
  enabled: false;
  /** Danish explanation for the admin area. */
  reason: string;
  credentialsPresent: boolean;
};

/**
 * MobilePay for automatic membership renewal requires the Vipps MobilePay
 * Recurring API and a merchant agreement. That integration is not built, so
 * this is always disabled – even if the VIPPS_* variables are filled in.
 * See docs/MOBILEPAY.md.
 */
export function mobilePayRecurringStatus(): MobilePayRecurringStatus {
  const credentialsPresent = isVippsRecurringConfigured();
  return {
    enabled: false,
    credentialsPresent,
    reason: credentialsPresent
      ? "Ikke aktiveret – nøglerne er sat, men integrationen med Vipps MobilePay Recurring er ikke bygget og kræver en aftale med Vipps MobilePay."
      : "Ikke aktiveret – kræver aftale med Vipps MobilePay.",
  };
}
