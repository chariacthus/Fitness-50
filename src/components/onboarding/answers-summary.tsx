import Link from "next/link";
import type { AnswerSection } from "@/lib/onboarding/schema";
import { sectionStep, stepTitle } from "@/components/onboarding/steps";
import { DetailList } from "@/components/ui/layout";

/** The member's own answers grouped by section, optionally with a "Ret" link per section. */
export function AnswersSummary({ sections, editable }: { sections: AnswerSection[]; editable: boolean }) {
  return (
    <div className="space-y-6">
      {sections.map((section, index) => {
        const step = sectionStep(index);
        const headingId = `svar-${index}`;
        return (
          <section key={section.title} aria-labelledby={headingId} className="rounded-lg border border-line bg-surface p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 id={headingId} className="text-xl font-semibold">
                {section.title}
              </h3>
              {editable ? (
                <Link
                  href={`/onboarding?trin=${step}`}
                  className="inline-flex min-h-11 items-center rounded-md px-3 font-semibold text-brand underline underline-offset-4 hover:bg-brand-soft"
                >
                  Ret<span className="sr-only">: {stepTitle(step)}</span>
                </Link>
              ) : null}
            </div>
            <div className="mt-2">
              <DetailList items={section.items.map((item) => ({ label: item.label, value: <span className="whitespace-pre-line">{item.value}</span> }))} />
            </div>
          </section>
        );
      })}
    </div>
  );
}
