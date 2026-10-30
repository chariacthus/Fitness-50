# Stærk50 – architecture and conventions

Stærk50 is a members-only fitness coaching platform for men aged 50+, run by
one coach (Christian). It is deliberately simple: one Next.js app, one
Supabase project, Stripe for payments.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 App Router, React 19, TypeScript (strict) |
| Styling | Tailwind CSS v4 with design tokens in `src/app/globals.css` |
| Auth | Supabase Auth (email + password, email verification, password reset) |
| Database | Supabase Postgres with Row Level Security on every table |
| Files | Supabase Storage, private buckets + signed URLs (`site` bucket is public) |
| Realtime | Supabase Realtime `postgres_changes` (honours RLS) |
| Payments | Stripe Checkout + Billing (cards). MobilePay via Stripe only for one-time purchases |
| Email | Resend (optional). Auth emails are sent by Supabase |
| Validation | zod 4 |

Cache Components (`cacheComponents`) is **off**. Pages that depend on the
logged-in user are rendered dynamically. Public marketing pages are
pre-rendered (`revalidate`) and must not read cookies: they use
`getSiteSettings()` (cookie-less, cached, expired via `updateTag` on admin
save), `createPublicClient()`, and the client-side `AuthSwitch` for the
"Log ind / Min side" buttons. `params`, `searchParams`,
`cookies()` and `headers()` are async (Promises) in Next.js 16.
`middleware` is called `proxy` (`src/proxy.ts`).

## Security model

All access decisions are made in the database:

- `public._membership_state(user)` is the single source of truth for paid
  access. States: `none | pending | active | canceling | past_due_grace | past_due | expired | admin`.
  Entitled = `active | canceling | past_due_grace | admin`.
- Subscriptions, purchases, payment events and roles can only be written by
  the server (service role) – never by a browser request.
- RLS helpers: `is_admin()`, `is_entitled()`, `can_use_community()`,
  `is_conversation_participant(id)`, `can_send_private_message(id)`, `has_addon(slug)`.
- Guard triggers stop members from changing protected columns (roles, coach
  flag, suspension, review status, message authorship, …).
- Internal functions (prefixed `_`, plus `bootstrap_admin`, `check_rate_limit`)
  are not executable by `anon`/`authenticated`.
- **Function privileges:** functions in `public` are NOT executable by
  PUBLIC/anon (Postgres grants EXECUTE to PUBLIC by default, so every
  migration that creates a function must `revoke execute on function
  public.<fn>(...) from public, anon;` and grant explicitly). Only `is_admin()`
  and `is_entitled()` are granted to anon. `tests/db/visitors.test.ts` fails and
  names any function that breaks this.
- Message `created_at` is always set by the server (trigger), never the client.

Hiding a button is never the protection – the database policy is.

## Supabase clients (`src/lib/supabase/*`)

- `createClient()` from `@/lib/supabase/server` – acts as the logged-in user
  (RLS applies). Default for server components, server actions, route handlers.
- `createClient()` from `@/lib/supabase/client` – browser client for realtime
  subscriptions and direct uploads.
- `createAdminClient()` from `@/lib/supabase/admin` – service role, bypasses
  RLS. Only for webhooks, notifications, the contact form, rate limiting and
  admin operations **after** `requireAdmin()`/`getAdminOrNull()`.

## Shared helpers

| File | Purpose |
| --- | --- |
| `src/lib/auth.ts` | `getViewer()`, `requireViewer()`, `requireEntitledViewer()`, `requireAdmin()`, `getAdminOrNull()` |
| `src/lib/membership.ts` | Membership state labels/tones, `parseMembershipSummary()` |
| `src/lib/settings.ts` | `getSiteSettings()`, `siteAssetUrl()`, `placeholder()` |
| `src/lib/format.ts` | Danish dates (Europe/Copenhagen), `formatDKK(øre)`, `formatInterval()` |
| `src/lib/action-result.ts` | `ActionResult`, `ok()`, `fail()`, `zodFieldErrors()`, `dbErrorMessage()` |
| `src/lib/notifications.ts` | `notifyUser()`, `notifyAdmins()` (server only) |
| `src/lib/email/*` | `sendEmail()`, `emailMember()`, Danish templates – reports real outcome |
| `src/lib/rate-limit.ts` | `checkRateLimit(key, max, windowSeconds)`, `clientIp()` |
| `src/lib/storage.ts` | Bucket names, MIME types, size limits, `userObjectPath()` |
| `src/lib/storage-server.ts` | `signedUrl()`, `signedUrls()` |
| `src/lib/upload-client.ts` | Resumable TUS upload with progress (browser) |
| `src/lib/stripe/client.ts` | `getStripe()` (null when not configured) |
| `src/lib/server-env.ts` | Server secrets + `isStripeConfigured()`, `isStripeTestMode()`, `isEmailConfigured()` |
| `src/lib/onboarding/schema.ts` | Onboarding step schemas, option labels, `describeAnswers()` |
| `src/lib/public-data.ts` | Cookie-less client for public data (lets public pages be pre-rendered) |
| `src/lib/messages/links.ts` | `safeRelativeLink()`, `newConversationHref()` |
| `src/lib/messages/report-server.ts` | `submitReport()` |
| `src/lib/messages/events.ts` | `requestUnreadCountsRefresh()` – refreshes nav badges after "mark as read" |
| `src/lib/auth-flow/draft.ts` | `useFormDraft()` – keeps non-secret form fields in localStorage |

UI kit (`src/components/ui/*`): `Button`, `ButtonLink`, `SubmitButton`,
`TextField`, `TextareaField`, `SelectField`, `CheckboxField`, `ChoiceGroup`,
`Alert`, `FormMessage`, `Badge`, `CountBadge`, `CoachBadge`, `MembershipBadge`,
`Avatar`, `Container`, `PageHeader`, `Panel`, `SectionTitle`, `EmptyState`,
`ImagePlaceholder`, `DetailList`, `BackLink`, `ConfirmButton`, `Spinner`,
`LoadingBlock`. Uploads: `src/components/upload/file-upload.tsx`.

## Conventions

- **All user-facing text is Danish**, including the admin area. Natural,
  plain Danish; no jargon. Dates via `src/lib/format.ts`.
- **Accessibility (WCAG 2.2 AA):** 18px base text, touch targets ≥ 44–48px,
  visible labels (never icon-only), `aria-*` wiring via the UI kit, visible
  focus, no hover-only functionality, loading/empty/error states everywhere.
- **Server actions** live in an `actions.ts` next to the page (`"use server"`),
  validate input with zod, check permissions, use the RLS client by default,
  return `ActionResult`, and call `revalidatePath()` after mutations. Client
  forms use `useActionState` + `SubmitButton` + `FormMessage`.
- **Never fake an outcome.** Success messages only after the database/provider
  call succeeded. No hardcoded statistics, testimonials or credentials.
- **Privacy:** notifications and emails never contain health information or
  private message text. Health info only with explicit consent.
- Prices are integers in øre; display with `formatDKK()`.

## Route map

Public (`src/app/(public)`): `/`, `/om-christian`, `/saadan-fungerer-det`,
`/medlemskab`, `/faq`, `/kontakt`, `/privatlivspolitik`, `/handelsbetingelser`,
`/bliv-medlem` (+ `/bekraeftelse`, `/annulleret`), `/tilkoeb/kostplan` (+ `/bekraeftelse`).

Auth (`src/app/(auth)`): `/log-ind`, `/opret-konto`, `/tjek-din-email`,
`/glemt-adgangskode`, `/nulstil-adgangskode`. Route handlers: `/auth/confirm`,
`/auth/callback`, `/log-ud` (POST).

Member (`src/app/(member)`, login required): `/hjem`, `/faellesskab`,
`/beskeder`, `/beskeder/[id]`, `/beskeder/ny?til=<userId>`, `/min-traening`,
`/min-traening/arkiv/[id]`, `/min-traening/kostplan`, `/min-profil`,
`/notifikationer`, `/opslag`, `/opslag/[id]`, `/onboarding`, `/medlemmer/[id]`.

Admin (`src/app/admin`, admin only): `/admin`, `/admin/medlemmer`,
`/admin/medlemmer/[id]`, `/admin/onboarding`, `/admin/onboarding/[id]`,
`/admin/beskeder`, `/admin/traeningsplaner`, `/admin/traeningsplaner/ny`,
`/admin/traeningsplaner/[id]`, `/admin/traeningsplaner/[id]/forhaandsvisning`,
`/admin/kostplaner`, `/admin/kostplaner/ny`, `/admin/kostplaner/[id]`,
`/admin/kostplaner/[id]/forhaandsvisning`, `/admin/opslag`, `/admin/opslag/ny`,
`/admin/opslag/[id]`, `/admin/rapporter`, `/admin/betalinger`,
`/admin/anmodninger`, `/admin/kontakt`, `/admin/produkter`, `/admin/indstillinger`.

Development only: `/promo` (promotional film; 404 in production, rendered to
MP4 with `scripts/record-promo.mjs`).

API: `/api/webhooks/stripe` (POST, signature-verified),
`/api/membership/status` (GET, for the checkout confirmation page),
`/min-profil/data-eksport` (GET, JSON download of the user's own data).

## Payment flow

1. `/bliv-medlem` shows price, interval, automatic renewal and the right of
   withdrawal. The visitor creates an account / logs in first.
2. A server action creates a Stripe Checkout Session (subscription mode) with
   `client_reference_id = user id` and metadata `{ user_id, product_id }`.
3. Stripe redirects back to `/bliv-medlem/bekraeftelse`, which **only polls**
   the membership state – it never activates anything.
4. `/api/webhooks/stripe` verifies the signature, stores the event once
   (`payment_events` unique on provider+event id), re-reads the subscription
   from Stripe and upserts `subscriptions`. First activation → community
   welcome post, notifications, optional email.
5. Member is sent to `/onboarding`.
