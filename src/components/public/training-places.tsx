const PLACES = [
  {
    title: "Hjemme",
    text: "Øvelser, du kan lave i stuen eller i haven – med eller uden udstyr som håndvægte og elastikker.",
  },
  {
    title: "I fitnesscenteret",
    text: "Har du adgang til et center, kan planen gøre brug af maskiner, frie vægte og kondiudstyr.",
  },
  {
    title: "Udendørs",
    text: "Gåture, trapper, bakker og en bænk i parken kan også blive en del af din træning.",
  },
] as const;

/** Home / gym / outdoors – plain columns, no cards. */
export function TrainingPlaces() {
  return (
    <ul role="list" className="grid gap-10 md:grid-cols-3">
      {PLACES.map((place) => (
        <li key={place.title} className="border-t-2 border-brand pt-5">
          <h3 className="text-xl font-semibold">{place.title}</h3>
          <p className="mt-2 text-lg text-ink-soft">{place.text}</p>
        </li>
      ))}
    </ul>
  );
}
