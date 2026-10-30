import "server-only";

// Server-only secrets. Never import this file from a client component.
export const serverEnv = {
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY ?? "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "",
  // Vipps MobilePay Recurring – not enabled until a merchant agreement exists.
  vippsClientId: process.env.VIPPS_CLIENT_ID ?? "",
  vippsClientSecret: process.env.VIPPS_CLIENT_SECRET ?? "",
  vippsSubscriptionKey: process.env.VIPPS_SUBSCRIPTION_KEY ?? "",
  vippsMerchantSerialNumber: process.env.VIPPS_MERCHANT_SERIAL_NUMBER ?? "",
  vippsTestMode: (process.env.VIPPS_TEST_MODE ?? "true") !== "false",
};

export function isStripeConfigured() {
  return Boolean(serverEnv.stripeSecretKey && serverEnv.stripeWebhookSecret);
}

export function isStripeTestMode() {
  return serverEnv.stripeSecretKey.startsWith("sk_test_") || serverEnv.stripeSecretKey.startsWith("rk_test_");
}

export function isEmailConfigured() {
  return Boolean(serverEnv.resendApiKey && serverEnv.emailFrom);
}

export function isVippsRecurringConfigured() {
  return Boolean(
    serverEnv.vippsClientId &&
      serverEnv.vippsClientSecret &&
      serverEnv.vippsSubscriptionKey &&
      serverEnv.vippsMerchantSerialNumber,
  );
}
