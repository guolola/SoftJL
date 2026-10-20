// Presents the two project workflows as an accessible, exclusive card selection.
import { useTranslation } from "react-i18next";
import ChatIllustrations09 from "./illustrations/chat-illustrations-09";
import BeamIllustrations31 from "./illustrations/beam-illustrations-31";
import { RadioGroup, RadioGroupItem } from "../../../shared/ui/radio-group";
import { cn } from "../../../shared/ui/utils";

type ProjectMode = "standard" | "professional";

export function ProjectModeSelector({ value, onChange, disabled = false }: {
  value: ProjectMode;
  onChange: (mode: ProjectMode) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="project-mode-label" className="grid gap-4">
      <div className="space-y-1">
        <h3 id="project-mode-label" className="font-medium">{t("projects.createForm.mode.label")}</h3>
        <p className="text-sm text-muted-foreground">{t("projects.createForm.mode.intro")}</p>
      </div>
      <RadioGroup aria-labelledby="project-mode-label" value={value} onValueChange={onChange} disabled={disabled} className="grid gap-3 sm:grid-cols-2">
        {(["standard", "professional"] as const).map(mode => {
          const selected = value === mode;
          const Illustration = mode === "standard" ? ChatIllustrations09 : BeamIllustrations31;
          return (
            <label key={mode} className={cn("relative flex cursor-pointer flex-col gap-4 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/30 has-focus-visible:ring-2 has-focus-visible:ring-ring", selected ? "border-primary ring-1 ring-primary" : "border-border")}>
              {/* Artwork is decorative: only the card's radio participates in selection and focus. */}
              <div aria-hidden="true" data-project-mode-illustration={mode === "standard" ? "chat" : "beam"} className="pointer-events-none relative h-56 overflow-hidden rounded-lg bg-muted/40 select-none sm:h-64">
                <div className="absolute left-1/2 top-1/2 flex w-80 origin-center -translate-x-1/2 -translate-y-1/2 scale-[0.58] items-center justify-center sm:scale-[0.65]">
                  <Illustration />
                </div>
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <span className="block text-xs font-medium text-muted-foreground">{t(`projects.createForm.mode.${mode}Style`)}</span>
                  <span id={`project-mode-${mode}-title`} className="block text-base font-semibold">{t(`projects.createForm.mode.${mode}`)}</span>
                </div>
                <RadioGroupItem value={mode} aria-labelledby={`project-mode-${mode}-title`} aria-describedby={`project-mode-${mode}-description`} className="mt-1" />
              </div>
              <p id={`project-mode-${mode}-description`} className="text-sm leading-6 text-muted-foreground">{t(`projects.createForm.mode.${mode}Description`)}</p>
            </label>
          );
        })}
      </RadioGroup>
      <p className="text-xs leading-5 text-muted-foreground">{t("projects.createForm.mode.immutable")}</p>
    </section>
  );
}
