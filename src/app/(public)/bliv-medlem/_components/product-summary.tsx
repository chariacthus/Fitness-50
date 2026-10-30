import { Badge } from "@/components/ui/badge";
import { formatDKK, formatInterval } from "@/lib/format";

type SummaryProduct = {
  name: string;
  short_description: string | null;
  description: string | null;
  features: string[];
  price_amount: number | null;
  billing_interval: string;
  is_test: boolean;
};

/** Name, test badge, description, features and price of a product. */
export function ProductSummary({ product, hideDescription }: { product: SummaryProduct; hideDescription?: boolean }) {
  return (
    <section aria-labelledby="produkt-navn" className="space-y-6 rounded-lg border-2 border-brand bg-surface p-6 sm:p-8">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 id="produkt-navn" className="text-2xl font-bold">
            {product.name}
          </h2>
          {product.is_test ? <Badge tone="warning">Testpris – ikke endelig</Badge> : null}
        </div>
        {product.short_description ? <p className="text-lg text-ink-soft">{product.short_description}</p> : null}
      </div>

      {!hideDescription && product.description ? (
        <p className="whitespace-pre-line text-lg">{product.description}</p>
      ) : null}

      {product.features.length > 0 ? (
        <div className="space-y-3">
          <p className="font-semibold">Det får du:</p>
          <ul className="space-y-2">
            {product.features.map((feature) => (
              <li key={feature} className="flex gap-3 text-lg">
                <svg viewBox="0 0 20 20" className="mt-1 h-5 w-5 shrink-0 text-brand" fill="currentColor" aria-hidden="true">
                  <path d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z" />
                </svg>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="flex flex-wrap items-baseline gap-x-2 border-t border-line pt-5">
        <span className="text-4xl font-bold tracking-tight">{formatDKK(product.price_amount)}</span>
        {product.price_amount != null ? (
          <span className="text-lg text-ink-soft">{formatInterval(product.billing_interval)}</span>
        ) : null}
      </p>
    </section>
  );
}
