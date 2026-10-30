import Link from "next/link";
import type { CheckoutReadiness } from "@/lib/stripe/readiness";

/** Shown only to administrators: why checkout is (not) open. */
export function AdminReadiness({ readiness }: { readiness: CheckoutReadiness }) {
  return (
    <aside aria-labelledby="admin-klar-titel" className="space-y-3 rounded-lg border-2 border-dashed border-line-strong bg-muted px-5 py-4">
      <p id="admin-klar-titel" className="font-semibold">
        Kun synligt for administratorer
      </p>
      {readiness.ready ? (
        <p>Betalingen er klar: produktet kan købes nu.</p>
      ) : (
        <>
          <p>Køb er ikke muligt endnu, fordi:</p>
          <ul className="list-disc space-y-1 pl-6">
            {readiness.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </>
      )}
      <p>
        <Link href="/admin/produkter" className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4">
          Gå til priser og produkter
        </Link>
      </p>
    </aside>
  );
}
