// Renders the Figma-aligned feasibility implementation workspace and coordinates draft editing.
import { Progress } from '../../../shared/ui/progress';
import { Card } from "../../../shared/ui/card";
import { PageHeader, StatCard } from "../../../shared/template/layout/page";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Database,
  Edit3,
  FileCheck2,
  Gauge,
  Layers3,
  Loader2,
  Network,
  RefreshCw,
  Save,
  ShieldCheck,
  Target,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { feasibilityImplementationPlanSchema, type FeasibilityCandidateImplementation, type FeasibilityImplementationPlan, type FeasibilityInputs } from "@uml-platform/contracts";
import type { WorkspaceRecord } from "../../../entities/workspace/model";
import { Badge } from "../../../shared/ui/badge";
import { FeedbackReopenButton, type FeedbackDialogState } from "../../../shared/ui/feedback-dialog";
import { Button } from "../../../shared/ui/button";
import { cn } from "../../../shared/ui/utils";
import { categoryTextTone } from "../../../shared/ui/category-tones";
import { acceptedFeasibilityRules, feasibilityArtifactState } from "../lib/feasibility-freshness";
import {
  FEASIBILITY_INPUT_FIELDS,
  buildCostBenefitMetrics,
  buildImplementationStats,
  buildInputCompleteness,
  findCandidateImplementation,
  filterApplicableAbsenceDeclarations,
  riskScore,
  validateImplementationDraft,
} from "../lib/implementation-plan-view-model";
import { ImplementationPlanEditorDialog, type ImplementationSectionId } from "./implementation-plan-editor-dialog";

type Props = {
  workspace: WorkspaceRecord;
  states: ReturnType<typeof feasibilityArtifactState>;
  initialCandidateId?: string;
  contextExists: boolean;
  generating: boolean;
  blockedReason: string | null;
  message: string | null;
  errorMessage: string | null;
  onRegenerate: () => Promise<void> | void;
  onCompleteDependencies: () => void;
  onSave: (plan: FeasibilityImplementationPlan, inputs: FeasibilityInputs, planDirty: boolean) => Promise<void>;
};

const SECTION_IDS: ImplementationSectionId[] = ["overview", "candidates", "technical", "timeline", "costs", "risks", "verdicts", "supplements"];

function SectionHeader({ title, description, onEdit }: { title: string; description: string; onEdit: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div><h2>{title}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p></div>
      <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={onEdit} aria-label={`${t("feasibility.edit")} ${title}`}><Edit3 className="size-4" />{t("feasibility.edit")}</Button>
    </div>
  );
}

function SourceTags({ ids, assumption }: { ids: string[]; assumption?: string | null }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-1.5" aria-label={t("feasibility.sourceRules")}>
      {ids.map((id) => <Badge key={id} variant="secondary" className="font-mono text-[11px]">{id}</Badge>)}
      {!ids.length && assumption && <Badge variant="outline">{t("feasibility.costs.assumption")}: {assumption}</Badge>}
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border bg-muted/15 p-4">
      <h4 className="text-sm">{title}</h4>
      {items.length ? <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6 text-muted-foreground">{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">{t("feasibility.noData")}</p>}
    </div>
  );
}

const KPI_TILE_CLASS = "col-span-6 md:col-span-3 xl:col-span-2";

function DecisionBadge({ decision }: { decision: FeasibilityCandidateImplementation["decision"] }) {
  const { t } = useTranslation();
  const variant = decision === "no-go" ? "destructive" : decision === "conditional-go" ? "warning" : "default";
  return <Badge variant={variant}>{t(`feasibility.decision.${decision}`)}</Badge>;
}

function ModuleTopology({ plan }: { plan: FeasibilityCandidateImplementation }) {
  const { t } = useTranslation();
  const modules = plan.architecture.modules.slice(0, 9);
  const integrations = plan.integrations.slice(0, 4);
  const rows = Math.max(1, Math.ceil(modules.length / 3));
  const height = 250 + rows * 72;
  const short = (value: string, max = 18) => value.length > max ? `${value.slice(0, max - 1)}…` : value;
  return (
    <div className="overflow-x-auto rounded-xl border bg-background p-3" data-testid="implementation-module-topology">
      <svg viewBox={`0 0 760 ${height}`} className="min-w-[680px]" role="img" aria-label={t("feasibility.technical.topology")}>
        <rect x="120" y="82" width="520" height={90 + rows * 72} rx="18" fill="var(--muted)" stroke="var(--border)" strokeWidth="2" />
        <text x="140" y="110" fill="var(--muted-foreground)" fontSize="13" fontWeight="600">{t("feasibility.technical.systemBoundary")}</text>
        {integrations.map((integration, index) => {
          const width = 142;
          const gap = 16;
          const total = integrations.length * width + Math.max(0, integrations.length - 1) * gap;
          const x = 380 - total / 2 + index * (width + gap);
          return <g key={integration.id}><rect x={x} y="18" width={width} height="42" rx="10" fill="var(--card)" stroke="var(--primary)" /><text x={x + width / 2} y="44" textAnchor="middle" fill="var(--foreground)" fontSize="12">{short(integration.name, 20)}</text><path d={`M ${x + width / 2} 60 L ${x + width / 2} 78`} stroke="var(--primary)" strokeDasharray="4 3" /></g>;
        })}
        {modules.map((module, index) => {
          const column = index % 3;
          const row = Math.floor(index / 3);
          const x = 145 + column * 168;
          const y = 126 + row * 72;
          return <g key={module.id}><rect x={x} y={y} width="142" height="50" rx="10" fill="var(--card)" stroke="var(--border)" /><text x={x + 71} y={y + 29} textAnchor="middle" fill="var(--foreground)" fontSize="12" fontWeight="600">{short(module.name, 20)}</text></g>;
        })}
        <g><rect x="120" y={190 + rows * 72} width="250" height="42" rx="10" fill="var(--card)" stroke="var(--chart-2)" /><Database x="140" y={201 + rows * 72} width="18" height="18" color="var(--chart-2)" /><text x="170" y={216 + rows * 72} fill="var(--foreground)" fontSize="12">{t("feasibility.technical.data")}</text></g>
        <g><rect x="390" y={190 + rows * 72} width="250" height="42" rx="10" fill="var(--card)" stroke="var(--chart-4)" /><text x="410" y={216 + rows * 72} fill="var(--foreground)" fontSize="12">{t("feasibility.technical.deployment")}</text></g>
      </svg>
    </div>
  );
}

function RiskMatrix({ plan, selectedId, onSelect }: { plan: FeasibilityCandidateImplementation; selectedId: string | null; onSelect: (id: string) => void }) {
  const { t } = useTranslation();
  const levels = ["low", "medium", "high"] as const;
  const coordinate = { low: 0, medium: 1, high: 2 } as const;
  return (
    <Card className="gap-0 py-0 p-4">
      <h3>{t("feasibility.risks.matrix")}</h3>
      <svg viewBox="0 0 360 300" className="mt-3 w-full" role="img" aria-label={t("feasibility.risks.matrix")} data-testid="risk-matrix">
        {levels.flatMap((impact, row) => levels.map((probability, column) => {
          const score = (row + 1) * (column + 1);
          const fill = score >= 6 ? "var(--destructive)" : score >= 3 ? "var(--warning)" : "var(--success)";
          return <rect key={`${impact}-${probability}`} x={54 + column * 88} y={28 + (2 - row) * 72} width="84" height="68" rx="8" fill={fill} opacity="0.12" stroke={fill} />;
        }))}
        {plan.risks.map((risk, index) => {
          const x = 96 + coordinate[risk.probability] * 88 + ((index % 3) - 1) * 9;
          const y = 62 + (2 - coordinate[risk.impact]) * 72 + (index % 2) * 8;
          const active = selectedId === risk.id;
          return <g key={risk.id} role="button" tabIndex={0} aria-label={`${index + 1}. ${risk.risk}`} onClick={() => onSelect(risk.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(risk.id); }} className="cursor-pointer outline-none"><circle cx={x} cy={y} r={active ? 15 : 12} fill="var(--primary)" stroke="var(--primary-foreground)" strokeWidth={active ? 3 : 2} /><text x={x} y={y + 4} textAnchor="middle" fill="var(--primary-foreground)" fontSize="11" fontWeight="700">{index + 1}</text></g>;
        })}
        <text x="186" y="286" textAnchor="middle" fill="var(--muted-foreground)" fontSize="12">{t("feasibility.risks.probability")}</text>
        <text x="16" y="138" transform="rotate(-90 16 138)" textAnchor="middle" fill="var(--muted-foreground)" fontSize="12">{t("feasibility.risks.impact")}</text>
        {levels.map((level, index) => <text key={`x-${level}`} x={96 + index * 88} y="258" textAnchor="middle" fill="var(--muted-foreground)" fontSize="11">{t(`feasibility.level.${level}`)}</text>)}
        {levels.map((level, index) => <text key={`y-${level}`} x="44" y={66 + (2 - index) * 72} textAnchor="end" fill="var(--muted-foreground)" fontSize="11">{t(`feasibility.level.${level}`)}</text>)}
      </svg>
    </Card>
  );
}

function FactValue({ value, locale }: { value: unknown; locale: string }) {
  const { t } = useTranslation();
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">{t("feasibility.notProvided")}</span>;
  if (typeof value === "number") return <>{new Intl.NumberFormat(locale).format(value)}</>;
  return <>{String(value)}</>;
}

export function ImplementationPlanDashboard({ workspace, states, initialCandidateId, contextExists, generating, blockedReason, message, errorMessage, onRegenerate, onCompleteDependencies, onSave }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage?.startsWith("en") ? "en" : "zh-CN";
  const rules = acceptedFeasibilityRules(workspace);
  const persistedPlan = useMemo(
    () => workspace.feasibilityImplementationPlan
      ? feasibilityImplementationPlanSchema.parse(workspace.feasibilityImplementationPlan)
      : null,
    [workspace.feasibilityImplementationPlan],
  );
  const [draftPlan, setDraftPlan] = useState(persistedPlan);
  const [draftInputs, setDraftInputs] = useState(workspace.feasibilityInputs);
  const [planDirty, setPlanDirty] = useState(false);
  const [inputsDirty, setInputsDirty] = useState(false);
  const [activeEditor, setActiveEditor] = useState<ImplementationSectionId | null>(null);
  const [activeSection, setActiveSection] = useState<ImplementationSectionId>("overview");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [selectedRiskId, setSelectedRiskId] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    initialCandidateId && persistedPlan?.candidates.some((candidate) => candidate.id === initialCandidateId)
      ? initialCandidateId
      : persistedPlan?.recommendedCandidateId ?? persistedPlan?.candidates[0]?.id ?? null,
  );
  const sectionRefs = useRef(new Map<ImplementationSectionId, HTMLElement>());
  const requestedCandidateId =
    initialCandidateId && persistedPlan?.candidates.some((candidate) => candidate.id === initialCandidateId)
      ? initialCandidateId
      : persistedPlan?.recommendedCandidateId ?? persistedPlan?.candidates[0]?.id ?? null;

  useEffect(() => {
    setDraftPlan(persistedPlan);
    setDraftInputs(workspace.feasibilityInputs);
    setPlanDirty(false);
    setInputsDirty(false);
  }, [persistedPlan, workspace.feasibilityInputs]);

  useEffect(() => {
    setSelectedCandidateId(requestedCandidateId);
    setSelectedRiskId(null);
  }, [requestedCandidateId]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      const id = visible?.target.getAttribute("data-section") as ImplementationSectionId | null;
      if (id) setActiveSection(id);
    }, { rootMargin: "-18% 0px -68%", threshold: [0.1, 0.35, 0.6] });
    sectionRefs.current.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [draftPlan]);

  if (!draftPlan) {
    return <Card className="gap-0 py-0 flex min-h-72 items-center justify-center border-dashed text-sm text-muted-foreground flex-row">{t("feasibility.missingPlan")}</Card>;
  }

  const completion = buildInputCompleteness(draftInputs);
  const selected = findCandidateImplementation(draftPlan, selectedCandidateId);
  const activeCandidate = selected.candidate;
  const activeImplementation = selected.implementation;
  const applicableAbsenceDeclarations = activeImplementation ? filterApplicableAbsenceDeclarations(activeImplementation) : [];
  const stats = buildImplementationStats(draftPlan, activeCandidate?.id);
  const metrics = buildCostBenefitMetrics(draftInputs, activeImplementation);
  const recommended = draftPlan.candidates.find((candidate) => candidate.id === draftPlan.recommendedCandidateId);
  const recommendedImplementation = recommended?.implementation ?? null;
  const dirty = planDirty || inputsDirty;
  const money = (value: number | null) => value === null ? t("feasibility.dataInsufficient") : new Intl.NumberFormat(locale, { style: "currency", currency: "CNY", maximumFractionDigits: 2 }).format(value);
  const moneyRange = (range: { minimum?: number; maximum?: number } | null) => typeof range?.minimum === "number" && typeof range.maximum === "number"
    ? `${money(range.minimum)} – ${money(range.maximum)}`
    : t("feasibility.dataInsufficient");
  const metricRange = (range: { minimum: number; maximum: number } | null, kind: "ratio" | "payback") => range
    ? kind === "ratio"
      ? `${range.minimum.toFixed(2)} – ${range.maximum.toFixed(2)}`
      : t("feasibility.costs.periodRange", { minimum: range.minimum.toFixed(2), maximum: range.maximum.toFixed(2) })
    : t("feasibility.dataInsufficient");
  const setSectionRef = (id: ImplementationSectionId) => (element: HTMLElement | null) => { if (element) sectionRefs.current.set(id, element); else sectionRefs.current.delete(id); };
  const open = (id: ImplementationSectionId) => setActiveEditor(id);

  const save = async () => {
    // Input-only edits remain available for legacy workspaces; plan validation applies only when plan content changed.
    const validation = planDirty ? validateImplementationDraft(draftPlan, rules.map((rule) => rule.id)) : [];
    if (validation.length) {
      setLocalError(validation.map((code) => t(`feasibility.editor.${code}`)).join(" "));
      return;
    }
    setSaveState("saving");
    setLocalError(null);
    try {
      await onSave(draftPlan, draftInputs, planDirty);
      setPlanDirty(false);
      setInputsDirty(false);
      setSaveState("saved");
      setSavedAt(new Date());
    } catch (cause) {
      setSaveState("error");
      setLocalError(cause instanceof Error ? cause.message : t("feasibility.workspaceSaveFailed"));
    }
  };

  const regenerate = async () => {
    if (generating || blockedReason) return;
    if (states.missingDependencies.length) { onCompleteDependencies(); return; }
    if (dirty && !window.confirm(t("feasibility.confirmRegenerate"))) return;
    await onRegenerate();
    setSelectedCandidateId(draftPlan.recommendedCandidateId ?? draftPlan.candidates[0]?.id ?? null);
  };

  const applyDraft = (nextPlan: FeasibilityImplementationPlan, nextInputs: FeasibilityInputs) => {
    setDraftPlan(nextPlan);
    setDraftInputs(nextInputs);
    setPlanDirty(JSON.stringify(nextPlan) !== JSON.stringify(persistedPlan));
    setInputsDirty(JSON.stringify(nextInputs) !== JSON.stringify(workspace.feasibilityInputs));
    setSaveState("idle");
    if (!nextPlan.candidates.some((candidate) => candidate.id === selectedCandidateId)) {
      setSelectedCandidateId(nextPlan.recommendedCandidateId ?? nextPlan.candidates[0]?.id ?? null);
    }
  };

  const statusText = saveState === "saving" ? t("feasibility.workspaceSaving") : saveState === "error" ? t("feasibility.workspaceSaveFailed") : dirty ? t("feasibility.workspaceUnsaved") : savedAt ? `${t("feasibility.workspaceSaved")} · ${new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(savedAt)}` : t("feasibility.workspaceSaved");
  const pageNoticeMessages = [
    states.missingDependencies.length > 0 ? t("feasibility.dependencies.missing", { artifacts: states.missingDependencies.map((kind) => t(kind === "context" ? "feasibility.artifact.context" : "feasibility.artifact.businessFlow")).join("、") }) : null,
    states.implementationStale ? t("feasibility.staleWarning") : null,
    errorMessage,
    localError,
    draftPlan.candidates.length < 2 ? draftPlan.reducedCandidateReason : null,
  ].filter((value): value is string => Boolean(value));
  const pageFeedback: FeedbackDialogState | null = pageNoticeMessages.length > 0 ? {
    dedupeKey: "feasibility:implementation:notices",
    revision: pageNoticeMessages.join("|"),
    tone: errorMessage || localError ? "destructive" : "warning",
    title: t("feedback.needsAttentionCount", { count: pageNoticeMessages.length }),
    message: pageNoticeMessages.join("\n"),
    keepReopenEntry: true,
  } : null;

  return (
    <div
      data-testid="implementation-plan-dashboard"
      className="mx-auto grid w-[calc(100%-2rem)] max-w-7xl grid-cols-6 gap-6 py-6 lg:w-[calc(100%-3rem)]"
    >
      <header className="col-span-full grid gap-5">
        <PageHeader
          title={t("feasibility.implementationTitle")}
          description={t("feasibility.implementationDescription")}
          notice={pageFeedback ? <FeedbackReopenButton feedback={pageFeedback} label={t("feedback.needsAttentionCount", { count: pageNoticeMessages.length })} /> : null}
          titleAccessory={<Badge variant={states.implementationStale ? "warning" : "success"}>{t(`feasibility.status.${states.implementationStale ? "stale" : "current"}`)}</Badge>}
          actions={<div className="flex flex-col items-end gap-2"><div className="flex gap-2"><Button type="button" variant="outline" onClick={() => void regenerate()} disabled={generating || Boolean(blockedReason)} title={blockedReason ?? undefined}><RefreshCw className={cn("size-4", generating && "animate-spin")} />{t("feasibility.regenerate")}</Button><Button type="button" onClick={() => void save()} disabled={!dirty || saveState === "saving"}>{saveState === "saving" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{t("feasibility.savePlan")}</Button></div><span aria-live="polite" className={cn("text-xs text-muted-foreground", saveState === "error" && "text-destructive")}>{statusText}</span></div>}
        />
        {blockedReason && <p role="status" className="text-sm text-muted-foreground">{blockedReason}</p>}
        {states.missingDependencies.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-warning">
          <span>{t("feasibility.dependencies.required")}</span>
          <Button type="button" variant="outline" onClick={onCompleteDependencies} disabled={generating}>{t("feasibility.dependencies.complete")}</Button>
        </div>}
        <div className="grid grid-cols-6 gap-3 lg:gap-6">
          <StatCard className={KPI_TILE_CLASS} iconClassName="bg-success/10 text-success" icon={<CheckCircle2 />} value={t("feasibility.dependency.rulesValue", { accepted: rules.length, total: workspace.rules.length })} label={t("feasibility.dependency.rules")} />
          <StatCard className={KPI_TILE_CLASS} iconClassName={contextExists && !states.contextStale ? "bg-success/10 text-success" : "bg-warning/10 text-warning"} icon={<Network />} value={!contextExists ? t("feasibility.dependency.contextMissing") : states.contextStale ? t("feasibility.dependency.contextStale") : t("feasibility.dependency.contextReady")} label={t("feasibility.dependency.context")} />
          <StatCard className={KPI_TILE_CLASS} icon={<Gauge />} value={t("feasibility.dependency.factsValue", { percent: completion.percent, pending: completion.pending })} label={t("feasibility.dependency.facts")} />
        </div>
        {(states.implementationStale || errorMessage || localError) && <p role="status" className={cn("flex items-start gap-2 text-sm", errorMessage || localError ? "text-destructive" : "text-warning")}><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{errorMessage || localError ? t("feasibility.workspaceSaveFailed") : t("feasibility.status.stale")}</span></p>}
        {message && <div aria-live="polite" className="text-xs text-muted-foreground">{message}</div>}
      </header>

      <nav aria-label={t("feasibility.implementationTitle")} className="sticky top-0 z-20 col-span-full overflow-x-auto border-b bg-background/90 py-3 ">
        <div className="flex min-w-max gap-6">{SECTION_IDS.map((id) => <Button variant="ghost" key={id} type="button" aria-current={activeSection === id ? "location" : undefined} className={cn("cursor-pointer border-b-2 pb-1 text-sm", activeSection === id && "")} onClick={() => { setActiveSection(id); sectionRefs.current.get(id)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); }}>{t(`feasibility.nav.${id}`)}</Button>)}</div>
      </nav>

      <section ref={setSectionRef("overview")} data-section="overview" className="scroll-mt-20 col-span-full grid gap-4" aria-labelledby="implementation-overview-title">
        <div className="grid grid-cols-6 gap-3 lg:gap-6"><StatCard className={KPI_TILE_CLASS} value={stats.candidates} label={t("feasibility.overview.options")} icon={<Layers3 />} /><StatCard className={KPI_TILE_CLASS} value={stats.modules} label={t("feasibility.overview.modules")} icon={<Network />} /><StatCard className={KPI_TILE_CLASS} value={stats.milestones} label={t("feasibility.overview.milestones")} icon={<Clock3 />} /><StatCard className={KPI_TILE_CLASS} value={stats.highRisks} label={t("feasibility.overview.highRisks")} icon={<AlertTriangle />} /></div>
        <Card className="gap-0 py-0 p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">{t("feasibility.overview.recommended")}</p><h2 id="implementation-overview-title" className="mt-2 text-2xl">{recommended?.name ?? t("feasibility.notProvided")}</h2></div><div className="flex items-center gap-2">{recommendedImplementation && <DecisionBadge decision={recommendedImplementation.decision} />}<Button type="button" variant="ghost" size="icon" onClick={() => open("overview")} aria-label={`${t("feasibility.edit")} ${t("feasibility.nav.overview")}`}><Edit3 className="size-4" /></Button></div></div><p className="mt-4 text-sm leading-7 text-muted-foreground">{draftPlan.recommendationRationale}</p><div className="mt-5 grid gap-5 lg:grid-cols-[1fr_220px]"><div className="rounded-xl border bg-muted/15 p-4"><h3 className="text-sm uppercase tracking-wide text-muted-foreground">{t("feasibility.overview.preconditions")}</h3>{recommendedImplementation?.preconditions.length ? <ul className="mt-3 space-y-2 text-sm">{recommendedImplementation.preconditions.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" /><span>{item}</span></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">{t("feasibility.overview.noPreconditions")}</p>}</div><div className="rounded-xl bg-primary/8 p-4"><div className="flex items-center justify-between"><span className="text-sm font-medium">{t("feasibility.overview.completeness")}</span><strong className="text-lg text-primary">{completion.percent}%</strong></div><Progress value={completion.percent} aria-label={t("feasibility.overview.completeness")} className="mt-3 **:data-[slot=progress-track]:h-2" /><p className="mt-2 text-xs text-muted-foreground">{completion.completed}/{completion.total}</p></div></div></Card>
      </section>

      <section ref={setSectionRef("candidates")} data-section="candidates" className="scroll-mt-20 col-span-full"><SectionHeader title={t("feasibility.candidate.title")} description={t("feasibility.candidate.description")} onEdit={() => open("candidates")} /><div role="radiogroup" aria-label={t("feasibility.candidate.selectLabel")} className="grid gap-4 lg:grid-cols-2">{draftPlan.candidates.map((candidate, index) => { const recommendedCandidate = candidate.id === draftPlan.recommendedCandidateId; const selectedCandidate = candidate.id === activeCandidate?.id; return <Card as="article" key={candidate.id} role="radio" aria-checked={selectedCandidate} tabIndex={selectedCandidate ? 0 : -1} onClick={() => { setSelectedCandidateId(candidate.id); setSelectedRiskId(null); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedCandidateId(candidate.id); setSelectedRiskId(null); return; } if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "ArrowUp" && event.key !== "ArrowDown") return; event.preventDefault(); const offset = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1; const nextIndex = (index + offset + draftPlan.candidates.length) % draftPlan.candidates.length; const next = draftPlan.candidates[nextIndex]; if (next) { setSelectedCandidateId(next.id); setSelectedRiskId(null); const cards = event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]'); cards?.item(nextIndex).focus(); } }} className={cn("gap-0 py-0 relative cursor-pointer border-2 p-5 transition-colors duration-200 outline-none hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", selectedCandidate && "gap-0 py-0 border-primary ring-2 ring-primary/25")}><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3">{selectedCandidate && <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-hidden="true"><CheckCircle2 className="size-4" /></span>}<div><p className="font-mono text-xs text-muted-foreground">{t("feasibility.candidate.option", { index: index + 1 })}</p><h3 className="mt-1 text-lg">{candidate.name}</h3></div></div><div className="flex flex-wrap justify-end gap-2"><Badge variant="outline">{t(`feasibility.provenance.${candidate.provenance}`)}</Badge>{selectedCandidate && <Badge variant="secondary">{t("feasibility.candidate.currentView")}</Badge>}{recommendedCandidate && <Badge>{t("feasibility.candidate.recommended")}</Badge>}{!candidate.implementation && <Badge variant="warning">{t("feasibility.candidate.pendingDetails")}</Badge>}</div></div><p className="mt-3 text-sm leading-6 text-muted-foreground">{candidate.summary}</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><ListBlock title={t("feasibility.candidate.advantages")} items={candidate.advantages} /><ListBlock title={t("feasibility.candidate.disadvantages")} items={candidate.disadvantages} /></div><div className="mt-4 grid grid-cols-2 gap-4 border-t pt-4 text-sm"><div><p className="text-xs text-muted-foreground">{t("feasibility.candidate.estimatedCost")}</p><p className="mt-1 font-medium">{candidate.estimatedCost}</p></div><div><p className="text-xs text-muted-foreground">{t("feasibility.candidate.estimatedSchedule")}</p><p className="mt-1 font-medium">{candidate.estimatedSchedule}</p></div></div><div className="mt-4"><SourceTags ids={candidate.sourceRequirementIds} assumption={candidate.assumption} /></div></Card>; })}</div>{draftPlan.candidates.length < 2 && draftPlan.reducedCandidateReason && <p role="status" className="mt-3 text-sm text-warning">{t("feasibility.candidate.pendingDetails")}</p>}</section>

      <section
        role="region"
        aria-labelledby="candidate-details-title"
        className="scroll-mt-20 col-span-full rounded-[1.5rem] border-2 border-primary/45 bg-primary/[0.025] p-3 shadow-sm sm:p-5"
      >
        <div className="mb-6 flex items-start gap-3 border-b-2 border-primary/35 pb-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground" aria-hidden="true">
            <CheckCircle2 className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              {t("feasibility.candidate.detailsEyebrow")}
            </p>
            <h2 id="candidate-details-title" className="mt-1 break-words text-xl" aria-live="polite">
              {t("feasibility.candidate.detailsTitle", { name: activeCandidate?.name ?? t("feasibility.notProvided") })}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t("feasibility.candidate.detailsDescription")}
            </p>
          </div>
        </div>

      {activeImplementation ? <div className="grid gap-6">
      <section ref={setSectionRef("technical")} data-section="technical" className="scroll-mt-20"><SectionHeader title={`${t("feasibility.technical.title")} · ${activeCandidate?.name ?? ""}`} description={t("feasibility.technical.description")} onEdit={() => open("technical")} /><div className="grid gap-4"><Card className="gap-0 py-0 grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,1.1fr)]"><div><div className="flex items-center gap-2"><h3>{t("feasibility.technical.architecture")}</h3><Badge variant="outline">{t(`feasibility.provenance.${activeImplementation.provenance}`)}</Badge></div><p className="mt-3 text-sm leading-7 text-muted-foreground">{activeImplementation.architecture.summary}</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><ListBlock title={t("feasibility.technical.data")} items={[activeImplementation.dataStrategy.summary]} /><ListBlock title={t("feasibility.technical.deployment")} items={[activeImplementation.deploymentAndOperations.summary]} /><ListBlock title={t("feasibility.technical.security")} items={[activeImplementation.securityAndCompliance.summary]} /></div></div><ModuleTopology plan={activeImplementation} /></Card><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{activeImplementation.architecture.modules.map((module) => <Card as="article" key={module.id} className="gap-0 py-0 p-4"><div className="flex items-center gap-2"><span className="rounded-lg bg-primary/10 p-2 text-primary"><Layers3 className="size-4" /></span><h3 className="text-base">{module.name}</h3></div><p className="mt-3 text-sm leading-6 text-muted-foreground">{module.responsibility}</p><div className="mt-3"><SourceTags ids={module.sourceRequirementIds} assumption={module.assumption} /></div></Card>)}{activeImplementation.integrations.map((integration) => <Card as="article" key={integration.id} className="gap-0 py-0 border-dashed p-4"><div className="flex items-center gap-2"><Network className="size-4 text-chart-4" /><h3 className="text-base">{integration.name}</h3></div><p className="mt-3 text-sm leading-6 text-muted-foreground">{integration.responsibility}</p><div className="mt-3"><SourceTags ids={integration.sourceRequirementIds} assumption={integration.assumption} /></div></Card>)}{!activeImplementation.integrations.length && <Card as="article" className="gap-0 py-0 border-dashed p-4"><h3 className="text-base">{t("feasibility.technical.noIntegrations")}</h3><p className="mt-2 text-sm text-muted-foreground">{activeImplementation.integrationRationale ?? t("feasibility.notProvided")}</p></Card>}</div></div></section>

      <section ref={setSectionRef("timeline")} data-section="timeline" className="scroll-mt-20"><SectionHeader title={`${t("feasibility.timeline.title")} · ${activeCandidate?.name ?? ""}`} description={t("feasibility.timeline.description")} onEdit={() => open("timeline")} /><Card className="gap-0 py-0 p-5"><ol className="relative ml-3 border-l border-border">{activeImplementation.milestones.map((milestone, index) => <li key={milestone.id} className="relative pb-8 pl-8 last:pb-0"><span className="absolute -left-4 top-0 flex size-8 items-center justify-center rounded-full border bg-background text-sm font-semibold text-primary">{index + 1}</span><div className="flex flex-wrap items-center justify-between gap-2"><h3>{milestone.name}</h3><Badge variant="secondary"><Clock3 className="mr-1 size-3" />{milestone.timeframe}</Badge></div><div className="mt-3 grid gap-3 md:grid-cols-2"><ListBlock title={t("feasibility.timeline.deliverables")} items={milestone.deliverables} /><ListBlock title={t("feasibility.timeline.acceptance")} items={milestone.acceptanceCriteria} /><ListBlock title={t("feasibility.timeline.roles")} items={milestone.roles} /><ListBlock title={t("feasibility.timeline.dependencies")} items={milestone.dependencies.length ? milestone.dependencies : milestone.dependencyRationale ? [milestone.dependencyRationale] : []} /></div>{milestone.dependencies.length > 0 && <p className="mt-3 flex items-center gap-2 text-xs text-warning"><AlertTriangle className="size-3.5" />{t("feasibility.timeline.blocker")}</p>}<div className="mt-3"><SourceTags ids={milestone.sourceRequirementIds} assumption={milestone.assumption} /></div></li>)}</ol></Card></section>

      <section ref={setSectionRef("costs")} data-section="costs" className="scroll-mt-20">
        <SectionHeader title={`${t("feasibility.costs.title")} · ${activeCandidate?.name ?? ""}`} description={t("feasibility.costs.description")} onEdit={() => open("costs")} />
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{t("feasibility.costs.estimateHint")}</span>
          <Badge variant="outline">{t(`feasibility.provenance.${metrics.analysisPeriodSource}`)}</Badge>
          <span>{t("feasibility.costs.analysisPeriod", { years: metrics.analysisYears ?? "—" })}</span>
        </div>
        <div className="grid grid-cols-6 gap-3 lg:gap-6">{[
          [t("feasibility.costs.totalCost"), moneyRange(metrics.totalCostRange), <CircleDollarSign key="icon" />],
          [t("feasibility.costs.totalBenefit"), moneyRange(metrics.totalBenefitRange), <Target key="icon" />],
          [t("feasibility.costs.ratio"), metricRange(metrics.ratioRange, "ratio"), <Gauge key="icon" />],
          [t("feasibility.costs.payback"), metricRange(metrics.paybackRange, "payback"), <Clock3 key="icon" />],
        ].map(([label, value, icon]) => <StatCard key={String(label)} className={KPI_TILE_CLASS} icon={icon} value={<span className="break-words">{value}</span>} label={label} />)}</div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card className="gap-0 py-0 overflow-hidden"><h3 className="border-b bg-muted/30 px-4 py-3 text-base">{t("feasibility.costs.aiCostEstimates")}</h3><div className="divide-y">{activeImplementation.costEstimates.map((item) => <div key={item.id} className="px-4 py-3 text-sm"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{t(`feasibility.costCategory.${item.category}`)} · {t(`feasibility.frequency.${item.frequency}`)}</p></div><div className="text-right"><p className="font-mono">{moneyRange(item.range)}</p><Badge variant="outline">{t(`feasibility.provenance.${item.provenance}`)}</Badge></div></div><p className="mt-2 text-xs leading-5 text-muted-foreground">{item.range.basis} · {t("feasibility.costs.confidence")}: {t(`feasibility.level.${item.range.confidence}`)}</p><div className="mt-2"><SourceTags ids={item.sourceRequirementIds} assumption={item.assumption} /></div></div>)}</div></Card>
          <Card className="gap-0 py-0 overflow-hidden"><h3 className="border-b bg-muted/30 px-4 py-3 text-base">{t("feasibility.costs.aiBenefitEstimates")}</h3><div className="divide-y">{activeImplementation.benefitEstimates.map((item) => <div key={item.id} className="px-4 py-3 text-sm"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{t(`feasibility.benefitCategory.${item.category}`)} · {t(`feasibility.frequency.${item.frequency}`)}</p></div><div className="text-right"><p className="font-mono">{item.range ? moneyRange(item.range) : item.outcome}</p><Badge variant="outline">{t(`feasibility.provenance.${item.provenance}`)}</Badge></div></div>{item.range && <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.range.basis} · {t("feasibility.costs.confidence")}: {t(`feasibility.level.${item.range.confidence}`)}</p>}<p className="mt-2 text-xs leading-5 text-muted-foreground">{item.outcome}</p><div className="mt-2"><SourceTags ids={item.sourceRequirementIds} assumption={item.assumption} /></div></div>)}</div></Card>
        </div>
        {!!applicableAbsenceDeclarations.length && <div className="mt-4 rounded-xl border bg-muted/15 p-4"><h3 className="text-sm">{t("feasibility.costs.notApplicable")}</h3><ul className="mt-2 space-y-1 text-sm text-muted-foreground">{applicableAbsenceDeclarations.map((item) => <li key={item.scope}>{t(`feasibility.absenceScope.${item.scope}`)}: {item.reason}</li>)}</ul></div>}
        <p className="mt-4 text-xs text-muted-foreground">{t("feasibility.costs.confirmedFactsHint")}</p>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">{[[t("feasibility.costs.confirmedCosts"), draftInputs.costItems], [t("feasibility.costs.confirmedBenefits"), draftInputs.benefitItems]].map(([title, items]) => <Card key={String(title)} className="gap-0 py-0 overflow-hidden"><h3 className="border-b bg-muted/30 px-4 py-3 text-base">{title as string}</h3><div className="divide-y">{(items as FeasibilityInputs["costItems"]).length ? (items as FeasibilityInputs["costItems"]).map((item) => <div key={item.id} className="grid grid-cols-[1fr_auto] gap-2 px-4 py-3 text-sm"><div><p className="font-medium">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{item.note || t("feasibility.notProvided")} · {t(`feasibility.frequency.${item.frequency}`)}</p></div><span className="font-mono">{item.amount === null ? t("feasibility.notProvided") : money(item.amount)}</span></div>) : <p className="p-6 text-center text-sm text-muted-foreground">{t("feasibility.notProvided")}</p>}</div></Card>)}</div>
      </section>

      <section ref={setSectionRef("risks")} data-section="risks" className="scroll-mt-20"><SectionHeader title={`${t("feasibility.risks.title")} · ${activeCandidate?.name ?? ""}`} description={t("feasibility.risks.description")} onEdit={() => open("risks")} /><div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]"><RiskMatrix plan={activeImplementation} selectedId={selectedRiskId} onSelect={setSelectedRiskId} /><Card className="gap-0 py-0 overflow-hidden"><h3 className="border-b bg-muted/30 px-4 py-3">{t("feasibility.risks.register")}</h3><div className="divide-y">{activeImplementation.risks.length ? activeImplementation.risks.map((risk, index) => <Button variant="ghost" key={risk.id} type="button" onClick={() => setSelectedRiskId(risk.id)} className={cn("grid w-full cursor-pointer gap-3 p-4 text-left md:grid-cols-[32px_1fr_110px_110px]", selectedRiskId === risk.id && "")}><span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span><span><span className="flex flex-wrap items-center gap-2 font-medium">{risk.risk}<Badge variant="outline">{t(`feasibility.provenance.${risk.provenance}`)}</Badge></span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{risk.mitigation}</span><span className="mt-2 block"><SourceTags ids={risk.sourceRequirementIds} assumption={risk.assumption} /></span></span><span className="text-xs"><span className="block text-muted-foreground">{t("feasibility.risks.probability")}</span>{t(`feasibility.level.${risk.probability}`)}</span><span className="text-xs"><span className="block text-muted-foreground">{t("feasibility.risks.impact")}</span>{t(`feasibility.level.${risk.impact}`)} · {riskScore(risk)}</span></Button>) : <p className="p-8 text-center text-sm text-muted-foreground">{t("feasibility.risks.empty")}</p>}</div></Card></div></section>

      <section ref={setSectionRef("verdicts")} data-section="verdicts" className="scroll-mt-20"><SectionHeader title={`${t("feasibility.verdicts.title")} · ${activeCandidate?.name ?? ""}`} description={t("feasibility.verdicts.description")} onEdit={() => open("verdicts")} /><Card className="gap-0 py-0 mb-4 p-4"><div className="flex flex-wrap items-center gap-3"><DecisionBadge decision={activeImplementation.decision} /><span className="text-sm font-medium">{t("feasibility.overview.preconditions")}</span></div><ListBlock title={t("feasibility.overview.preconditions")} items={activeImplementation.preconditions} /></Card><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{activeImplementation.verdicts.map((verdict) => { const icons = { technical: <Layers3 className="size-5" />, operational: <Users className="size-5" />, schedule: <Clock3 className="size-5" />, economic: <CircleDollarSign className="size-5" />, legal: <ShieldCheck className="size-5" /> }; return <Card as="article" key={verdict.category} className="gap-0 py-0 p-4"><div className={cn("flex items-center justify-between gap-2", categoryTextTone(["technical", "operational", "schedule", "economic", "legal"].indexOf(verdict.category)))}>{icons[verdict.category]}<div className="flex flex-wrap justify-end gap-1"><Badge variant="outline">{t(`feasibility.provenance.${verdict.provenance}`)}</Badge><Badge variant={verdict.verdict === "not-feasible" ? "destructive" : verdict.verdict === "conditional" || verdict.verdict === "unknown" ? "warning" : "secondary"}>{t(`feasibility.verdict.${verdict.verdict}`)}</Badge></div></div><h3 className="mt-4 text-base">{t(`feasibility.category.${verdict.category}`)}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{verdict.rationale}</p></Card>; })}</div></section>
      </div> : <Card as="section" className="gap-0 py-0 border-dashed p-8 text-center"><AlertTriangle className="mx-auto size-8 text-warning" /><h2 className="mt-3 text-lg">{t("feasibility.candidate.detailsMissingTitle", { name: activeCandidate?.name ?? t("feasibility.notProvided") })}</h2><p className="mt-2 text-sm text-muted-foreground">{t("feasibility.candidate.detailsMissingDescription")}</p><Button type="button" variant="outline" className="mt-4" onClick={() => void regenerate()} disabled={generating || Boolean(blockedReason)} title={blockedReason ?? undefined}><RefreshCw className={cn("size-4", generating && "animate-spin")} />{t("feasibility.regenerate")}</Button></Card>}
      </section>

      <section ref={setSectionRef("supplements")} data-section="supplements" className="scroll-mt-20 col-span-full"><SectionHeader title={t("feasibility.supplements.title")} description={t("feasibility.supplements.description")} onEdit={() => open("supplements")} /><div className="grid gap-4 lg:grid-cols-2">{(["cover", "facts"] as const).map((group) => <Card as="article" key={group} className="gap-0 py-0 p-5"><div className="flex items-center gap-2"><span className="rounded-lg bg-primary/10 p-2 text-primary">{group === "cover" ? <FileCheck2 className="size-5" /> : <Database className="size-5" />}</span><h3>{t(`feasibility.supplements.${group}`)}</h3></div><dl className="mt-4 divide-y">{FEASIBILITY_INPUT_FIELDS.filter((field) => field.group === group).map((field) => <div key={field.key} className="grid gap-1 py-3 sm:grid-cols-[160px_1fr]"><dt className="text-xs font-medium text-muted-foreground">{t(`feasibility.fields.${field.key}`)}</dt><dd className="break-words text-sm"><FactValue value={draftInputs[field.key]} locale={locale} /></dd></div>)}</dl></Card>)}</div></section>

      <ImplementationPlanEditorDialog section={activeEditor} selectedCandidateId={activeCandidate?.id ?? null} plan={draftPlan} inputs={draftInputs} rules={rules} onClose={() => setActiveEditor(null)} onApply={applyDraft} />
    </div>
  );
}
