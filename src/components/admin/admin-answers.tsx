import type { AdminAnswers } from "@/lib/admin/onboarding";
import { DetailList } from "@/components/ui/layout";

/** The member's questionnaire for Christian. Health information only with consent, under its own heading. */
export function AdminAnswersView({ answers, idPrefix = "svar" }: { answers: AdminAnswers; idPrefix?: string }) {
  return (
    <div className="space-y-6">
      {answers.sections.map((section, index) => {
        const headingId = `${idPrefix}-${index}`;
        return (
          <section key={section.title} aria-labelledby={headingId} className="rounded-lg border border-line bg-surface p-5 sm:p-6">
            <h3 id={headingId} className="text-xl font-semibold">
              {section.title}
            </h3>
            <div className="mt-2">
              <DetailList
                items={section.items.map((item) => ({ label: item.label, value: <span className="whitespace-pre-line">{item.value}</span> }))}
              />
            </div>
          </section>
        );
      })}

      <section aria-labelledby={`${idPrefix}-foelsomt`} className="rounded-lg border-2 border-warning bg-warning-soft p-5 sm:p-6">
        <h3 id={`${idPrefix}-foelsomt`} className="text-xl font-semibold">
          Følsomme oplysninger – kun til brug for træningen
        </h3>
        {answers.sensitive ? (
          <>
            <p className="mt-1 text-ink-soft">Medlemmet har givet samtykke til, at oplysningerne bruges til at tilpasse træningen. Del dem ikke med andre.</p>
            <p className="mt-3 max-w-prose whitespace-pre-line">{answers.sensitive}</p>
          </>
        ) : (
          <p className="mt-1">
            {answers.consentGiven
              ? "Medlemmet har givet samtykke, men har ikke skrevet noget om skader eller begrænsninger."
              : "Medlemmet har ikke givet samtykke til at gemme oplysninger om skader eller begrænsninger, så der er intet at vise."}
          </p>
        )}
      </section>
    </div>
  );
}
