import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/layout";
import { formatDKK, formatInterval } from "@/lib/format";
import { CARD_PAYMENT_NOTE, renewalNotice } from "@/components/public/copy";
import { FeatureList } from "@/components/public/feature-list";
import { getPublicProducts, type PublicProduct } from "@/components/public/products";
import { TextLink } from "@/components/public/text-link";

function PriceLine({ product }: { product: PublicProduct }) {
  if (product.price_amount == null) {
    return <p className="text-2xl font-semibold">Prisen offentliggøres snart</p>;
  }
  return (
    <p className="flex flex-wrap items-baseline gap-x-2">
      <span className="text-4xl font-bold tracking-tight">{formatDKK(product.price_amount)}</span>
      <span className="text-lg text-ink-soft">{formatInterval(product.billing_interval)}</span>
    </p>
  );
}

function ProductHeader({ product, eyebrow }: { product: PublicProduct; eyebrow?: string }) {
  return (
    <div className="space-y-2">
      {eyebrow ? <p className="font-semibold text-brand">{eyebrow}</p> : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 id={`produkt-${product.slug}`} className="text-2xl font-bold">
          {product.name}
        </h3>
        {product.is_test ? <Badge tone="warning">Testpris – ikke endelig</Badge> : null}
      </div>
      {product.short_description ? <p className="text-lg text-ink-soft">{product.short_description}</p> : null}
    </div>
  );
}

export function MembershipCard({ product }: { product: PublicProduct }) {
  return (
    <article aria-labelledby={`produkt-${product.slug}`} className="space-y-6 rounded-lg border-2 border-brand bg-surface p-6 sm:p-8">
      <ProductHeader product={product} />
      <PriceLine product={product} />
      {product.features.length > 0 ? (
        <div className="space-y-3">
          <p className="font-semibold">Det er inkluderet:</p>
          <FeatureList items={product.features} />
        </div>
      ) : null}
      <div className="space-y-2 border-t border-line pt-5">
        <p className="font-semibold">{renewalNotice(product.billing_interval)}</p>
        <p className="text-ink-soft">{CARD_PAYMENT_NOTE}</p>
      </div>
      <ButtonLink href="/bliv-medlem" size="lg" className="w-full sm:w-auto">
        Bliv medlem
      </ButtonLink>
    </article>
  );
}

export function NutritionCard({ product }: { product: PublicProduct }) {
  return (
    <article id="kostplan" aria-labelledby={`produkt-${product.slug}`} className="scroll-mt-6 space-y-6 rounded-lg border border-line-strong bg-surface p-6 sm:p-8">
      <ProductHeader product={product} eyebrow="Tilkøb" />
      <PriceLine product={product} />
      {product.features.length > 0 ? <FeatureList items={product.features} /> : null}
      <div className="space-y-2 border-t border-line pt-5">
        <p className="font-semibold">Kræver et medlemskab.</p>
        <p className="text-ink-soft">
          {product.mobilepay_enabled ? "Kan betales med betalingskort eller MobilePay." : "Betales med betalingskort."}
        </p>
      </div>
      <ButtonLink href="/tilkoeb/kostplan" variant="secondary" size="lg" className="w-full sm:w-auto">
        Tilkøb kostplan (kræver medlemskab)
      </ButtonLink>
    </article>
  );
}

/**
 * Current prices from the products table. Shared by the homepage and
 * /medlemskab. Only shows what is actually configured – no invented prices.
 */
export async function Pricing({ showNutrition = true }: { showNutrition?: boolean }) {
  const result = await getPublicProducts();

  if (!result.ok) {
    return (
      <Alert tone="warning" title="Priserne kunne ikke hentes lige nu">
        Prøv at genindlæse siden om lidt. Du er også velkommen til at <TextLink href="/kontakt">kontakte os</TextLink>.
      </Alert>
    );
  }

  const nutrition = showNutrition ? result.nutrition : null;
  if (result.memberships.length === 0 && !nutrition) {
    return (
      <EmptyState title="Priserne offentliggøres snart">
        Medlemskabet er ved at blive gjort klar. Har du spørgsmål i mellemtiden, er du velkommen til at{" "}
        <TextLink href="/kontakt">skrive til os</TextLink>.
      </EmptyState>
    );
  }

  return (
    <div className={cn("grid items-start gap-6", nutrition ? "lg:grid-cols-[3fr_2fr]" : "max-w-3xl")}>
      <div className="space-y-6">
        {result.memberships.length > 0 ? (
          result.memberships.map((product) => <MembershipCard key={product.id} product={product} />)
        ) : (
          <EmptyState title="Medlemskabet åbner snart">Prisen på medlemskabet offentliggøres snart.</EmptyState>
        )}
      </div>
      {nutrition ? <NutritionCard product={nutrition} /> : null}
    </div>
  );
}
