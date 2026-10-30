import "server-only";
import { billingUpdateEmail, emailMember, membershipConfirmationEmail } from "@/lib/email";
import { formatDate } from "@/lib/format";
import { notifyAdmins, notifyUser } from "@/lib/notifications";
import type { createAdminClient } from "@/lib/supabase/admin";

// Notifications and emails caused by verified payment events. They are
// best-effort: a failed email must never undo or block a payment update, so
// errors are logged and swallowed. Texts never contain health information.

type AdminClient = ReturnType<typeof createAdminClient>;

async function attempt(label: string, run: () => Promise<unknown>) {
  try {
    const result = await run();
    if (result === false) console.warn(`[payments] ${label}: blev ikke gemt`);
    if (result && typeof result === "object" && "sent" in result && result.sent === false && "reason" in result) {
      const reason = (result as { reason: string }).reason;
      if (reason === "failed") console.warn(`[payments] ${label}: e-mail kunne ikke sendes`);
    }
  } catch (error) {
    console.error(`[payments] ${label}:`, error instanceof Error ? error.message : error);
  }
}

async function memberName(admin: AdminClient, userId: string) {
  const { data } = await admin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  return data?.full_name?.trim() || "Et medlem";
}

/** Membership became entitled. First time: welcome post, notifications and email. */
export async function onMembershipActivated(admin: AdminClient, userId: string) {
  const { data: profile } = await admin.from("profiles").select("full_name, welcomed_at").eq("id", userId).maybeSingle();
  const name = profile?.full_name?.trim() || "Et nyt medlem";

  if (profile && profile.welcomed_at) {
    await attempt("notify reactivated", () =>
      notifyUser({
        userId,
        type: "membership",
        title: "Dit medlemskab er aktivt igen",
        body: "Velkommen tilbage. Du har igen adgang til hele medlemsområdet.",
        link: "/hjem",
      }),
    );
    return;
  }

  await attempt("community welcome", async () => {
    const { error } = await admin.rpc("_post_community_welcome", { p_user: userId });
    if (error) throw new Error(error.message);
  });
  await attempt("notify member welcome", () =>
    notifyUser({
      userId,
      type: "membership",
      title: "Velkommen! Dit medlemskab er aktivt",
      body: "Næste skridt er et kort spørgeskema om dine mål og din hverdag, så din træningsplan kan blive lavet.",
      link: "/onboarding",
    }),
  );
  await attempt("notify admins new member", () =>
    notifyAdmins({
      type: "new_member",
      title: "Nyt medlem",
      body: `${name} har betalt og er blevet medlem.`,
      link: `/admin/medlemmer/${userId}`,
    }),
  );
  await attempt("email welcome", () => emailMember(userId, membershipConfirmationEmail));
}

/** Membership was cancelled and runs until the end of the paid period. */
export async function onMembershipCanceling(admin: AdminClient, userId: string, accessEndsAt: string | null) {
  const until = accessEndsAt ? formatDate(accessEndsAt) : null;
  const name = await memberName(admin, userId);
  await attempt("notify member canceling", () =>
    notifyUser({
      userId,
      type: "membership",
      title: "Dit medlemskab er opsagt",
      body: until
        ? `Du har adgang indtil ${until}. Der bliver ikke trukket flere betalinger.`
        : "Du beholder adgangen resten af den periode, du har betalt for. Der bliver ikke trukket flere betalinger.",
      link: "/min-profil",
    }),
  );
  await attempt("email canceled", () => emailMember(userId, (brand, first) => billingUpdateEmail(brand, first, "canceled")));
  await attempt("notify admins canceling", () =>
    notifyAdmins({
      type: "payment",
      title: "Et medlem har opsagt",
      body: until ? `${name} har opsagt medlemskabet. Adgangen slutter ${until}.` : `${name} har opsagt medlemskabet.`,
      link: `/admin/medlemmer/${userId}`,
    }),
  );
}

/** Membership has ended. */
export async function onMembershipExpired(userId: string) {
  await attempt("notify member expired", () =>
    notifyUser({
      userId,
      type: "membership",
      title: "Dit medlemskab er udløbet",
      body: "Du er altid velkommen tilbage.",
      link: "/bliv-medlem",
    }),
  );
  await attempt("email expired", () => emailMember(userId, (brand, first) => billingUpdateEmail(brand, first, "expired")));
}

/** First failed renewal in a dunning cycle. */
export async function onRenewalPaymentFailed(admin: AdminClient, userId: string) {
  const name = await memberName(admin, userId);
  await attempt("notify member payment failed", () =>
    notifyUser({
      userId,
      type: "payment",
      title: "Betaling mislykkedes",
      body: "Vi kunne ikke trække betalingen for dit medlemskab. Opdater dit betalingskort under Min profil, så du ikke mister adgangen.",
      link: "/min-profil",
    }),
  );
  await attempt("email payment failed", () =>
    emailMember(userId, (brand, first) => billingUpdateEmail(brand, first, "payment_failed")),
  );
  await attempt("notify admins payment failed", () =>
    notifyAdmins({
      type: "payment",
      title: "Betaling mislykkedes",
      body: `Betalingen for medlemskabet gik ikke igennem for ${name}. Stripe prøver automatisk igen.`,
      link: `/admin/medlemmer/${userId}`,
    }),
  );
}

/** A nutrition plan purchase was paid. */
export async function onNutritionPurchased(admin: AdminClient, userId: string) {
  const name = await memberName(admin, userId);
  await attempt("notify admins nutrition", () =>
    notifyAdmins({
      type: "nutrition_request",
      title: "Ny kostplan bestilt",
      body: `${name} har købt en personlig kostplan.`,
      link: `/admin/medlemmer/${userId}`,
    }),
  );
  await attempt("notify member nutrition", () =>
    notifyUser({
      userId,
      type: "payment",
      title: "Tak for dit køb",
      body: "Besvar kostspørgsmålene, så kan arbejdet med din kostplan begynde.",
      link: "/onboarding?trin=7",
    }),
  );
}
