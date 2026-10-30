"use client";

import { useActionState, useEffect, useRef } from "react";
import { initialActionState } from "@/lib/action-result";
import { CheckboxField, SelectField, TextareaField, TextField } from "@/components/ui/form";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { syncProduct, updateProduct } from "./actions";

export type EditableProduct = {
  id: string;
  kind: string;
  name: string;
  short_description: string | null;
  description: string | null;
  features: string[];
  priceInput: string;
  billing_interval: string;
  is_active: boolean;
  is_test: boolean;
  mobilepay_enabled: boolean;
  sort_order: number;
};

const MEMBERSHIP_INTERVALS = [
  { value: "month", label: "Hver måned" },
  { value: "quarter", label: "Hvert kvartal (hver 3. måned)" },
  { value: "year", label: "Hvert år" },
];
const ADDON_INTERVALS = [{ value: "one_time", label: "Engangsbetaling" }];

export function ProductForm({ product }: { product: EditableProduct }) {
  const [state, formAction] = useActionState(updateProduct, initialActionState);
  const formRef = useRef<HTMLFormElement>(null);
  const errors = state.ok ? undefined : state.fieldErrors;
  const isMembership = product.kind === "membership";
  const id = (field: string) => `${product.id}-${field}`;

  useEffect(() => {
    if (errors && Object.keys(errors).length > 0) {
      formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
    }
  }, [errors]);

  return (
    <form ref={formRef} action={formAction} noValidate className="space-y-6">
      <input type="hidden" name="id" value={product.id} />
      <TextField id={id("name")} name="name" label="Navn" required maxLength={120} defaultValue={product.name} error={errors?.name} />
      <TextareaField
        id={id("short_description")}
        name="short_description"
        label="Kort beskrivelse"
        optional
        rows={2}
        maxLength={400}
        defaultValue={product.short_description ?? ""}
        error={errors?.short_description}
      />
      <TextareaField
        id={id("description")}
        name="description"
        label="Beskrivelse"
        optional
        rows={4}
        maxLength={4000}
        defaultValue={product.description ?? ""}
        error={errors?.description}
      />
      <TextareaField
        id={id("features")}
        name="features"
        label="Det får man (punkter)"
        hint="Skriv ét punkt pr. linje."
        optional
        rows={5}
        defaultValue={product.features.join("\n")}
        error={errors?.features}
      />
      <div className="grid gap-6 sm:grid-cols-2">
        <TextField
          id={id("price")}
          name="price"
          label="Pris i kroner"
          hint="F.eks. 299,00. Lad feltet stå tomt, hvis prisen ikke er fastsat endnu."
          inputMode="decimal"
          autoComplete="off"
          defaultValue={product.priceInput}
          error={errors?.price}
        />
        <SelectField
          id={id("billing_interval")}
          name="billing_interval"
          label={isMembership ? "Hvor ofte betales der" : "Betaling"}
          options={isMembership ? MEMBERSHIP_INTERVALS : ADDON_INTERVALS}
          defaultValue={product.billing_interval}
          error={errors?.billing_interval}
        />
      </div>
      <CheckboxField
        id={id("confirm_price_change")}
        name="confirm_price_change"
        label={
          isMembership
            ? "Den nye pris gælder for nye køb. Eksisterende medlemmer beholder deres pris, indtil den ændres i Stripe."
            : "Den nye pris gælder for nye køb."
        }
        hint="Skal kun markeres, hvis du ændrer prisen eller hvor ofte der betales."
        error={errors?.confirm_price_change}
      />
      <fieldset className="space-y-2">
        <legend className="font-semibold">Indstillinger</legend>
        <CheckboxField
          id={id("is_active")}
          name="is_active"
          label="Aktivt – vises på siden og kan købes"
          defaultChecked={product.is_active}
        />
        <CheckboxField
          id={id("is_test")}
          name="is_test"
          label="Testprodukt – kan kun købes, mens Stripe kører i testtilstand"
          hint="Fjern fluebenet, når den rigtige pris er sat og Stripe bruger live-nøgler."
          defaultChecked={product.is_test}
        />
        {!isMembership ? (
          <CheckboxField
            id={id("mobilepay_enabled")}
            name="mobilepay_enabled"
            label="Tillad MobilePay (kun for engangskøb)"
            hint="MobilePay skal også være aktiveret i Stripe under Betalingsmetoder."
            defaultChecked={product.mobilepay_enabled}
          />
        ) : null}
      </fieldset>
      <TextField
        id={id("sort_order")}
        name="sort_order"
        type="number"
        inputMode="numeric"
        label="Rækkefølge"
        hint="Lavere tal vises først."
        className="max-w-48"
        defaultValue={String(product.sort_order)}
        error={errors?.sort_order}
      />
      <div aria-live="polite">
        <FormMessage state={state} successTitle="Gemt" />
      </div>
      <SubmitButton>Gem produkt</SubmitButton>
    </form>
  );
}

export function SyncProductForm({ productId }: { productId: string }) {
  const [state, formAction] = useActionState(syncProduct, initialActionState);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={productId} />
      <SubmitButton variant="secondary" pendingText="Synkroniserer…">
        Synkroniser med Stripe
      </SubmitButton>
      <div aria-live="polite">
        <FormMessage state={state} />
      </div>
    </form>
  );
}
