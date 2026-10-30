import { PlaceIllustration } from "@/components/public/illustrations";

const PLACES = [
  {
    key: "home",
    title: "Hjemme",
    text: "Øvelser, du kan lave i stuen eller i haven – med eller uden udstyr som håndvægte og elastikker.",
  },
  {
    key: "gym",
    title: "I fitnesscenteret",
    text: "Har du adgang til et center, kan planen gøre brug af maskiner, frie vægte og kondiudstyr.",
  },
  {
    key: "outdoors",
    title: "Udendørs",
    text: "Gåture, trapper, bakker og en bænk i parken kan også blive en del af din træning.",
  },
] as const;

/** Home / gym / outdoors with a simple line illustration each. */
export function TrainingPlaces() {
  return (
    <ul role="list" className="grid gap-6 md:grid-cols-3">
      {PLACES.map((place) => (
        <li key={place.title} className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="border-b border-line bg-brand-soft px-8 pt-8 pb-4">
            <PlaceIllustration name={place.key} />
          </div>
          <div className="p-6">
            <h3 className="font-display text-2xl">{place.title}</h3>
            <p className="mt-2 text-lg text-ink-soft">{place.text}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
