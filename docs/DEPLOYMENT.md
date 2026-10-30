# Deploying Stærk50 to Vercel

## 1. Before the first deploy

1. The Supabase database is set up (see README → "Supabase").
2. Christian's account exists and has the admin role (`select public.bootstrap_admin('…');`).
3. You have Stripe **test** keys. Live keys only after the go-live checklist in `docs/STRIPE.md`.

## 2. Create the Vercel project

1. Push the repository to GitHub (already done if you are reading this on GitHub).
2. In Vercel: **Add New → Project → Import** the repository.
3. Framework preset: **Next.js** (detected automatically). Build command `next build`, output default.
4. Node.js version: 20 or newer (Project → Settings → General).

## 3. Environment variables

Project → Settings → Environment Variables. Add for **Production** (and
**Preview** if you want preview deployments to work):

| Variable | Value | Secret? |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `https://<your-project>.vercel.app` (later your own domain) | no |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` | no |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | no (public by design) |
| `SUPABASE_SECRET_KEY` | `sb_secret_…` | **yes** |
| `STRIPE_SECRET_KEY` | `sk_test_…` (later `sk_live_…`) | **yes** |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_…` | no |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from the Vercel webhook endpoint (step 5) | **yes** |
| `RESEND_API_KEY` | optional | **yes** |
| `EMAIL_FROM` | optional, e.g. `Stærk50 <hej@ditdomæne.dk>` | no |

Never put a secret in a variable whose name starts with `NEXT_PUBLIC_`.

Redeploy after changing variables (Deployments → ⋯ → Redeploy).

## 4. Supabase URLs

Supabase → Authentication → URL Configuration:

- **Site URL:** `https://<your-project>.vercel.app`
- **Redirect URLs:** add `https://<your-project>.vercel.app/**` and `http://localhost:3000/**`

## 5. Stripe webhook for production

Stripe → Developers → Webhooks → **Add endpoint**:

- URL: `https://<your-project>.vercel.app/api/webhooks/stripe`
- Events: see the list in `docs/STRIPE.md`
- Copy the signing secret into `STRIPE_WEBHOOK_SECRET` and redeploy.

## 6. Smoke test after deploy

1. Open the homepage on a phone and a laptop.
2. Create a test account, confirm the e-mail, log in.
3. As admin: set the price under **Admin → Priser og produkter**, open checkout.
4. Buy the membership with test card `4242 4242 4242 4242`.
5. Check that the confirmation page turns green **only after** the webhook arrived
   (Admin → Betalinger shows the events).
6. Fill in the onboarding questionnaire; check Admin → Onboarding.
7. Create and publish a training plan; check Min træning as the member.
8. Post in Fællesskab from two browsers and see it appear live.

## 7. Own domain (later)

Vercel → Project → Settings → Domains → add the domain and follow the DNS
instructions. Then update `NEXT_PUBLIC_SITE_URL`, the Supabase Site URL /
redirect URLs, the Stripe webhook URL, and redeploy.
