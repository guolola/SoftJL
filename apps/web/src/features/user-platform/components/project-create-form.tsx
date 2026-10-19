// Renders project creation state and maps selected bindings into createProject input.
import { Textarea } from '../../../shared/ui/textarea';
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { floatingAlert } from "../../../shared/ui/floating-alert";
import { localizeCaughtFailure } from "../../../shared/i18n/api-errors";
import type { ProjectBackgroundKey } from "@uml-platform/contracts";
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import { Field, FieldGroup, FieldLabel, FieldSet } from "../../../shared/ui/field";
import { platformApi } from "../services/platform-api";
import { ProjectBackgroundPicker } from "./project-background-picker";
import { randomProjectBackground } from "../lib/project-backgrounds";
import { projectVisibilityOptions } from "../lib/project-visibility";
import { ProjectModeStep } from "./project-mode-step";

type Navigate = (path: string) => void;

type SegmentOption = {
  value: string;
  label: string;
};

function SegmentedButtonGroup({
  labelId,
  value,
  options,
  onChange,
}: {
  labelId: string;
  value: string;
  options: SegmentOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Button
            key={option.value}
            type="button"
            size="sm"
            // The selected option must stand out clearly from the outlined alternatives.
            variant={selected ? "default" : "outline"}
            aria-pressed={selected}
            className="h-8 gap-1 px-3 text-xs"
            onClick={() => onChange(option.value)}
          >
            {selected && <Check className="size-3.5" aria-hidden="true" />}
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

export function ProjectCreateForm({ onNavigate }: { onNavigate: Navigate }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectMode, setProjectMode] = useState<"standard" | "professional">("standard");
  const [visibility, setVisibility] = useState("private");
  // Choose once per creation form so editing the title never changes the selected cover.
  const [backgroundKey, setBackgroundKey] = useState<ProjectBackgroundKey | null>(() => randomProjectBackground().key);
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState(0);
  const mounted = useRef(false);
  const navigationTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Leaving the form must cancel its delayed redirect, including during route transitions.
      window.clearTimeout(navigationTimer.current);
    };
  }, []);

  const createProject = async () => {
    if (creating || !name.trim()) return;
    setCreating(true);
    try {
      const response = await platformApi.createProject({
        projectMode,
        name: name.trim(),
        description: description.trim() || null,
        visibility,
        backgroundKey,
      });
      if (!mounted.current) return;
      floatingAlert.success(t("projects.createForm.created"));
      navigationTimer.current = window.setTimeout(() => {
        if (mounted.current) onNavigate(`/projects/${response.project.id}`);
      }, 900);
    } catch (error) {
      if (mounted.current) {
        floatingAlert.error(localizeCaughtFailure(error, t("projects.createForm.failed")));
      }
    } finally {
      if (mounted.current) setCreating(false);
    }
  };

  return (
    <form className="grid gap-6" onSubmit={(event) => event.preventDefault()}>
      <ol aria-label={t("projects.createForm.stepsLabel")} className="grid grid-cols-4 gap-2">
        {["basic", "mode", "access", "confirm"].map((key, index) => (
          <li key={key} className="min-w-0">
            <Button
              type="button"
              variant="ghost"
              className="h-auto w-full justify-start gap-2 rounded-lg border border-border bg-muted/20 p-2 text-left transition-colors hover:bg-muted/50 disabled:cursor-default"
              aria-current={step === index ? "step" : undefined}
              aria-label={t(`projects.createForm.steps.${key}`)}
              disabled={index > step}
              onClick={() => setStep(index)}
            >
              <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${step > index ? "bg-success/10 text-success" : step === index ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {step > index ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span className="hidden min-w-0 truncate text-xs font-medium sm:block">
                {t(`projects.createForm.steps.${key}`)}
              </span>
            </Button>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <FieldSet>
          <FieldGroup className="gap-5">
            <Field>
              <FieldLabel htmlFor="project-name">{t("projects.createForm.name")}</FieldLabel>
              <Input id="project-name" value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="project-description">{t("projects.createForm.description")}</FieldLabel>
              <Textarea
                id="project-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t("projects.createForm.descriptionPlaceholder")}
                rows={4}
                className="min-h-24 w-full resize-y"
              />
            </Field>
            <Field>
              <FieldLabel>{t("projects.createForm.background")}</FieldLabel>
              <ProjectBackgroundPicker value={backgroundKey} onChange={setBackgroundKey} disabled={creating} />
            </Field>
          </FieldGroup>
        </FieldSet>
      ) : null}

      {step === 1 && <ProjectModeStep value={projectMode} onChange={setProjectMode} />}

      {step === 2 ? (
        <FieldSet>
          <FieldGroup className="gap-5">
            <Field>
              <FieldLabel id="project-visibility-label">{t("projects.createForm.visibility")}</FieldLabel>
              <SegmentedButtonGroup
                labelId="project-visibility-label"
                value={visibility}
                options={projectVisibilityOptions(t)}
                onChange={setVisibility}
              />
            </Field>
          </FieldGroup>
        </FieldSet>
      ) : null}

      {step === 3 ? (
        <section className="grid gap-4 rounded-xl border border-border bg-muted/20 p-4" aria-label={t("projects.createForm.steps.confirm")}>
          <div><p className="text-xs text-muted-foreground">{t("projects.createForm.mode.label")}</p><p className="mt-1 text-sm">{t(`projects.createForm.mode.${projectMode}`)}</p></div>
          <div><p className="text-xs text-muted-foreground">{t("projects.createForm.name")}</p><p className="mt-1 font-medium">{name}</p></div>
          <div><p className="text-xs text-muted-foreground">{t("projects.createForm.description")}</p><p className="mt-1 text-sm">{description.trim() || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">{t("projects.createForm.visibility")}</p><p className="mt-1 text-sm">{t(`projectSettings.visibilityValues.${visibility}`)}</p></div>
        </section>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0 || creating}>
          <ChevronLeft className="size-4" />
          {t("projects.createForm.previous")}
        </Button>
        {step < 3 ? (
          <Button type="button" onClick={() => { if (step !== 0 || name.trim()) setStep((current) => Math.min(3, current + 1)); }} disabled={step === 0 && !name.trim()}>
            {t("projects.createForm.next")}
            <ChevronRight className="size-4" />
          </Button>
        ) : (
          <Button type="button" onClick={createProject} disabled={creating || !name.trim()}>
            {creating && <Loader2 className="size-4 animate-spin" />}
            {t("projects.createForm.submit")}
          </Button>
        )}
      </div>
    </form>
  );
}
