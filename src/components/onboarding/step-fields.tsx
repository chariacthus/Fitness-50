import {
  CONTACT_OPTIONS,
  COOKING_OPTIONS,
  DIET_OPTIONS,
  ENVIRONMENT_OPTIONS,
  EQUIPMENT_OPTIONS,
  EXPERIENCE_OPTIONS,
  GOAL_OPTIONS,
  LIMITATION_OPTIONS,
  MEALS_OPTIONS,
  MINUTES_OPTIONS,
  NUTRITION_INTEREST_OPTIONS,
  SESSION_LENGTH_OPTIONS,
  WEEKDAY_OPTIONS,
} from "@/lib/onboarding/schema";
import type { FormStepKey, StepValues } from "@/components/onboarding/steps";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { CheckboxField, ChoiceGroup, TextareaField, TextField } from "@/components/ui/form";

// The fields of each questionnaire step. Purely presentational: values come
// from the saved answers (or from what was just typed, after an error).

type Options = { value: string; label: string }[];
const opts = (o: readonly { value: string; label: string }[]): Options => o.map(({ value, label }) => ({ value, label }));

const DAY_OPTIONS: Options = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: n === 1 ? "1 dag" : `${n} dage` }));

export type StepFieldsProps = {
  stepKey: FormStepKey;
  values: StepValues;
  errors?: Record<string, string>;
  coachName: string;
  businessName: string;
  hasNutritionAddon: boolean;
  /** Consent was already given earlier (explains how to withdraw it). */
  hadHealthConsent: boolean;
};

function str(values: StepValues, name: string) {
  const v = values[name];
  return typeof v === "string" ? v : undefined;
}
function list(values: StepValues, name: string) {
  const v = values[name];
  return Array.isArray(v) ? v : [];
}

export function StepFields({ stepKey, values, errors, coachName, businessName, hasNutritionAddon, hadHealthConsent }: StepFieldsProps) {
  const e = errors ?? {};
  switch (stepKey) {
    case "basic":
      return (
        <div className="space-y-8">
          <TextField name="full_name" label="Dit fulde navn" autoComplete="name" maxLength={120} defaultValue={str(values, "full_name")} error={e.full_name} />
          <TextField
            name="age"
            label="Din alder"
            optional
            type="number"
            inputMode="numeric"
            min={18}
            max={110}
            className="max-w-48"
            defaultValue={str(values, "age")}
            error={e.age}
          />
          <ChoiceGroup
            name="training_experience"
            legend="Hvor meget har du trænet før?"
            type="radio"
            options={opts(EXPERIENCE_OPTIONS)}
            defaultValue={str(values, "training_experience")}
            error={e.training_experience}
          />
          <ChoiceGroup
            name="contact_preference"
            legend={`Hvordan vil du helst kontaktes af ${coachName}?`}
            type="radio"
            options={opts(CONTACT_OPTIONS)}
            defaultValue={str(values, "contact_preference")}
            error={e.contact_preference}
          />
          <TextField
            name="phone"
            label="Telefonnummer"
            optional
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={40}
            hint="Skriv det, hvis du gerne vil ringes op."
            defaultValue={str(values, "phone")}
            error={e.phone}
          />
        </div>
      );

    case "goals":
      return (
        <div className="space-y-8">
          <ChoiceGroup
            name="goals"
            legend="Hvad vil du gerne opnå?"
            hint="Vælg gerne flere."
            type="checkbox"
            columns={2}
            options={opts(GOAL_OPTIONS)}
            defaultValue={list(values, "goals")}
            error={e.goals}
          />
          <TextField
            name="goals_other"
            label="Har du valgt »Andet«, så skriv dit mål her"
            optional
            maxLength={300}
            defaultValue={str(values, "goals_other")}
            error={e.goals_other}
          />
          <TextareaField
            name="personal_goal"
            label="Dit personlige mål med dine egne ord"
            optional
            maxLength={1000}
            hint="F.eks. »Jeg vil kunne lege med mine børnebørn uden at få ondt i ryggen.«"
            defaultValue={str(values, "personal_goal")}
            error={e.personal_goal}
          />
        </div>
      );

    case "environment":
      return (
        <div className="space-y-8">
          <ChoiceGroup
            name="environment"
            legend="Hvor vil du helst træne?"
            type="radio"
            options={opts(ENVIRONMENT_OPTIONS)}
            defaultValue={str(values, "environment")}
            error={e.environment}
          />
          <ChoiceGroup
            name="equipment"
            legend="Hvilket udstyr har du adgang til?"
            hint="Vælg alt det, der passer."
            optional
            type="checkbox"
            columns={2}
            options={opts(EQUIPMENT_OPTIONS)}
            defaultValue={list(values, "equipment")}
            error={e.equipment}
          />
          <TextareaField
            name="equipment_other"
            label="Andet udstyr"
            optional
            rows={3}
            maxLength={500}
            defaultValue={str(values, "equipment_other")}
            error={e.equipment_other}
          />
        </div>
      );

    case "time":
      return (
        <div className="space-y-8">
          <ChoiceGroup
            name="days_per_week"
            legend="Hvor mange dage om ugen kan du træne?"
            type="radio"
            columns={2}
            options={DAY_OPTIONS}
            defaultValue={str(values, "days_per_week")}
            error={e.days_per_week}
          />
          <ChoiceGroup
            name="minutes_per_session"
            legend="Hvor lang tid har du til hver træning?"
            type="radio"
            options={opts(MINUTES_OPTIONS)}
            defaultValue={str(values, "minutes_per_session")}
            error={e.minutes_per_session}
          />
          <ChoiceGroup
            name="session_length_preference"
            legend="Hvad passer dig bedst?"
            type="radio"
            options={opts(SESSION_LENGTH_OPTIONS)}
            defaultValue={str(values, "session_length_preference")}
            error={e.session_length_preference}
          />
          <ChoiceGroup
            name="preferred_days"
            legend="Hvilke dage passer dig bedst?"
            optional
            type="checkbox"
            columns={2}
            options={opts(WEEKDAY_OPTIONS)}
            defaultValue={list(values, "preferred_days")}
            error={e.preferred_days}
          />
        </div>
      );

    case "preferences":
      return (
        <div className="space-y-8">
          <TextareaField
            name="current_activity"
            label="Hvad laver du af motion i dag?"
            optional
            maxLength={1000}
            hint="F.eks. gåture, cykling, havearbejde eller ingenting."
            defaultValue={str(values, "current_activity")}
            error={e.current_activity}
          />
          <TextareaField
            name="preferred_exercises"
            label="Øvelser eller aktiviteter, du godt kan lide"
            optional
            maxLength={1000}
            defaultValue={str(values, "preferred_exercises")}
            error={e.preferred_exercises}
          />
          <TextareaField
            name="disliked_activities"
            label="Noget, du ikke bryder dig om"
            optional
            maxLength={1000}
            defaultValue={str(values, "disliked_activities")}
            error={e.disliked_activities}
          />
          <TextareaField
            name="previous_experience"
            label="Hvordan har du trænet tidligere?"
            optional
            maxLength={1000}
            hint="F.eks. fodbold i ungdommen, fitness for nogle år siden eller løb."
            defaultValue={str(values, "previous_experience")}
            error={e.previous_experience}
          />
        </div>
      );

    case "health":
      return (
        <div className="space-y-8">
          <Alert tone="info" title="Hvorfor spørger vi om det her?">
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>Hvis du har en skade, smerter eller andet, {coachName} bør vide, kan han tilpasse øvelserne til dig.</li>
              <li>Det er frivilligt at skrive noget her.</li>
              <li>Kun {coachName} ser det, du skriver. De andre medlemmer kan ikke se det.</li>
              <li>
                Det her er ikke lægefaglig rådgivning eller diagnose. Skriv kun det, {coachName} skal tage hensyn til i din træning –
                ikke diagnoser eller journaloplysninger.
              </li>
              <li>Er du i tvivl om, hvad du kan tåle, så tal med din læge.</li>
            </ul>
          </Alert>
          <ChoiceGroup
            name="has_limitations"
            legend={`Er der noget, ${coachName} skal tage hensyn til?`}
            type="radio"
            options={opts(LIMITATION_OPTIONS)}
            defaultValue={str(values, "has_limitations")}
            error={e.has_limitations}
          />
          <TextareaField
            name="health_info"
            label={`Hvad skal ${coachName} tage hensyn til?`}
            optional
            rows={5}
            maxLength={4000}
            hint="F.eks. »Ondt i højre knæ ved dybe knæbøjninger« eller »Må ikke løfte tungt over hovedet«."
            defaultValue={str(values, "health_info")}
            error={e.health_info}
          />
          <CheckboxField
            name="health_consent"
            label={`Jeg giver samtykke til, at ${businessName} behandler de helbredsoplysninger, jeg giver her, så ${coachName} kan tage hensyn til dem i min træning. Jeg kan til enhver tid trække samtykket tilbage under Min profil.`}
            hint={
              hadHealthConsent
                ? "Vil du trække samtykket tilbage, så fjern fluebenet, slet teksten ovenfor og vælg et andet svar end »Ja«. Så sletter vi oplysningerne."
                : "Nødvendigt, hvis du svarer »Ja« eller skriver noget i feltet ovenfor."
            }
            defaultChecked={values.health_consent === true}
            error={e.health_consent}
          />
        </div>
      );

    case "nutrition":
      return (
        <div className="space-y-8">
          <ChoiceGroup
            name="nutrition_interest"
            legend="Er du interesseret i hjælp til kosten?"
            type="radio"
            options={opts(NUTRITION_INTEREST_OPTIONS)}
            defaultValue={str(values, "nutrition_interest")}
            error={e.nutrition_interest}
          />
          {hasNutritionAddon ? (
            <div className="space-y-8 border-t border-line pt-8">
              <div className="space-y-1">
                <h3 className="text-xl font-semibold">Spørgsmål til din kostplan</h3>
                <p className="text-ink-soft">Du har en personlig kostplan. {coachName} bruger dine svar her til at lave den.</p>
              </div>
              <ChoiceGroup
                name="meals_per_day"
                legend="Hvor mange måltider spiser du typisk om dagen?"
                type="radio"
                columns={2}
                options={opts(MEALS_OPTIONS)}
                defaultValue={str(values, "meals_per_day")}
                error={e.meals_per_day}
              />
              <ChoiceGroup
                name="diet"
                legend="Hvordan spiser du?"
                hint="Vælg alt det, der passer."
                type="checkbox"
                columns={2}
                options={opts(DIET_OPTIONS)}
                defaultValue={list(values, "diet")}
                error={e.diet}
              />
              <TextField
                name="diet_other"
                label="Andet om din kost"
                optional
                maxLength={300}
                defaultValue={str(values, "diet_other")}
                error={e.diet_other}
              />
              <TextareaField
                name="foods_avoided"
                label="Fødevarer, du ikke kan lide eller ikke tåler"
                optional
                maxLength={1000}
                defaultValue={str(values, "foods_avoided")}
                error={e.foods_avoided}
              />
              <ChoiceGroup
                name="cooking_time"
                legend="Hvor meget tid vil du bruge på madlavning?"
                type="radio"
                options={opts(COOKING_OPTIONS)}
                defaultValue={str(values, "cooking_time")}
                error={e.cooking_time}
              />
              <TextareaField
                name="typical_day"
                label="Hvad spiser du på en helt almindelig dag?"
                optional
                maxLength={1500}
                hint="F.eks. morgenmad, frokost, aftensmad og det, du spiser ind imellem."
                defaultValue={str(values, "typical_day")}
                error={e.typical_day}
              />
              <TextareaField
                name="nutrition_goal"
                label="Hvad vil du gerne opnå med kosten?"
                optional
                maxLength={1000}
                defaultValue={str(values, "nutrition_goal")}
                error={e.nutrition_goal}
              />
            </div>
          ) : (
            <Alert tone="info" title="Personlig kostplan">
              <p>
                Som tilkøb kan du få en personlig kostplan fra {coachName}. Har du købt den, får du et par ekstra spørgsmål om din kost
                her. Dine svar fra de andre trin er gemt, så du kan sagtens læse mere og komme tilbage.
              </p>
              <div className="mt-3">
                <ButtonLink href="/tilkoeb/kostplan" variant="secondary">
                  Læs om den personlige kostplan
                </ButtonLink>
              </div>
            </Alert>
          )}
        </div>
      );
  }
}
