# Stærk50

**Mere styrke. Mere overskud. Sammen.**

Stærk50 is a Danish, members-only fitness coaching platform for men aged 50+,
run by the coach Christian. Members pay a monthly membership and get a
personal training plan made by Christian, a shared community chat, private
messages, training videos and announcements. A personal nutrition plan can be
bought as a one-time add-on.

Everything customers see is in Danish. This README is in English for
developers.

- **Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Supabase (Auth, Postgres + RLS, Storage, Realtime) · Stripe · Resend (optional)
- **Architecture and conventions:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Supabase Auth settings and Danish email templates:** [`docs/SUPABASE_AUTH.md`](docs/SUPABASE_AUTH.md)
- **Stripe setup and webhooks:** [`docs/STRIPE.md`](docs/STRIPE.md)
- **MobilePay status:** [`docs/MOBILEPAY.md`](docs/MOBILEPAY.md)
- **Deploying to Vercel:** [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)

---

## 1. Run it locally

Requirements: Node.js 20+ and npm.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Fill in `.env.local` (see [Environment variables](#6-environment-variables)), then:

```bash
npm run dev
```

Open http://localhost:3000.

## 2. Supabase

### 2.1 Create the database

The schema lives in `supabase/migrations/` (applied in filename order):

| File | Contents |
| --- | --- |
| `20261030000001_schema.sql` | Tables, membership state machine, triggers, RPC functions, Row Level Security |
| `20261030000002_storage.sql` | Storage buckets (private by default) and storage policies |
| `20261030000003_seed.sql` | Settings rows and the two products with clearly marked **test** prices |
| `2026103000001x_*.sql` … | Feature additions, if any |

**Easiest way (one paste):**

```bash
npm run db:setup-sql
```

This writes `supabase/setup.sql`. Open Supabase → **SQL Editor** → New query,
paste the whole file and press **Run**. Do this once on a fresh project.

**Alternative with the Supabase CLI:**

```bash
npx supabase link --project-ref <project-ref>
```

```bash
npx supabase db push
```

### 2.1b Updating an existing database (patches)

If the database was created with an earlier `setup.sql`, run the files in
`supabase/patches/` once each, in date order, in the SQL Editor. They are safe
to run twice and never delete data.

| Patch | What it does |
| --- | --- |
| `2026-10-30-security-fixes.sql` | Security fixes found by the database tests (RPC permissions for visitors, membership check without login, server-side message timestamps, admin access to replace site images) + privacy functions for Min profil |

To start over completely instead, run `supabase/reset.sql` and then
`supabase/setup.sql`. The reset removes all app tables, functions and policies,
including hidden leftovers such as an `on_auth_user_created` trigger on
`auth.users`. User accounts and uploaded files are kept.

### 2.2 Auth settings

Follow [`docs/SUPABASE_AUTH.md`](docs/SUPABASE_AUTH.md): Site URL, redirect
URLs, email confirmation, minimum password length, and the Danish email
templates from `supabase/templates/`.

### 2.3 Storage

Migration `0002` creates the buckets. You do not need to create them by hand.

| Bucket | Public | Used for |
| --- | --- | --- |
| `avatars` | no | Profile pictures (members only) |
| `community` | no | Images in the community chat |
| `announcements` | no | Christian's photos and training videos |
| `training-media` | no | Exercise demonstration videos |
| `site` | **yes** | Logo, coach photo and hero image for the public website |

Private files are only delivered through short-lived signed URLs to users
the policies allow. The Supabase **Free plan limits each file to 50 MB**.
Upgrade to Pro for larger videos, or link to unlisted YouTube/Vimeo videos.

### 2.4 Make Christian an administrator

Nobody can make themselves an administrator from the website. To bootstrap:

1. Christian creates a normal account on the site (`/opret-konto`) and confirms the e-mail.
2. In Supabase → SQL Editor run:

   ```sql
   select public.bootstrap_admin('christian@example.com');
   ```

   or from your machine:

   ```bash
   node --env-file=.env.local scripts/bootstrap-admin.mjs christian@example.com
   ```

The first administrator also becomes the "coach" account. It gets the verified
badge ("Christian · Træner") and receives messages sent to "Skriv til
Christian". You can change this under **Admin → Indstillinger**.

## 3. Payments

### Stripe (cards and subscriptions)

See [`docs/STRIPE.md`](docs/STRIPE.md) for the step-by-step setup: test keys,
Customer Portal, webhook endpoint and events, test cards and go-live checklist.

Checkout stays **closed** until all of these are true:

1. `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set.
2. Christian has set a real price under **Admin → Priser og produkter**, which creates the Stripe Price.
3. Christian has switched checkout on there.

Products marked as *test* can only be bought with Stripe test keys.

Membership access is granted **only** from verified Stripe webhooks
(`/api/webhooks/stripe`). Returning to the success page never activates anything.

For local webhook testing:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

### MobilePay

Stripe's MobilePay supports one-time payments only. Automatic monthly renewal
with MobilePay requires the Vipps MobilePay Recurring API and a merchant
agreement, which is not in place. The site therefore takes subscriptions by
card only. It says so honestly and never advertises MobilePay subscriptions.
Details: [`docs/MOBILEPAY.md`](docs/MOBILEPAY.md).

## 4. Email

- **Login emails** (verification, password reset, e-mail change) are sent by
  Supabase Auth using the Danish templates in `supabase/templates/`.
- **App emails** (membership confirmation, new training plan, billing updates)
  are sent through [Resend](https://resend.com) when `RESEND_API_KEY` and
  `EMAIL_FROM` are set **and** e-mail notifications are switched on in
  **Admin → Indstillinger**. Without them, no email is sent and the app never
  pretends otherwise. In-app notifications always work.
- Emails never contain health information or message text.

## 5. Tests and checks

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm test
```

`npm test` runs the unit tests and the **database security tests**. These
start a throw-away PostgreSQL (via `embedded-postgres`), apply a small
Supabase stand-in (`tests/db/supabase-shim.sql`) plus all migrations, and
check the Row Level Security rules as visitor, member, other member and admin.
No Supabase project or Docker is needed.

Current status: 36 test files, 545 tests, all passing (`npm test`).

After changing a migration, regenerate the TypeScript database types:

```bash
npm run db:types
```

### Promotional film (development only)

`/promo` plays a Danish product film built from the real design system with
sample data (every demo scene is labelled "Eksempel med testdata"). The route
returns 404 in production. To render it to MP4 (needs ffmpeg with libx264):

```bash
npm run dev
```

```bash
node scripts/record-promo.mjs http://localhost:3000 staerk50-praesentation.mp4
```

## 6. Environment variables

See [`.env.example`](.env.example) for the full list with comments.

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | yes | Public URL, used in emails and payment redirects |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Public by design |
| `SUPABASE_SECRET_KEY` | yes | **Server only.** Webhooks, notifications, contact form, admin deletions |
| `STRIPE_SECRET_KEY` | for payments | `sk_test_…` during development |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | for payments | |
| `STRIPE_WEBHOOK_SECRET` | for payments | From the webhook endpoint or `stripe listen` |
| `RESEND_API_KEY`, `EMAIL_FROM` | optional | App emails |
| `VIPPS_*` | not used yet | Reserved for a future MobilePay Recurring integration |

Never put secrets in variables that start with `NEXT_PUBLIC_`.

## 7. Deploy

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) (Vercel).

## 8. What still needs real information or credentials

| Item | Status |
| --- | --- |
| Christian's surname, bio, qualifications, photo, contact details, CVR, address | Placeholders. Fill in under **Admin → Indstillinger** |
| Real membership and nutrition prices | Test prices (marked "Testpris"). Set under **Admin → Priser og produkter** |
| Stripe keys and webhook secret | Not set. Checkout stays closed until they are |
| Resend API key and sender domain | Not set. App emails are off; in-app notifications work |
| Vipps MobilePay Recurring | Not available (no merchant agreement). Card-only subscriptions |
| Privacy policy and terms | Danish drafts with placeholders. **Must be reviewed by a lawyer** before launch |
| Photos | Clearly marked placeholders. Upload real photos in admin settings |

## 9. Project structure

```
src/
  app/
    (public)/      Public website, membership checkout pages
    (auth)/        Login, signup, password reset
    (member)/      Member area: Hjem, Fællesskab, Beskeder, Min træning, Min profil …
    admin/         Christian's administration area
    api/           Stripe webhook, membership status
    auth/, log-ud/ Auth route handlers
  components/      UI kit, layout shells and feature components
  lib/             Supabase clients, auth/membership helpers, payments, email …
  proxy.ts         Session refresh + login redirect for member pages
supabase/
  migrations/      SQL schema, RLS policies, storage, seed
  templates/       Danish Supabase Auth email templates
tests/             Vitest: database security tests and unit tests
docs/              Setup guides
scripts/           Type generation, setup SQL builder, admin bootstrap
```
