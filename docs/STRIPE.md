# Stripe – opsætning og drift

Stærk50 bruger Stripe Checkout til betaling med kort:

- **Medlemskab** – abonnement (fornyes automatisk hver måned, kvartal eller år).
- **Kostplan** – engangskøb (kort, og MobilePay hvis det er slået til).

Browseren bestemmer aldrig, om noget er betalt. Kun beskeder fra Stripe med en
gyldig signatur (webhooks) ændrer betalingsstatus i databasen.

| Hvad | Hvor i koden |
| --- | --- |
| Tilmeldingsside + checkout | `src/app/(public)/bliv-medlem/` |
| Kostplan-køb | `src/app/(public)/tilkoeb/kostplan/` |
| Webhook | `src/app/api/webhooks/stripe/route.ts` → `src/lib/payments/webhook-handler.ts` |
| Status til bekræftelsessiden | `src/app/api/membership/status/route.ts` |
| Er produktet klar til salg? | `src/lib/stripe/readiness.ts` |
| Stripe → database (ren funktion, testet) | `src/lib/payments/stripe-mapping.ts` |
| Priser og produkter (admin) | `src/app/admin/produkter/` |
| Betalingsoversigt + refusion (admin) | `src/app/admin/betalinger/` |

API-version: koden bruger den version, som `stripe`-pakken (v23) er låst til:
**`2026-10-28.endive`**. Webhook-beskeder bruger den version, der er valgt på
webhook-endpointet. Koden håndterer både den nye form (perioder på
abonnementslinjerne, `invoice.parent.subscription_details`) og den gamle form
fra før 2025-03-31, men vælg samme version på endpointet, når du kan.

---

## 1. Stripe-konto

1. Opret en konto på <https://dashboard.stripe.com/register> med virksomhedens
   oplysninger. Land: **Danmark**, valuta: **DKK**.
2. Hold dig i **testtilstand** (knappen "Test mode" / "Sandbox"), indtil alt
   er afprøvet. Testbetalinger trækker aldrig rigtige penge.
3. Priserne i Stærk50 er **inkl. moms**. Stripe Tax bruges ikke.

## 2. Testnøgler

Developers → API keys:

```
STRIPE_SECRET_KEY=sk_test_…
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…
```

Webhook-nøglen (`STRIPE_WEBHOOK_SECRET=whsec_…`) får du i trin 4 eller 5.

Siden kontrollerer selv, at nøglerne passer til produkterne:

- Et produkt markeret **Testprodukt** kan kun købes med test-nøgler.
- Et rigtigt produkt (ikke test) kan kun købes med live-nøgler.
- Tilmelding er lukket, indtil en administrator åbner den under
  **Admin → Priser og produkter**, og det kan kun lade sig gøre, når alle
  andre punkter er i orden.

## 3. Customer Portal (medlemmets egen betalingsside)

Settings → Billing → **Customer portal**. Indstil:

- **Cancel subscriptions**: slået til, **"At end of billing period"**
  (medlemmet beholder adgangen resten af den betalte periode).
- **Update payment methods**: slået til.
- **Invoice history**: slået til.
- Skift abonnement / mængde: slået **fra** (der er kun ét medlemskab).
- Sprog følger kundens browser; dansk understøttes.

Husk: indstillingerne findes separat for testtilstand og live.

## 4. Webhook lokalt (udvikling)

Installer Stripe CLI (<https://docs.stripe.com/stripe-cli>) og kør:

```bash
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Kommandoen udskriver en `whsec_…`-nøgle. Sæt den i `.env.local` som
`STRIPE_WEBHOOK_SECRET` og genstart `npm run dev`.

## 5. Webhook i produktion

Developers → Webhooks → **Add endpoint**:

- URL: `https://<dit-domæne>/api/webhooks/stripe`
- API-version: `2026-10-28.endive` (eller nyeste)
- Hændelser – vælg **præcis** disse:

```
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
customer.subscription.paused
customer.subscription.resumed
invoice.paid
invoice.payment_failed
charge.refunded
```

Kopiér endpointets signing secret til `STRIPE_WEBHOOK_SECRET` i Vercel og
deploy igen.

Sådan behandles en besked:

1. Signaturen tjekkes mod den rå request-body. Ugyldig → `400`. Stripe ikke
   sat op → `503`.
2. Beskeden gemmes én gang i `payment_events` (unik på Stripe-hændelsens id).
   Allerede behandlet → `200` med det samme. Tidligere fejlet → behandles igen.
3. Abonnementer hentes altid på ny fra Stripe (beskeder kan komme i forkert
   rækkefølge), undtagen ved `customer.subscription.deleted`.
4. Ændringer gemmes betinget, så samtidige beskeder om det samme abonnement
   aldrig giver dobbelte velkomstbeskeder eller e-mails.
5. Ved fejl gemmes fejlen på hændelsen, og der svares `500`, så Stripe prøver
   igen. Fejl kan ses under **Admin → Betalinger**.

Hvad der sker for medlemmet:

| Hændelse | Resultat |
| --- | --- |
| Første aktive medlemskab | Velkomst i fællesskabet, notifikation "Velkommen! Dit medlemskab er aktivt", besked til administratorer, velkomst-e-mail |
| Opsagt (kører perioden ud) | Notifikation med slutdato, e-mail, besked til administratorer |
| Medlemskab udløbet | Notifikation og e-mail |
| Første mislykkede fornyelse | `payment_failed_at` sættes (starter "grace period"), notifikation, e-mail, besked til administratorer. Gentagne forsøg giver ikke flere beskeder |
| `invoice.paid` | `payment_failed_at` nulstilles |
| Kostplan betalt | Købet bliver "betalt", besked til Christian, notifikation til medlemmet om kostspørgsmålene |
| `charge.refunded` (fuld refusion) | Købet bliver "refunderet", og adgangen til tilkøbet fjernes |

E-mails sendes kun, hvis Resend er sat op og e-mails er slået til under
**Admin → Indstillinger**.

## 6. Testkort

Brug en hvilken som helst fremtidig udløbsdato, CVC og postnummer.

| Kort | Resultat |
| --- | --- |
| `4242 4242 4242 4242` | Betalingen lykkes |
| `4000 0025 0000 3155` | Kræver godkendelse (3-D Secure) – godkend i testvinduet |
| `4000 0000 0000 9995` | Afvises ved betaling (utilstrækkelige midler) |
| `4000 0000 0000 0341` | Kan gemmes på kunden, men **alle træk fejler** – brug den til at teste en mislykket fornyelse (se nedenfor) |

Mislykket fornyelse: tilmeld med `4242…`, skift derefter kortet til
`4000 0000 0000 0341` i Customer Portal, og fremtving en fornyelse nu, f.eks.
med Stripe CLI:

```bash
stripe subscriptions update sub_… --billing-cycle-anchor=now --proration-behavior=none
```

Trækket fejler, abonnementet bliver `past_due`, og `invoice.payment_failed`
sendes til webhooken. Fuld liste over testkort: <https://docs.stripe.com/testing>.

Afprøv mindst:

1. Ny konto → `/bliv-medlem` → betal med `4242…` → bekræftelsessiden viser
   "dit medlemskab er aktivt" → spørgeskemaet.
2. Afbryd på Stripes side → `/bliv-medlem/annulleret`.
3. Opsig i Customer Portal → status "Opsagt – aktiv til periodens udløb".
4. Mislykket fornyelse (se ovenfor) → "Betaling mislykkedes", adgang i
   grace-perioden, derefter pause. Skift tilbage til `4242…` → betalingen
   lykkes ved næste forsøg, og adgangen er tilbage.
5. Køb kostplan → refunder under Admin → Betalinger → status "Refunderet".

## 7. Smart Retries (genforsøg ved mislykket fornyelse)

Settings → Billing → **Revenue recovery → Retries**:

- Slå **Smart Retries** til.
- Sæt perioden, så den passer med grace-perioden (standard **7 dage**, kan
  ændres under Admin → Indstillinger). Eksempel: op til 4 forsøg inden for
  **1 uge**.
- Når alle forsøg er brugt: **Cancel the subscription**. Så slutter
  medlemskabet rent, og medlemmet får besked om, at det er udløbet.

Under Settings → Billing → **Customer emails** kan Stripe også selv sende
kvitteringer og e-mails om mislykkede betalinger.

## 8. MobilePay til engangskøb

MobilePay via Stripe kan **kun** bruges til engangsbetalinger (kostplanen),
ikke til abonnementer. Se `docs/MOBILEPAY.md`.

1. Settings → Payments → **Payment methods** → MobilePay → **Turn on**.
2. Admin → Priser og produkter → kostplanen → sæt flueben i
   **Tillad MobilePay**.

Er MobilePay ikke aktiveret hos Stripe, får køberen en tydelig dansk
fejlbesked, og der trækkes ingen penge.

## 9. Priser

Under **Admin → Priser og produkter**:

- Pris skrives i kroner (f.eks. `299,00`) og gemmes i øre.
- Når Stripe er sat op, oprettes Stripe-produktet automatisk, og ved
  prisændring oprettes en **ny** pris i Stripe (Stripe-priser kan ikke
  ændres). Den gamle pris deaktiveres. Eksisterende medlemmer beholder deres
  pris, indtil den ændres i Stripe.
- Er Stripe ikke sat op endnu, gemmes priserne kun i databasen. Tryk
  **Synkroniser med Stripe**, når nøglerne er sat.
- Mens en ændret pris ikke er sendt til Stripe, kan produktet ikke købes – så
  der kan aldrig blive trukket en gammel pris.

## 10. Go-live-tjekliste

- [ ] Stripe-kontoen er aktiveret (virksomhed, CVR, bankkonto).
- [ ] Rigtige priser og tekster er sat, og **Testprodukt** er fjernet.
- [ ] `STRIPE_SECRET_KEY=sk_live_…` og `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_…` i Vercel.
- [ ] Live-webhook oprettet med hændelserne ovenfor; `STRIPE_WEBHOOK_SECRET` er live-endpointets nøgle.
- [ ] Deploy igen, og tryk **Synkroniser med Stripe** på hvert produkt (opretter live-produkt og -pris).
- [ ] Customer Portal, Smart Retries, kunde-e-mails og evt. MobilePay er sat op i **live**.
- [ ] Handelsbetingelser og privatlivspolitik er udfyldt med rigtige oplysninger.
- [ ] `NEXT_PUBLIC_SITE_URL` er det rigtige domæne (bruges i Stripes retur-links).
- [ ] Gennemfør ét rigtigt køb med eget kort, og refunder det.
- [ ] Åbn tilmelding under Admin → Priser og produkter.
- [ ] Hold øje med Admin → Betalinger de første dage (fejlede beskeder vises der).
