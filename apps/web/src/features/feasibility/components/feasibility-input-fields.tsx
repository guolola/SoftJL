// Shares the optional research-fact fields between overview and implementation editors.
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { FeasibilityInputs } from "@uml-platform/contracts";
import { Field, FieldGroup, FieldLabel } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { FEASIBILITY_INPUT_FIELDS } from "../lib/implementation-plan-view-model";

export function FeasibilityInputFields({ inputs, onChange }: {
  inputs: FeasibilityInputs;
  onChange: (inputs: FeasibilityInputs) => void;
}) {
  const { t } = useTranslation();
  const uid = useId();

  return (
    <FieldGroup className="gap-6">
      {(["cover", "facts"] as const).map((group) => (
        <section key={group} aria-labelledby={`${uid}-${group}`}>
          <h3 id={`${uid}-${group}`} className="mb-3 font-medium">{t(`feasibility.supplements.${group}`)}</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {FEASIBILITY_INPUT_FIELDS.filter((field) => field.group === group).map((field) => {
              const value = inputs[field.key];
              return (
                <Field key={field.key} className="gap-1.5">
                  <FieldLabel htmlFor={`${uid}-${field.key}`}>{t(`feasibility.fields.${field.key}`)}</FieldLabel>
                  <Input
                    id={`${uid}-${field.key}`}
                    type={field.type ?? "text"}
                    min={field.type === "number" ? 0 : undefined}
                    step={field.type === "number" ? "any" : undefined}
                    value={value ?? ""}
                    placeholder={t("feasibility.notProvided")}
                    onChange={(event) => {
                      const raw = event.target.value;
                      onChange({ ...inputs, [field.key]: field.type === "number" ? (raw === "" ? null : Number(raw)) : raw });
                    }}
                  />
                </Field>
              );
            })}
          </div>
        </section>
      ))}
    </FieldGroup>
  );
}
