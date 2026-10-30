import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/components/ui/cn";

const control =
  "block w-full rounded-md border-2 border-line-strong bg-surface px-4 py-3 text-base text-ink placeholder:text-ink-soft/70 focus:border-focus disabled:bg-muted aria-[invalid=true]:border-danger";

type FieldShellProps = {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: ReactNode;
  className?: string;
};

/** Label + control + hint + error, wired up for screen readers. */
export function FieldShell({ id, label, hint, error, optional, children, className }: FieldShellProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor={id} className="block font-semibold">
        {label}
        {optional ? <span className="font-normal text-ink-soft"> (valgfrit)</span> : null}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="text-ink-soft">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} className="font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hint?: ReactNode, error?: string) {
  return [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
}

type TextFieldProps = Omit<ComponentProps<"input">, "id"> & {
  id?: string;
  name: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
};

export function TextField({ id, name, label, hint, error, optional, className, ...props }: TextFieldProps) {
  const fieldId = id ?? name;
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} optional={optional} className={className}>
      <input
        id={fieldId}
        name={name}
        className={control}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        {...props}
      />
    </FieldShell>
  );
}

type TextareaFieldProps = Omit<ComponentProps<"textarea">, "id"> & {
  id?: string;
  name: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
};

export function TextareaField({ id, name, label, hint, error, optional, className, rows = 4, ...props }: TextareaFieldProps) {
  const fieldId = id ?? name;
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} optional={optional} className={className}>
      <textarea
        id={fieldId}
        name={name}
        rows={rows}
        className={control}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        {...props}
      />
    </FieldShell>
  );
}

type SelectFieldProps = Omit<ComponentProps<"select">, "id"> & {
  id?: string;
  name: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  options: { value: string; label: string }[];
  placeholder?: string;
};

export function SelectField({ id, name, label, hint, error, optional, options, placeholder, className, ...props }: SelectFieldProps) {
  const fieldId = id ?? name;
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} optional={optional} className={className}>
      <select
        id={fieldId}
        name={name}
        className={cn(control, "min-h-12 pr-10")}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        {...props}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

type CheckboxFieldProps = Omit<ComponentProps<"input">, "type" | "id"> & {
  id?: string;
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
};

/** Large checkbox with the whole row clickable. */
export function CheckboxField({ id, name, label, hint, error, className, ...props }: CheckboxFieldProps) {
  const fieldId = id ?? name;
  return (
    <div className={cn("space-y-1", className)}>
      <label htmlFor={fieldId} className="flex min-h-12 cursor-pointer items-start gap-3 py-2">
        <input
          id={fieldId}
          name={name}
          type="checkbox"
          className="mt-0.5 h-6 w-6 shrink-0 cursor-pointer accent-[var(--brand)]"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fieldId, hint, error)}
          {...props}
        />
        <span>{label}</span>
      </label>
      {hint ? (
        <p id={`${fieldId}-hint`} className="pl-9 text-ink-soft">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${fieldId}-error`} className="pl-9 font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type ChoiceGroupProps = {
  name: string;
  legend: string;
  type: "checkbox" | "radio";
  options: { value: string; label: string; description?: string }[];
  defaultValue?: string | string[];
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  required?: boolean;
  columns?: 1 | 2;
};

/** A fieldset of large, fully clickable checkbox/radio options. */
export function ChoiceGroup({ name, legend, type, options, defaultValue, hint, error, optional, required, columns = 1 }: ChoiceGroupProps) {
  const selected = new Set(Array.isArray(defaultValue) ? defaultValue : defaultValue ? [defaultValue] : []);
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;
  return (
    <fieldset className="space-y-3" aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}>
      <legend className="font-semibold">
        {legend}
        {optional ? <span className="font-normal text-ink-soft"> (valgfrit)</span> : null}
      </legend>
      {hint ? (
        <p id={hintId} className="text-ink-soft">
          {hint}
        </p>
      ) : null}
      <div className={cn("grid gap-3", columns === 2 && "sm:grid-cols-2")}>
        {options.map((o) => {
          const optionId = `${name}-${o.value}`;
          return (
            <label
              key={o.value}
              htmlFor={optionId}
              className="flex min-h-12 cursor-pointer items-start gap-3 rounded-md border-2 border-line bg-surface px-4 py-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft"
            >
              <input
                id={optionId}
                type={type}
                name={name}
                value={o.value}
                defaultChecked={selected.has(o.value)}
                required={type === "radio" ? required : undefined}
                aria-invalid={error ? true : undefined}
                className="mt-0.5 h-6 w-6 shrink-0 cursor-pointer accent-[var(--brand)]"
              />
              <span>
                <span className="block font-medium">{o.label}</span>
                {o.description ? <span className="block text-ink-soft">{o.description}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={errorId} className="font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
