// Makes project access explicit for both personal tokens and browser authorization.
import { useTranslation } from "react-i18next";
import type { McpProjectAccess } from "@uml-platform/contracts";
import { Checkbox } from "../../../shared/ui/checkbox";
import { Label } from "../../../shared/ui/label";
import { SelectControl } from "../../../shared/ui/select";

export function ProjectAccessSelector({ projects, value, onChange, disabled = false }: {
  projects: { id: string; name: string }[];
  value: McpProjectAccess;
  onChange: (value: McpProjectAccess) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return <fieldset disabled={disabled} className="space-y-3">
    <legend className="mb-2 text-sm font-medium">{t("mcp.projects")}</legend>
    <Label htmlFor="mcp-project-scope">{t("mcp.scope")}</Label>
    <SelectControl id="mcp-project-scope" value={value.projectScope} disabled={disabled}
      onValueChange={(scope) => onChange({ projectScope: scope === "account" ? "account" : "selected", projectIds: [] })}
      options={[{ value: "selected", label: t("mcp.selectedProjects") }, { value: "account", label: t("mcp.allProjects") }]} />
    {value.projectScope === "account" ? <p className="text-sm text-muted-foreground">{t("mcp.accountScopeHelp")}</p> : <>
      <div className="max-h-48 space-y-2 overflow-y-auto">
        {projects.map(project => <Label key={project.id} className="flex items-center gap-2">
          <Checkbox disabled={disabled} checked={value.projectIds.includes(project.id)}
            onCheckedChange={(checked) => onChange({ projectScope: "selected", projectIds: checked ? [...new Set([...value.projectIds, project.id])] : value.projectIds.filter(id => id !== project.id) })} />
          <span className="break-words">{project.name}</span>
        </Label>)}
      </div>
      {!projects.length && <p className="text-sm text-muted-foreground">{t("mcp.noProjects")}</p>}
      {!value.projectIds.length && <p className="text-sm text-muted-foreground">{t("mcp.selectRequired")}</p>}
    </>}
    <p className="text-xs leading-5 text-muted-foreground">{t("mcp.projectsHelp")}</p>
  </fieldset>;
}
