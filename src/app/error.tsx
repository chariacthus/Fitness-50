"use client";

import { Button, ButtonLink } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="indhold" className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-3xl font-bold">Noget gik galt</h1>
      <p className="text-lg text-ink-soft">
        Siden kunne ikke vises. Det kan skyldes en ustabil internetforbindelse. Prøv igen om et øjeblik.
      </p>
      <div className="flex flex-wrap gap-3 pt-2">
        <Button onClick={() => reset()}>Prøv igen</Button>
        <ButtonLink href="/" variant="secondary">
          Gå til forsiden
        </ButtonLink>
      </div>
    </main>
  );
}
