// Composes the standalone project creation page around the shared create form.
import { ProjectCreateForm } from "./project-create-form";
import { useTranslation } from "react-i18next";
import { PageFrame, SectionCard } from "./project-page-layout";

type Navigate = (path: string) => void;

export function ProjectNewPage({ onNavigate }: { onNavigate: Navigate }) {
  const { t } = useTranslation();
  return (
    <PageFrame onNavigate={onNavigate}>
      <div>
        <h1>{t("projects.createProject")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("projects.createProjectDescription")}
        </p>
      </div>
      <SectionCard>
        <ProjectCreateForm onNavigate={onNavigate} />
      </SectionCard>
    </PageFrame>
  );
}
