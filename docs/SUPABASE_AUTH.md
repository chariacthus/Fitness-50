# Supabase Auth – setup for Stærk50

Stærk50 uses Supabase Auth with **e-mail + password**. Members create an
account, confirm their e-mail through a link, and can reset a forgotten
password. All auth emails are sent by Supabase using the Danish templates in
`supabase/templates/`.

Do the steps below once per Supabase project (production, and staging if you
have one). Menu names refer to the Supabase dashboard; they move around now and
then, so search the dashboard for the setting name if a path does not match.

## 1. URL configuration

**Authentication → URL Configuration**

| Setting | Value |
| --- | --- |
| Site URL | The live address without a trailing slash, e.g. `https://<your-domain>` (or `https://<your-project>.vercel.app` until a domain is connected). Must equal `NEXT_PUBLIC_SITE_URL` in Vercel. |
| Redirect URLs | `http://localhost:3000/**` |
| | `https://<your-project>.vercel.app/**` |
| | `https://<your-domain>/**` (when a custom domain is connected) |
| | Optional, for Vercel preview deployments: `https://*-<your-vercel-team>.vercel.app/**` |

The email templates build their links from `{{ .SiteURL }}`, so the Site URL
**must** be the address members use. Links in emails point to
`/auth/confirm` on that address.

## 2. Email provider and passwords

**Authentication → Sign In / Providers → Email**

| Setting | Value | Why |
| --- | --- | --- |
| Enable Email provider | ON | |
| Confirm email | **ON** | Members must confirm their address before they can log in. |
| Secure email change | **ON** | A change of e-mail must be confirmed from both the old and the new address. |
| Secure password change | ON (recommended) | Changing the password from an old session requires a recent login. |
| Minimum password length | **8** | Matches the form validation (8–72 characters). |
| Password requirements | "No required characters" (default) | Long, memorable passwords are better than complex short ones for our members. |
| Email OTP expiration | 3600 seconds (default), max 86400 | How long the links in the emails work. The site only says "begrænset tid", so any value works. |
| Leaked password protection | ON if your plan includes it | The site shows a Danish message when a leaked password is rejected. |

Under **Authentication → Sign In / Providers → User Signups** keep
"Allow new users to sign up" ON. Do not enable anonymous sign-ins, phone or
social providers – the site does not use them.

## 3. Email templates (Danish)

**Authentication → Emails → Templates**. For each template: set the subject,
switch the body to the HTML/source view, delete the default content, and paste
the full content of the file.

| Dashboard template | Subject (paste exactly) | File |
| --- | --- | --- |
| Confirm signup | `Bekræft din e-mail hos Stærk50` | `supabase/templates/confirmation.html` |
| Invite user | `Du er inviteret til Stærk50` | `supabase/templates/invite.html` |
| Magic link | `Dit link til at logge ind på Stærk50` | `supabase/templates/magic_link.html` |
| Change email address | `Bekræft din nye e-mail hos Stærk50` | `supabase/templates/email_change.html` |
| Reset password | `Vælg en ny adgangskode til Stærk50` | `supabase/templates/recovery.html` |
| Reauthentication | `Din bekræftelseskode til Stærk50` | `supabase/templates/reauthentication.html` |

Notes:

- The templates link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=…&next=…`.
  The route handler `src/app/auth/confirm/route.ts` verifies the token and
  logs the member in, then sends them on:
  - signup confirmation → `/bliv-medlem`
  - password reset and invitation → `/nulstil-adgangskode` (choose a password)
  - e-mail change → `/min-profil`
  - magic link → `/hjem`
- An expired or already used link sends the member to
  `/log-ind?fejl=link`, which explains what to do.
- The business name "Stærk50" is written directly in the templates and
  subjects (Supabase cannot read the site settings). If the business name is
  changed under `/admin/indstillinger`, update the templates too.
- The templates contain no personal or health information – only the link
  (and, for e-mail change, the old and new address).
- Some corporate mail filters open links automatically to scan them, which can
  use up a one-time link before the member clicks it. If members report that
  links are "already used", ask them to request a new link (the site offers
  this on `/log-ind`, `/tjek-din-email` and `/glemt-adgangskode`).

### Local development (Supabase CLI, optional)

If you run Supabase locally, point `supabase/config.toml` at the same files:

```toml
[auth]
site_url = "http://localhost:3000"
additional_redirect_urls = ["http://localhost:3000/**"]
minimum_password_length = 8

[auth.email]
enable_confirmations = true
double_confirm_changes = true

[auth.email.template.confirmation]
subject = "Bekræft din e-mail hos Stærk50"
content_path = "./supabase/templates/confirmation.html"

[auth.email.template.recovery]
subject = "Vælg en ny adgangskode til Stærk50"
content_path = "./supabase/templates/recovery.html"

[auth.email.template.email_change]
subject = "Bekræft din nye e-mail hos Stærk50"
content_path = "./supabase/templates/email_change.html"

[auth.email.template.magic_link]
subject = "Dit link til at logge ind på Stærk50"
content_path = "./supabase/templates/magic_link.html"

[auth.email.template.invite]
subject = "Du er inviteret til Stærk50"
content_path = "./supabase/templates/invite.html"

[auth.email.template.reauthentication]
subject = "Din bekræftelseskode til Stærk50"
content_path = "./supabase/templates/reauthentication.html"
```

## 4. Custom SMTP (required before launch)

Supabase's built-in email sender is only meant for testing: it sends very few
emails per hour and, by default, only to members of your Supabase team. Real
members would not receive their confirmation or reset emails.

Set up custom SMTP under **Authentication → Emails → SMTP Settings**, for
example with Resend:

1. In Resend: add and verify your domain (DNS records for SPF/DKIM), then
   create an API key.
2. In Supabase, enable custom SMTP:
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: the Resend API key
   - Sender email: e.g. `kontakt@<your-domain>` (must be on the verified domain)
   - Sender name: `Stærk50`
3. Afterwards, check **Authentication → Rate Limits** and raise "Rate limit for
   sending emails" to a sensible number (e.g. 30–100 per hour).

The site's own rate limits (in addition to Supabase's) are:

| Action | Limit |
| --- | --- |
| Create account | 10 per hour per IP |
| Log in | 20 per 15 minutes per IP, 10 per 15 minutes per e-mail |
| Forgot password | 5 per hour per IP, 3 per hour per e-mail |
| Resend confirmation | 5 per hour per IP, 3 per hour per e-mail |

## 5. Sessions and JWT

- The site stores the session in cookies via `@supabase/ssr`. `src/proxy.ts`
  refreshes the session on every request, and the server verifies the user
  with `supabase.auth.getClaims()`.
- **Project Settings → JWT Keys**: use the asymmetric signing keys (the default
  for new projects). Then `getClaims()` verifies tokens locally, which is
  faster. Keep the access token expiry at the default 3600 seconds.
- **Authentication → Sessions**: keep "Detect and revoke potentially
  compromised refresh tokens" ON (refresh token rotation). Time-box / inactivity
  timeouts are optional; if you set them, use generous values (e.g. 30 days
  inactivity) – our members should not be logged out all the time.
- "Log ud" (`POST /log-ud`) logs out the current device only. Choosing a new
  password through the reset link logs the member out on all devices, and they
  log in again with the new password.
- Do not enable "Allow manual linking" or anonymous sign-ins.

## 6. Make the coach an administrator

There is no sign-up form for administrators. To bootstrap the first admin:

1. Create a normal account on the website (`/opret-konto`) with the coach's
   e-mail, and confirm the e-mail via the link.
2. In Supabase, open **SQL Editor** and run (with the real e-mail):

   ```sql
   select public.bootstrap_admin('email@example.com');
   ```

   This gives the account the admin role and marks it as the coach (shown with
   the coach badge). Alternatively, from a machine with `.env.local`:
   `node --env-file=.env.local scripts/bootstrap-admin.mjs email@example.com`.
3. Log out and in again. The admin area is at `/admin`.

`bootstrap_admin` cannot be called from the website or the API – only from the
SQL editor or with the secret key.

## 7. Quick test after setup

1. Open `/opret-konto`, create an account with a real e-mail you can read.
2. You land on `/tjek-din-email`. The Danish e-mail arrives (check spam).
3. Click "Bekræft min e-mail" → you are logged in and sent to `/bliv-medlem`.
4. Log out, then use "Glemt adgangskode?" on `/log-ind`. Click the link in the
   e-mail → `/nulstil-adgangskode` → choose a new password → you see
   "Din adgangskode er opdateret" on `/log-ind`.
5. Click an old (used) link again → `/log-ind` explains that the link has
   expired.
