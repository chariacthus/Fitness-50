import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="indhold" className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-4 py-16">
      <p className="font-semibold text-brand">Fejl 404</p>
      <h1 className="text-4xl font-bold">Siden findes ikke</h1>
      <p className="text-lg text-ink-soft">Siden er måske flyttet, eller linket er forkert.</p>
      <div className="flex flex-wrap gap-3 pt-2">
        <ButtonLink href="/">Gå til forsiden</ButtonLink>
        <ButtonLink href="/hjem" variant="secondary">
          Til medlemsområdet
        </ButtonLink>
      </div>
    </main>
  );
}
