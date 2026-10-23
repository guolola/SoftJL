// Creates invitation-only projects from a single form with details and mode selection.
import { Textarea } from '../../../shared/ui/textarea';
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { floatingAlert } from "../../../shared/ui/floating-alert";
import { localizeCaughtFailure } from "../../../shared/i18n/api-errors";
import { Loader2 } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import { Field, FieldGroup, FieldLabel, FieldSet } from "../../../shared/ui/field";
import { platformApi } from "../services/platform-api";
import { randomProjectBackground } from "../lib/project-backgrounds";
import { ProjectModeSelector } from "./project-mode-selector";
import { queueProjectIntroduction } from "../../../shared/lib/project-introduction";

type Navigate = (path: string) => void;

export function ProjectCreateForm({ onNavigate }: { onNavigate: Navigate }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectMode, setProjectMode] = useState<"standard" | "professional">("standard");
  // Assign a default once; users can change the background in project settings after creation.
  const [backgroundKey] = useState(() => randomProjectBackground().key);
  const [creating, setCreating] = useState(false);
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
        backgroundKey,
      });
      queueProjectIntroduction(response.project.id, response.project.projectMode);
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
    <form className="grid gap-6" onSubmit={(event) => { event.preventDefault(); void createProject(); }}>
      <FieldSet disabled={creating}>
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
          <ProjectModeSelector value={projectMode} onChange={setProjectMode} disabled={creating} />
        </FieldGroup>
      </FieldSet>
      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{t("projects.createForm.invitationAccess")}</p>
        <Button type="submit" disabled={creating || !name.trim()} className="shrink-0">
          {creating && <Loader2 className="size-4 animate-spin" />}
          {t("projects.createForm.submit")}
        </Button>
      </div>
    </form>
  );
}
