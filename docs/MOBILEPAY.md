# MobilePay – hvad der virker, og hvad der ikke gør

## Kort fortalt

| Betaling | MobilePay? |
| --- | --- |
| Kostplan (engangskøb) | **Ja**, via Stripe – når MobilePay er aktiveret i Stripe og slået til på produktet |
| Medlemskab (fornyes automatisk) | **Nej** – siden tilbyder ikke MobilePay til medlemskabet |

Medlemskabet betales med betalingskort via Stripe. Det står tydeligt på
`/bliv-medlem`: "MobilePay kan ikke bruges til automatisk fornyelse af
medlemskabet."

## Hvorfor ikke til medlemskabet?

Stripes MobilePay-betalingsmetode understøtter engangsbetalinger, men ikke
gentagne betalinger eller at gemme MobilePay til senere træk:
<https://docs.stripe.com/payments/mobilepay>. Et Stripe-abonnement kan derfor
ikke fornyes automatisk med MobilePay.

Automatisk fornyelse med MobilePay kræver **Vipps MobilePay Recurring API**
og en **erhvervsaftale med Vipps MobilePay**:
<https://developer.vippsmobilepay.com/docs/APIs/recurring-api/recurring-api-guide>.
Den integration er ikke bygget.

`src/lib/payments/mobilepay.ts` → `mobilePayRecurringStatus()` returnerer
derfor altid `{ enabled: false, reason }` – også selv om VIPPS-variablerne er
udfyldt. Admin-siden viser "Ikke aktiveret – kræver aftale med Vipps
MobilePay".

## Sådan ville en MobilePay Recurring-integration fungere (overblik)

Det her er en beskrivelse til en eventuel fremtidig udvidelse – ikke noget,
siden gør i dag. Læs Vipps MobilePays egen guide for de præcise detaljer.

1. **Aftale med Vipps MobilePay.** Virksomheden indgår en aftale og får
   adgang til Recurring API. Man får nøgler til test og produktion:
   client id, client secret, subscription key og et merchant serial number.
2. **Adgangstoken.** Serveren henter et kortvarigt adgangstoken med nøglerne
   og bruger det i alle kald.
3. **Abonnementsaftale (agreement).** Serveren opretter en aftale med pris og
   interval. Medlemmet sendes til MobilePay-appen og godkender aftalen. Først
   når aftalen er aktiv, må der trækkes betalinger.
4. **Træk (charges).** Før hver forfaldsdato opretter serveren et træk på
   aftalen. Vipps MobilePay gennemfører trækket på forfaldsdatoen og prøver
   igen, hvis det fejler.
5. **Webhooks.** Vipps MobilePay sender beskeder om aftaler (aktiveret,
   stoppet, udløbet) og træk (gennemført, fejlet). De skal signaturtjekkes og
   gemmes én gang – på samme måde som Stripe-webhooken her
   (`payment_events` har allerede `provider = 'mobilepay'`).
6. **Opsigelse.** Medlemmet kan stoppe aftalen i appen eller på siden; så
   skal adgangen køre til periodens udløb.

Databasen er forberedt (`subscriptions.provider` og `payment_events.provider`
tillader `'mobilepay'`), men der findes ingen kode, der opretter aftaler,
træk eller modtager Vipps-webhooks.

## Miljøvariabler (i `.env.example`)

```
VIPPS_CLIENT_ID=
VIPPS_CLIENT_SECRET=
VIPPS_SUBSCRIPTION_KEY=
VIPPS_MERCHANT_SERIAL_NUMBER=
VIPPS_TEST_MODE=true
```

Lad dem stå tomme. De bruges kun til at vise, om nøgler er sat – de slår
ikke MobilePay til.

## MobilePay til kostplanen (virker i dag)

1. Stripe Dashboard → Settings → Payments → **Payment methods** → MobilePay →
   **Turn on**.
2. Admin → Priser og produkter → kostplanen → **Tillad MobilePay**.

Kostplanens betalingsside tilbyder derefter både kort og MobilePay. Afviser
Stripe MobilePay (fordi det ikke er aktiveret), får køberen en tydelig dansk
fejlbesked, og der trækkes ingen penge.
