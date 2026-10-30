import { STEP_COUNT, stepTitle } from "@/components/onboarding/steps";

/** "Trin 3 af 8 – Hvor du træner" with a simple progress bar. */
export function StepProgress({ step }: { step: number }) {
  const label = `Trin ${step} af ${STEP_COUNT} – ${stepTitle(step)}`;
  const percent = Math.round((step / STEP_COUNT) * 100);
  return (
    <div className="space-y-3">
      <p className="text-lg font-semibold">{label}</p>
      <div
        role="progressbar"
        aria-label="Hvor langt du er i spørgeskemaet"
        aria-valuemin={1}
        aria-valuemax={STEP_COUNT}
        aria-valuenow={step}
        aria-valuetext={label}
        className="h-3 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
