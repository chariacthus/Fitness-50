import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { isEmailConfigured } from "@/lib/server-env";
import { siteAssetUrl } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { memberDisplayName } from "@/lib/admin/members";
import { loadMemberList, loadNames, loadUploadLimits } from "@/lib/admin/queries";
import { ActionForm, FormCheckbox, FormSelect, FormTextarea, FormTextField } from "@/components/admin/action-form";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader, Panel, SectionTitle } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveAdminSettings, saveCoachAccount, saveSiteSettings } from "./actions";
import { BrandColorField } from "./brand-color-field";
import { SiteImageField } from "./site-image-field";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Indstillinger" };

export default async function AdminSettingsPage() {
  await requireAdmin("/admin/indstillinger");
  const supabase = await createClient();

  // Read directly (not the cached fallback from getSiteSettings) so a database
  // problem is shown instead of silently editing default values.
  const [siteRes, adminRes, membersRes, limits] = await Promise.all([
    supabase.from("site_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("admin_settings").select("*").eq("id", 1).maybeSingle(),
    loadMemberList(supabase),
    loadUploadLimits(supabase),
  ]);
  const site = siteRes.data;
  const adminSettings = adminRes.data;
  const admins = membersRes.rows.filter((m) => m.is_admin);
  const emailReady = isEmailConfigured();
  const names = await loadNames(supabase, [site?.updated_by]);

  return (
    <div className="space-y-12">
      <PageHeader
        title="Indstillinger"
        description="Navn, tekster, billeder og kontaktoplysninger, der vises på hele siden – og driftsindstillinger, som kun du ser."
      />

      {siteRes.error || !site ? (
        <Alert tone="danger">Indstillingerne kunne ikke hentes lige nu. Genindlæs siden om lidt.</Alert>
      ) : (
        <>
          <section aria-labelledby="brand-titel" className="space-y-4">
            <SectionTitle id="brand-titel">Forretning, træner og tekster</SectionTitle>
            {site.updated_by ? (
              <p className="text-ink-soft">
                Senest ændret {formatDateTime(site.updated_at)}
                {names.get(site.updated_by) ? ` af ${names.get(site.updated_by)}` : ""}.
              </p>
            ) : null}
            <Panel>
              <ActionForm action={saveSiteSettings} pendingText="Gemmer indstillingerne…" className="space-y-8">
                <fieldset className="space-y-5">
                  <legend className="mb-2 text-xl font-semibold">Forretningen</legend>
                  <FormTextField name="business_name" label="Forretningens navn" required maxLength={80} defaultValue={site.business_name} />
                  <FormTextField name="slogan" label="Slogan" optional maxLength={160} defaultValue={site.slogan} />
                  <BrandColorField key={site.brand_color} defaultValue={site.brand_color} />
                </fieldset>

                <fieldset className="space-y-5 border-t border-line pt-6">
                  <legend className="mb-2 text-xl font-semibold">Træneren</legend>
                  <FormTextField name="coach_name" label="Trænerens navn" required maxLength={80} defaultValue={site.coach_name} hint="Bruges overalt på siden, f.eks. “Skriv til Christian”." />
                  <FormTextField
                    name="coach_badge_label"
                    label="Tekst på trænermærket"
                    required
                    maxLength={60}
                    defaultValue={site.coach_badge_label}
                    hint="Vises ved trænerens navn i fællesskabet og i beskeder."
                  />
                  <FormTextarea name="coach_short_bio" label="Kort præsentation" optional rows={3} maxLength={600} defaultValue={site.coach_short_bio ?? ""} hint="Vises på forsiden. Højst 600 tegn." />
                  <FormTextarea name="coach_bio" label="Præsentation" optional rows={8} maxLength={6000} defaultValue={site.coach_bio ?? ""} hint="Vises på siden om træneren." />
                </fieldset>

                <fieldset className="space-y-5 border-t border-line pt-6">
                  <legend className="mb-2 text-xl font-semibold">Kontakt og firma</legend>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <FormTextField name="contact_email" label="Kontakt-e-mail" optional type="email" maxLength={200} defaultValue={site.contact_email ?? ""} autoComplete="off" />
                    <FormTextField name="contact_phone" label="Telefonnummer" optional type="tel" maxLength={40} defaultValue={site.contact_phone ?? ""} autoComplete="off" />
                    <FormTextField name="company_name" label="Firmanavn" optional maxLength={160} defaultValue={site.company_name ?? ""} />
                    <FormTextField name="cvr_number" label="CVR-nummer" optional inputMode="numeric" maxLength={20} defaultValue={site.cvr_number ?? ""} />
                  </div>
                  <FormTextarea name="company_address" label="Firmaadresse" optional rows={2} maxLength={300} defaultValue={site.company_address ?? ""} hint="Vises nederst på alle sider, på kontaktsiden og i handelsbetingelser og privatlivspolitik." />
                </fieldset>

                <fieldset className="space-y-5 border-t border-line pt-6">
                  <legend className="mb-2 text-xl font-semibold">Tekster</legend>
                  <FormTextarea name="membership_description" label="Beskrivelse af medlemskabet" optional rows={4} maxLength={4000} defaultValue={site.membership_description ?? ""} />
                  <FormTextarea name="nutrition_description" label="Beskrivelse af den personlige kostplan" optional rows={4} maxLength={4000} defaultValue={site.nutrition_description ?? ""} />
                  <FormTextarea
                    name="community_welcome_message"
                    label="Velkomstbesked i fællesskabet"
                    required
                    rows={4}
                    maxLength={2000}
                    defaultValue={site.community_welcome_message}
                    hint="Skrives automatisk i fællesskabet, når et nyt medlem starter. {navn} erstattes med medlemmets fornavn."
                  />
                </fieldset>

                <SubmitButton size="lg" pendingText="Gemmer…">
                  Gem indstillinger
                </SubmitButton>
              </ActionForm>
            </Panel>
          </section>

          <section aria-labelledby="billeder-titel" className="space-y-4">
            <SectionTitle id="billeder-titel">Billeder</SectionTitle>
            <p className="max-w-prose text-ink-soft">Billederne gemmes med det samme, når de er uploadet. Mangler et billede, vises en tydelig pladsholder på siden.</p>
            <div className="grid gap-5 lg:grid-cols-3">
              <SiteImageField
                field="logo_path"
                title="Logo"
                description="Vises øverst på alle sider i stedet for navnet."
                currentUrl={siteAssetUrl(site.logo_path)}
                maxBytes={limits.siteImageBytes}
              />
              <SiteImageField
                field="coach_photo_path"
                title="Billede af træneren"
                description="Vises på forsiden og på siden om træneren."
                currentUrl={siteAssetUrl(site.coach_photo_path)}
                maxBytes={limits.siteImageBytes}
              />
              <SiteImageField
                field="hero_image_path"
                title="Forsidebillede"
                description="Det store billede øverst på forsiden."
                currentUrl={siteAssetUrl(site.hero_image_path)}
                maxBytes={limits.siteImageBytes}
              />
            </div>
          </section>

          <section aria-labelledby="traenerkonto-titel" className="space-y-4">
            <SectionTitle id="traenerkonto-titel">Trænerkonto</SectionTitle>
            <Panel>
              {membersRes.error ? (
                <Alert tone="danger">Listen over administratorer kunne ikke hentes lige nu.</Alert>
              ) : (
                <ActionForm action={saveCoachAccount} pendingText="Gemmer…">
                  <FormSelect
                    name="coach_user_id"
                    label="Hvilken konto er træneren?"
                    hint="Det er den konto, medlemmerne skriver til, når de vælger at skrive til træneren, og som står som afsender af velkomstbeskeden i fællesskabet. Kun administratorer kan vælges."
                    placeholder="Ingen trænerkonto valgt"
                    defaultValue={site.coach_user_id ?? ""}
                    options={admins.map((a) => ({ value: a.id, label: a.email ? `${memberDisplayName(a.full_name)} (${a.email})` : memberDisplayName(a.full_name) }))}
                  />
                  <SubmitButton>Gem trænerkonto</SubmitButton>
                </ActionForm>
              )}
            </Panel>
          </section>
        </>
      )}

      <section aria-labelledby="drift-titel" className="space-y-4">
        <SectionTitle id="drift-titel">Drift og e-mail</SectionTitle>
        {emailReady ? (
          <Alert tone="success" title="E-mailafsendelse er sat op">
            Siden kan sende e-mails til medlemmer og til dig, når det er slået til herunder.
          </Alert>
        ) : (
          <Alert tone="warning" title="E-mailafsendelse er ikke sat op">
            Der bliver ikke sendt nogen e-mails fra siden, før RESEND_API_KEY og EMAIL_FROM er sat på serveren. Notifikationer på siden virker som
            normalt. E-mails ved oprettelse af konto og nulstilling af adgangskode sendes af Supabase og påvirkes ikke.
          </Alert>
        )}
        {adminRes.error || !adminSettings ? (
          <Alert tone="danger">Driftsindstillingerne kunne ikke hentes lige nu.</Alert>
        ) : (
          <Panel>
            <ActionForm action={saveAdminSettings} pendingText="Gemmer…" className="space-y-6">
              <FormCheckbox
                name="email_notifications_enabled"
                label="Send e-mails fra siden (f.eks. når en træningsplan er klar)"
                hint="Medlemmer kan selv fravælge e-mails under Min profil."
                defaultChecked={adminSettings.email_notifications_enabled}
              />
              <FormTextField
                name="admin_notification_email"
                label="Din e-mail til notifikationer"
                optional
                type="email"
                maxLength={200}
                defaultValue={adminSettings.admin_notification_email ?? ""}
                hint="Hvis feltet er udfyldt, kan siden sende dig en e-mail om f.eks. nye onboardingskemaer."
              />
              <div className="grid gap-5 sm:grid-cols-2">
                <FormTextField
                  name="grace_period_days"
                  label="Dage med adgang efter mislykket betaling"
                  inputMode="numeric"
                  maxLength={2}
                  defaultValue={String(adminSettings.grace_period_days)}
                  hint="0–60 dage. Medlemmet beholder adgangen, mens betalingen forsøges igen."
                />
                <FormTextField
                  name="data_retention_months"
                  label="Opbevaring af data (måneder)"
                  inputMode="numeric"
                  maxLength={3}
                  defaultValue={String(adminSettings.data_retention_months)}
                  hint="1–120 måneder. Retningslinje for, hvor længe data om tidligere medlemmer gemmes. Der slettes ikke noget automatisk."
                />
                <FormTextField
                  name="max_image_mb"
                  label="Største billede (MB)"
                  inputMode="numeric"
                  maxLength={2}
                  defaultValue={String(adminSettings.max_image_mb)}
                  hint="1–50 MB. Billeder til hjemmesiden kan højst fylde 10 MB."
                />
                <FormTextField
                  name="max_video_mb"
                  label="Største video (MB)"
                  inputMode="numeric"
                  maxLength={4}
                  defaultValue={String(adminSettings.max_video_mb)}
                  hint="Supabase Free-planen tillader højst 50 MB pr. fil."
                />
              </div>
              <SubmitButton>Gem driftsindstillinger</SubmitButton>
            </ActionForm>
          </Panel>
        )}
      </section>

      <section aria-labelledby="priser-titel" className="space-y-4">
        <SectionTitle id="priser-titel">Priser og betaling</SectionTitle>
        <Panel className="space-y-3">
          <p>Priser, produkter og om betalingssiden er åben, styres under Priser og produkter.</p>
          <ButtonLink href="/admin/produkter" variant="secondary">
            Gå til priser og produkter
          </ButtonLink>
        </Panel>
      </section>
    </div>
  );
}
