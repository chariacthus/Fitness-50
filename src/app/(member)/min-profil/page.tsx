import type { Metadata } from "next";
import { requireViewer } from "@/lib/auth";
import { BUCKETS } from "@/lib/storage";
import { signedUrl } from "@/lib/storage-server";
import { getStripe } from "@/lib/stripe/client";
import { createClient } from "@/lib/supabase/server";
import { loadBillingInfo } from "@/lib/profile/billing";
import { LogoutButton } from "@/components/layout/logout-button";
import { InlineActionForm } from "@/components/profile/inline-action-form";
import { ProfileSection, ProfileSectionNav } from "@/components/profile/section-nav";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { PageHeader, Panel } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { removeAvatar, signOutEverywhere } from "./actions";
import { MembershipSection, type PurchaseRow } from "./membership-section";
import { PrivacySection } from "./privacy-section";
import { AvatarUpload, ProfileForm } from "./profile-form";
import { ChangeEmailForm, ChangePasswordForm } from "./security-forms";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Min profil" };

const SECTIONS = [
  { id: "profil", label: "Profil" },
  { id: "medlemskab", label: "Medlemskab" },
  { id: "sikkerhed", label: "Sikkerhed" },
  { id: "privatliv", label: "Privatliv" },
];

export default async function MyProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Works for every logged-in user – also without an active membership.
  const viewer = await requireViewer("/min-profil");
  const sp = await searchParams;
  const supabase = await createClient();
  const stripeReady = getStripe() !== null;

  const [privateRes, onboardingRes, requestRes, purchasesRes, avatarUrl, billing] = await Promise.all([
    supabase.from("profile_private").select("phone, contact_preference, email_notifications").eq("user_id", viewer.userId).maybeSingle(),
    supabase
      .from("onboarding_submissions")
      .select("health_consent, health_consent_at, health_info")
      .eq("user_id", viewer.userId)
      .maybeSingle(),
    supabase
      .from("data_requests")
      .select("id, created_at")
      .eq("user_id", viewer.userId)
      .eq("type", "deletion")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("purchases")
      .select("id, status, amount, created_at, paid_at, products(name)")
      .eq("user_id", viewer.userId)
      .neq("status", "canceled")
      .order("created_at", { ascending: false })
      .limit(20),
    signedUrl(supabase, BUCKETS.avatars, viewer.profile.avatar_path),
    viewer.membership.state === "admin" ? Promise.resolve({ status: "unavailable" } as const) : loadBillingInfo(viewer.userId, viewer.membership.subscription_id),
  ]);

  const contact = privateRes.data;
  const onboarding = onboardingRes.data;
  const purchases: PurchaseRow[] = (purchasesRes.data ?? []).map((p) => ({
    id: p.id,
    status: p.status,
    amount: p.amount,
    created_at: p.created_at,
    paid_at: p.paid_at,
    productName: p.products?.name ?? "Tilkøb",
  }));
  const name = viewer.profile.full_name || "Dit navn";
  const exportStatus = typeof sp.eksport === "string" ? sp.eksport : undefined;

  return (
    <>
      <PageHeader title="Min profil" description="Her styrer du din profil, dit medlemskab, din adgangskode og dine data." />
      <ProfileSectionNav sections={SECTIONS} />

      <div className="space-y-16">
        <ProfileSection id="profil" title="Profil" description="Det, de andre medlemmer kan se om dig – og hvordan træneren bedst kan kontakte dig.">
          <Panel className="space-y-6">
            <div className="flex flex-wrap items-center gap-4">
              <Avatar name={name} src={avatarUrl} size="lg" />
              <div>
                <p className="text-lg font-semibold">{name}</p>
                <p className="text-ink-soft">{viewer.profile.avatar_path ? "Dit profilbillede" : "Du har ikke noget profilbillede endnu."}</p>
              </div>
            </div>
            <AvatarUpload userId={viewer.userId} hasAvatar={Boolean(viewer.profile.avatar_path)} />
            {viewer.profile.avatar_path ? (
              <InlineActionForm action={removeAvatar} pendingText="Fjerner billedet…">
                <ConfirmButton title="Fjern dit profilbillede?" description="Billedet bliver slettet. Du kan altid tilføje et nyt." confirmLabel="Ja, fjern billedet">
                  Fjern billede
                </ConfirmButton>
              </InlineActionForm>
            ) : null}
          </Panel>
          <Panel>
            {privateRes.error ? (
              <Alert tone="danger">Din profil kunne ikke hentes lige nu. Prøv at genindlæse siden.</Alert>
            ) : (
              <ProfileForm
                profile={{
                  full_name: viewer.profile.full_name,
                  bio: viewer.profile.bio,
                  phone: contact?.phone ?? null,
                  contact_preference: contact?.contact_preference ?? null,
                }}
              />
            )}
          </Panel>
        </ProfileSection>

        <ProfileSection id="medlemskab" title="Medlemskab" description="Dit medlemskab, din betaling og dine tilkøb.">
          <MembershipSection
            summary={viewer.membership}
            billing={billing}
            stripeReady={stripeReady}
            purchases={purchases}
            purchasesError={Boolean(purchasesRes.error)}
          />
        </ProfileSection>

        <ProfileSection id="sikkerhed" title="Sikkerhed" description="Skift din e-mailadresse eller adgangskode, og log ud.">
          <Panel className="space-y-4">
            <h3 id="email-titel" className="text-xl font-semibold">
              E-mailadresse
            </h3>
            <ChangeEmailForm currentEmail={viewer.email} />
          </Panel>
          <Panel className="space-y-4">
            <h3 id="adgangskode-titel" className="text-xl font-semibold">
              Adgangskode
            </h3>
            <ChangePasswordForm />
          </Panel>
          <Panel className="space-y-4">
            <h3 className="text-xl font-semibold">Log ud</h3>
            <p className="max-w-prose">
              Har du været logget ind på en computer, som andre bruger, eller har du mistet din telefon? Så log ud på alle enheder på én gang.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
              <InlineActionForm action={signOutEverywhere} pendingText="Logger ud overalt…">
                <SubmitButton variant="secondary" pendingText="Logger ud…">
                  Log ud på alle enheder
                </SubmitButton>
              </InlineActionForm>
              <div className="sm:w-auto">
                <LogoutButton className="border-2 border-line px-5" />
              </div>
            </div>
          </Panel>
        </ProfileSection>

        <ProfileSection id="privatliv" title="Privatliv" description="Bestem selv over dine oplysninger.">
          <PrivacySection
            emailNotifications={contact ? contact.email_notifications : null}
            health={
              onboarding
                ? {
                    consent: onboarding.health_consent,
                    consentAt: onboarding.health_consent_at,
                    hasInfo: Boolean(onboarding.health_info && onboarding.health_info.trim()),
                  }
                : null
            }
            pendingDeletion={requestRes.data ?? null}
            exportStatus={exportStatus}
            loadError={Boolean(privateRes.error || onboardingRes.error || requestRes.error)}
          />
        </ProfileSection>
      </div>
    </>
  );
}
