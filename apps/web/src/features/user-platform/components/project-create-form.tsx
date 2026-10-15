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
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet } from "../../../shared/ui/field";
import { SelectControl } from "../../../shared/ui/select";
import {
  UNASSIGNED_ACADEMIC_OPTION,
  academicBindingFromValue,
  buildAcademicBindingOptions,
  type AcademicBindingOption,
} from "../lib/academic-binding";
import { platformApi } from "../services/platform-api";
import { ProjectBackgroundPicker } from "./project-background-picker";

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
            variant={selected ? "secondary" : "outline"}
            aria-pressed={selected}
            className="h-8 px-3 text-xs"
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

export function ProjectCreateForm({ onNavigate }: { onNavigate: Navigate }) {
  const { t } = useTranslation();
  const [name, setName] = useState(() => t("projects.createForm.defaultName"));
  const [description, setDescription] = useState("");
  const [courseTeam, setCourseTeam] = useState(UNASSIGNED_ACADEMIC_OPTION.value);
  const [academicOptions, setAcademicOptions] = useState<AcademicBindingOption[]>([
    UNASSIGNED_ACADEMIC_OPTION,
  ]);
  const [academicLoading, setAcademicLoading] = useState(true);
  const [academicStatus, setAcademicStatus] = useState("");
  const [visibility, setVisibility] = useState("team");
  const [backgroundKey, setBackgroundKey] = useState<ProjectBackgroundKey | null>(null);
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

  useEffect(() => {
    let active = true;
    setAcademicLoading(true);
    platformApi
      .listAcademicOptions()
      .then((response) => {
        if (!active) return;
        const options = buildAcademicBindingOptions(response);
        setAcademicOptions(options);
        setCourseTeam(UNASSIGNED_ACADEMIC_OPTION.value);
      })
      .catch(() => {
        if (!active) return;
        setAcademicStatus(t("projects.createForm.academicLoadFailed"));
      })
      .finally(() => {
        if (active) setAcademicLoading(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  const createProject = async () => {
    setCreating(true);
    try {
      const academicBinding = academicBindingFromValue(courseTeam, academicOptions);
      const response = await platformApi.createProject({
        name,
        description: description.trim() || null,
        visibility: visibility === "course" ? "team" : visibility,
        organizationId: academicBinding.organizationId,
        courseId: academicBinding.courseId,
        classId: academicBinding.classId,
        teamId: academicBinding.teamId,
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
      <ol aria-label={t("projects.createForm.stepsLabel")} className="grid grid-cols-3 gap-2">
        {["basic", "binding", "confirm"].map((key, index) => (
          <li key={key} className="min-w-0">
            <Button
              type="button"
              variant="ghost"
              className="h-auto w-full justify-start gap-2 rounded-lg border border-border bg-muted/20 p-2 text-left transition-colors hover:bg-muted/50 disabled:cursor-default"
              aria-current={step === index ? "step" : undefined}
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
              <ProjectBackgroundPicker name={name} value={backgroundKey} onChange={setBackgroundKey} disabled={creating} />
            </Field>
          </FieldGroup>
        </FieldSet>
      ) : null}

      {step === 1 ? (
        <FieldSet>
          <FieldGroup className="gap-5">
            <Field>
              <FieldLabel id="project-visibility-label">{t("projects.createForm.visibility")}</FieldLabel>
              <SegmentedButtonGroup
                labelId="project-visibility-label"
                value={visibility}
                options={[
                  { value: "private", label: t("projects.createForm.visibilityOptions.private") },
                  { value: "team", label: t("projects.createForm.visibilityOptions.team") },
                  { value: "course", label: t("projects.createForm.visibilityOptions.course") },
                ]}
                onChange={setVisibility}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="course-team">{t("projects.createForm.academicBinding")}</FieldLabel>
              <SelectControl
                id="course-team"
                aria-label={t("projects.createForm.academicBinding")}
                value={courseTeam}
                onValueChange={setCourseTeam}
                disabled={academicLoading}
                className="h-9"
                options={academicOptions.map((option) => ({
                  value: option.value,
                  label: option.value === UNASSIGNED_ACADEMIC_OPTION.value ? t("projects.createForm.unassigned") : option.label,
                }))}
              />
              {academicStatus ? <FieldDescription>{academicStatus}</FieldDescription> : null}
            </Field>
          </FieldGroup>
        </FieldSet>
      ) : null}

      {step === 2 ? (
        <section className="grid gap-4 rounded-xl border border-border bg-muted/20 p-4" aria-label={t("projects.createForm.steps.confirm")}>
          <div><p className="text-xs text-muted-foreground">{t("projects.createForm.name")}</p><p className="mt-1 font-medium">{name}</p></div>
          <div><p className="text-xs text-muted-foreground">{t("projects.createForm.description")}</p><p className="mt-1 text-sm">{description.trim() || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">{t("projects.createForm.visibility")}</p><p className="mt-1 text-sm">{t(`projects.createForm.visibilityOptions.${visibility}`)}</p></div>
        </section>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0 || creating}>
          <ChevronLeft className="size-4" />
          {t("projects.createForm.previous")}
        </Button>
        {step < 2 ? (
          <Button type="button" onClick={() => setStep((current) => Math.min(2, current + 1))} disabled={step === 0 && !name.trim()}>
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
