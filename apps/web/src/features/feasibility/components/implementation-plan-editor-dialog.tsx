// Edits one implementation-plan dashboard section while keeping changes local until the page-level save.
import { Alert } from '../../../shared/ui/alert';
import { Card } from "../../../shared/ui/card";
import { Textarea } from '../../../shared/ui/textarea';
import { useEffect, useId, useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  FeasibilityBenefitEstimate,
  FeasibilityCandidateImplementation,
  FeasibilityContentProvenance,
  FeasibilityCostEstimate,
  FeasibilityImplementationPlan,
  FeasibilityInputs,
  FeasibilityMoneyItem,
} from "@uml-platform/contracts";
import type { RequirementRule } from "../../../entities/requirement-rule/model";
import { Button } from "../../../shared/ui/button";
import { Checkbox } from "../../../shared/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/dialog";
import { Input } from "../../../shared/ui/input";
import { SelectControl } from "../../../shared/ui/select";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "../../../shared/ui/field";
import { cn } from "../../../shared/ui/utils";
import {
  FEASIBILITY_INPUT_FIELDS,
  filterApplicableAbsenceDeclarations,
  joinLines,
  splitLines,
  validateImplementationDraft,
  type PlanValidationCode,
} from "../lib/implementation-plan-view-model";

export type ImplementationSectionId =
  | "overview"
  | "candidates"
  | "technical"
  | "timeline"
  | "costs"
  | "risks"
  | "verdicts"
  | "supplements";

type Props = {
  section: ImplementationSectionId | null;
  selectedCandidateId: string | null;
  plan: FeasibilityImplementationPlan;
  inputs: FeasibilityInputs;
  rules: RequirementRule[];
  onClose: () => void;
  onApply: (plan: FeasibilityImplementationPlan, inputs: FeasibilityInputs) => void;
};

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function TextareaField({ label, value, onChange, hint, className }: { label: string; value: string; onChange: (value: string) => void; hint?: string; className?: string }) {
  const id = useId();
  return (
    <Field className={cn("gap-1.5", className)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-24 resize-y font-normal leading-6"
      />
      {hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  );
}

function LinesField({ label, value, onChange }: { label: string; value: string[]; onChange: (value: string[]) => void }) {
  const { t } = useTranslation();
  return <TextareaField label={label} value={joinLines(value)} onChange={(next) => onChange(splitLines(next))} hint={t("feasibility.editor.lineHint")} />;
}

function SourceRuleField({ value, onChange, rules }: { value: string[]; onChange: (value: string[]) => void; rules: RequirementRule[] }) {
  const { t } = useTranslation();
  return (
    <fieldset className="rounded-lg border bg-muted/20 p-3">
      <legend className="px-1 text-xs font-medium">{t("feasibility.sourceRules")}</legend>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        {rules.map((rule) => {
          const checked = value.includes(rule.id);
          return (
            <label key={rule.id} className="flex cursor-pointer items-start gap-2 rounded-md p-2 text-xs hover:bg-accent/50">
              <Checkbox
                checked={checked}
                onCheckedChange={(next) => onChange(next ? [...value, rule.id] : value.filter((id) => id !== rule.id))}
              />
              <span><span className="font-mono font-medium text-primary">{rule.id}</span><span className="ml-1 text-muted-foreground">{rule.text}</span></span>
            </label>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t("feasibility.editor.sourceHint")}</p>
    </fieldset>
  );
}

function EditCard({ children, onRemove, removeLabel }: { children: ReactNode; onRemove?: () => void; removeLabel?: string }) {
  return (
    <Card className="gap-0 py-0 relative grid gap-3 p-4">
      {onRemove && (
        <Button type="button" variant="destructive" size="icon" className="absolute right-2 top-2" onClick={onRemove} aria-label={removeLabel}>
          <Trash2 className="size-4" />
        </Button>
      )}
      {children}
    </Card>
  );
}

function MoneyItemsForm({ title, addLabel, items, onChange }: { title: string; addLabel: string; items: FeasibilityMoneyItem[]; onChange: (items: FeasibilityMoneyItem[]) => void }) {
  const { t } = useTranslation();
  const update = (id: string, patch: Partial<FeasibilityMoneyItem>) => onChange(items.map((item) => item.id === id ? { ...item, ...patch } : item));
  return (
    <section className="grid gap-3 rounded-xl border bg-muted/15 p-4">
      <div className="flex items-center justify-between gap-3"><h4>{title}</h4><Button type="button" size="sm" variant="outline" onClick={() => onChange([...items, { id: makeId("money"), name: "", amount: null, frequency: "one-time", note: "" }])}><Plus className="size-4" />{addLabel}</Button></div>
      {items.map((item) => (
        <div key={item.id} className="grid gap-2 rounded-lg border bg-background p-3 md:grid-cols-[1fr_140px_140px_auto]">
          <Input aria-label={`${title}${t("feasibility.costs.itemName")}`} value={item.name} onChange={(event) => update(item.id, { name: event.target.value })} placeholder={t("feasibility.costs.itemName")} />
          <Input aria-label={`${title}${t("feasibility.costs.amount")}`} type="number" min="0" value={item.amount ?? ""} onChange={(event) => update(item.id, { amount: event.target.value === "" ? null : Number(event.target.value) })} placeholder={t("feasibility.costs.amount")} />
          <SelectControl aria-label={`${title}${t("feasibility.costs.frequency")}`} value={item.frequency} onValueChange={(frequency) => update(item.id, { frequency: frequency as FeasibilityMoneyItem["frequency"] })} options={["one-time", "monthly", "annual"].map((frequency) => ({ value: frequency, label: t(`feasibility.frequency.${frequency}`) }))} />
          <Button type="button" variant="destructive" size="icon" aria-label={`${t("feasibility.remove")} ${item.name}`} onClick={() => onChange(items.filter((current) => current.id !== item.id))}><Trash2 className="size-4" /></Button>
          <Input className="md:col-span-4" value={item.note} onChange={(event) => update(item.id, { note: event.target.value })} placeholder={t("feasibility.costs.note")} />
        </div>
      ))}
    </section>
  );
}

function ProvenanceField({ value, onChange }: { value: FeasibilityContentProvenance; onChange: (value: FeasibilityContentProvenance) => void }) {
  const { t } = useTranslation();
  return <SelectControl aria-label={t("feasibility.costs.provenance")} value={value} onValueChange={(next) => onChange(next as FeasibilityContentProvenance)} options={(["ai-estimate", "user-edited", "user-confirmed"] as const).map((provenance) => ({ value: provenance, label: t(`feasibility.provenance.${provenance}`) }))} />;
}

function CostEstimateForm({ items, rules, onChange }: { items: FeasibilityCostEstimate[]; rules: RequirementRule[]; onChange: (items: FeasibilityCostEstimate[]) => void }) {
  const { t } = useTranslation();
  const update = (id: string, patch: Partial<FeasibilityCostEstimate>) => onChange(items.map((item) => item.id === id ? { ...item, ...patch, provenance: patch.provenance ?? "user-edited" } : item));
  const updateRange = (item: FeasibilityCostEstimate, patch: Partial<FeasibilityCostEstimate["range"]>) => update(item.id, { range: { ...item.range, ...patch } });
  return <section className="grid gap-3 rounded-xl border bg-muted/15 p-4"><div className="flex items-center justify-between gap-3"><h4>{t("feasibility.costs.aiCostEstimates")}</h4><Button type="button" size="sm" variant="outline" onClick={() => onChange([...items, { id: makeId("cost"), name: "", category: "other-one-time", frequency: "one-time", range: { minimum: 0, maximum: 0, currency: "CNY", basis: "", confidence: "medium" }, note: "", sourceRequirementIds: [], assumption: "", provenance: "user-edited" }])}><Plus className="size-4" />{t("feasibility.costs.addAiCost")}</Button></div>{items.map((item) => <EditCard key={item.id} onRemove={() => onChange(items.filter((current) => current.id !== item.id))} removeLabel={`${t("feasibility.remove")} ${item.name}`}><div className="grid gap-3 md:grid-cols-2"><Input value={item.name} onChange={(event) => update(item.id, { name: event.target.value })} placeholder={t("feasibility.costs.itemName")} /><SelectControl value={item.category} onValueChange={(category) => update(item.id, { category: category as FeasibilityCostEstimate["category"] })} options={(["capital", "other-one-time", "recurring"] as const).map((category) => ({ value: category, label: t(`feasibility.costCategory.${category}`) }))} /></div><div className="grid gap-3 md:grid-cols-4"><Input type="number" min="0" value={item.range.minimum} onChange={(event) => updateRange(item, { minimum: Number(event.target.value) })} aria-label={t("feasibility.costs.minimum")} /><Input type="number" min="0" value={item.range.maximum} onChange={(event) => updateRange(item, { maximum: Number(event.target.value) })} aria-label={t("feasibility.costs.maximum")} /><Input value={item.range.currency} onChange={(event) => updateRange(item, { currency: event.target.value })} aria-label={t("feasibility.costs.currency")} /><SelectControl value={item.frequency} onValueChange={(frequency) => update(item.id, { frequency: frequency as FeasibilityCostEstimate["frequency"] })} options={(["one-time", "monthly", "annual"] as const).map((frequency) => ({ value: frequency, label: t(`feasibility.frequency.${frequency}`) }))} /></div><TextareaField label={t("feasibility.costs.basis")} value={item.range.basis} onChange={(basis) => updateRange(item, { basis })} /><div className="grid gap-3 md:grid-cols-2"><SelectControl value={item.range.confidence} onValueChange={(confidence) => updateRange(item, { confidence: confidence as FeasibilityCostEstimate["range"]["confidence"] })} options={(["low", "medium", "high"] as const).map((confidence) => ({ value: confidence, label: t(`feasibility.level.${confidence}`) }))} /><ProvenanceField value={item.provenance} onChange={(provenance) => update(item.id, { provenance })} /></div><SourceRuleField rules={rules} value={item.sourceRequirementIds} onChange={(sourceRequirementIds) => update(item.id, { sourceRequirementIds })} /><Input value={item.assumption} onChange={(event) => update(item.id, { assumption: event.target.value })} placeholder={t("feasibility.costs.assumption")} /></EditCard>)}</section>;
}

function BenefitEstimateForm({ items, rules, onChange }: { items: FeasibilityBenefitEstimate[]; rules: RequirementRule[]; onChange: (items: FeasibilityBenefitEstimate[]) => void }) {
  const { t } = useTranslation();
  const update = (id: string, patch: Partial<FeasibilityBenefitEstimate>) => onChange(items.map((item) => item.id === id ? { ...item, ...patch, provenance: patch.provenance ?? "user-edited" } : item));
  return <section className="grid gap-3 rounded-xl border bg-muted/15 p-4"><div className="flex items-center justify-between gap-3"><h4>{t("feasibility.costs.aiBenefitEstimates")}</h4><Button type="button" size="sm" variant="outline" onClick={() => onChange([...items, { id: makeId("benefit"), name: "", category: "recurring", frequency: "annual", range: { minimum: 0, maximum: 0, currency: "CNY", basis: "", confidence: "medium" }, outcome: "", sourceRequirementIds: [], assumption: "", provenance: "user-edited" }])}><Plus className="size-4" />{t("feasibility.costs.addAiBenefit")}</Button></div>{items.map((item) => <EditCard key={item.id} onRemove={() => onChange(items.filter((current) => current.id !== item.id))} removeLabel={`${t("feasibility.remove")} ${item.name}`}><div className="grid gap-3 md:grid-cols-3"><Input value={item.name} onChange={(event) => update(item.id, { name: event.target.value })} placeholder={t("feasibility.costs.itemName")} /><SelectControl value={item.category} onValueChange={(category) => update(item.id, { category: category as FeasibilityBenefitEstimate["category"], range: category === "intangible" ? null : item.range ?? { minimum: 0, maximum: 0, currency: "CNY", basis: "", confidence: "medium" } })} options={(["one-time", "recurring", "intangible"] as const).map((category) => ({ value: category, label: t(`feasibility.benefitCategory.${category}`) }))} /><SelectControl value={item.frequency} onValueChange={(frequency) => update(item.id, { frequency: frequency as FeasibilityBenefitEstimate["frequency"] })} options={(["one-time", "monthly", "annual"] as const).map((frequency) => ({ value: frequency, label: t(`feasibility.frequency.${frequency}`) }))} /></div>{item.range && <><div className="grid gap-3 md:grid-cols-4"><Input type="number" min="0" value={item.range.minimum} onChange={(event) => update(item.id, { range: { ...item.range!, minimum: Number(event.target.value) } })} aria-label={t("feasibility.costs.minimum")} /><Input type="number" min="0" value={item.range.maximum} onChange={(event) => update(item.id, { range: { ...item.range!, maximum: Number(event.target.value) } })} aria-label={t("feasibility.costs.maximum")} /><Input value={item.range.currency} onChange={(event) => update(item.id, { range: { ...item.range!, currency: event.target.value } })} aria-label={t("feasibility.costs.currency")} /><SelectControl value={item.range.confidence} onValueChange={(confidence) => update(item.id, { range: { ...item.range!, confidence: confidence as "low" | "medium" | "high" } })} options={(["low", "medium", "high"] as const).map((confidence) => ({ value: confidence, label: t(`feasibility.level.${confidence}`) }))} /></div><TextareaField label={t("feasibility.costs.basis")} value={item.range.basis} onChange={(basis) => update(item.id, { range: { ...item.range!, basis } })} /></>}<TextareaField label={t("feasibility.costs.outcome")} value={item.outcome} onChange={(outcome) => update(item.id, { outcome })} /><ProvenanceField value={item.provenance} onChange={(provenance) => update(item.id, { provenance })} /><SourceRuleField rules={rules} value={item.sourceRequirementIds} onChange={(sourceRequirementIds) => update(item.id, { sourceRequirementIds })} /><Input value={item.assumption} onChange={(event) => update(item.id, { assumption: event.target.value })} placeholder={t("feasibility.costs.assumption")} /></EditCard>)}</section>;
}

export function ImplementationPlanEditorDialog({ section, selectedCandidateId, plan, inputs, rules, onClose, onApply }: Props) {
  const { t } = useTranslation();
  const uid = useId();
  const [draftPlan, setDraftPlan] = useState(plan);
  const [draftInputs, setDraftInputs] = useState(inputs);
  const [errors, setErrors] = useState<PlanValidationCode[]>([]);

  useEffect(() => {
    if (!section) return;
    setDraftPlan(structuredClone(plan));
    setDraftInputs(structuredClone(inputs));
    setErrors([]);
  }, [inputs, plan, section, selectedCandidateId]);

  const activeCandidateId = draftPlan.candidates.some((candidate) => candidate.id === selectedCandidateId)
    ? selectedCandidateId
    : draftPlan.recommendedCandidateId;
  const implementation = draftPlan.candidates.find((candidate) => candidate.id === activeCandidateId)?.implementation ?? null;
  const recommendedImplementation = draftPlan.candidates.find((candidate) => candidate.id === draftPlan.recommendedCandidateId)?.implementation ?? null;
  const updateCandidateImplementation = (
    candidateId: string | null,
    next: FeasibilityCandidateImplementation,
  ) => {
    if (!candidateId) return;
    setDraftPlan((current) => ({
      ...current,
      candidates: current.candidates.map((candidate) => candidate.id === candidateId
        ? { ...candidate, implementation: next }
        : candidate),
    }));
  };
  const updateImplementation = (next: FeasibilityCandidateImplementation) =>
    updateCandidateImplementation(activeCandidateId, next);
  const removeCandidate = (candidateId: string) => setDraftPlan((current) => {
    const candidates = current.candidates.filter((candidate) => candidate.id !== candidateId);
    return {
      ...current,
      candidates,
      recommendedCandidateId: current.recommendedCandidateId === candidateId
        ? candidates[0]?.id ?? current.recommendedCandidateId
        : current.recommendedCandidateId,
    };
  });

  const title = section ? t(`feasibility.nav.${section}`) : "";
  const apply = () => {
    const planContentChanged = JSON.stringify(plan) !== JSON.stringify(draftPlan);
    const nextPlan = structuredClone(draftPlan);
    const edited = (value: FeasibilityContentProvenance) => value === "user-confirmed" ? value : "user-edited" as const;
    nextPlan.candidates = nextPlan.candidates.map((candidate) => {
      const persisted = plan.candidates.find((item) => item.id === candidate.id);
      if (persisted && JSON.stringify(persisted) === JSON.stringify(candidate)) return candidate;
      let nextImplementation = candidate.implementation
        ? { ...candidate.implementation, provenance: edited(candidate.implementation.provenance) }
        : null;
      if (nextImplementation && section === "technical") {
        nextImplementation = {
          ...nextImplementation,
          architecture: { ...nextImplementation.architecture, modules: nextImplementation.architecture.modules.map((item) => ({ ...item, provenance: edited(item.provenance) })) },
          dataStrategy: { ...nextImplementation.dataStrategy, provenance: edited(nextImplementation.dataStrategy.provenance) },
          integrations: nextImplementation.integrations.map((item) => ({ ...item, provenance: edited(item.provenance) })),
          deploymentAndOperations: { ...nextImplementation.deploymentAndOperations, provenance: edited(nextImplementation.deploymentAndOperations.provenance) },
          securityAndCompliance: { ...nextImplementation.securityAndCompliance, provenance: edited(nextImplementation.securityAndCompliance.provenance) },
        };
      } else if (nextImplementation && section === "timeline") {
        nextImplementation = { ...nextImplementation, milestones: nextImplementation.milestones.map((item) => ({ ...item, provenance: edited(item.provenance) })) };
      } else if (nextImplementation && section === "costs") {
        nextImplementation = {
          ...nextImplementation,
          analysisPeriodAssumption: nextImplementation.analysisPeriodAssumption ? { ...nextImplementation.analysisPeriodAssumption, provenance: edited(nextImplementation.analysisPeriodAssumption.provenance) } : null,
          costEstimates: nextImplementation.costEstimates.map((item) => ({ ...item, provenance: edited(item.provenance) })),
          benefitEstimates: nextImplementation.benefitEstimates.map((item) => ({ ...item, provenance: edited(item.provenance) })),
          absenceDeclarations: filterApplicableAbsenceDeclarations(nextImplementation).map((item) => ({ ...item, provenance: edited(item.provenance) })),
        };
      } else if (nextImplementation && section === "risks") {
        nextImplementation = { ...nextImplementation, risks: nextImplementation.risks.map((item) => ({ ...item, provenance: edited(item.provenance) })) };
      } else if (nextImplementation && section === "verdicts") {
        nextImplementation = { ...nextImplementation, verdicts: nextImplementation.verdicts.map((item) => ({ ...item, provenance: edited(item.provenance) })) };
      }
      return {
        ...candidate,
        provenance: edited(candidate.provenance),
        implementation: nextImplementation,
      };
    });
    const validation = validateImplementationDraft(nextPlan, rules.map((rule) => rule.id));
    const pendingLegacyCandidate = draftPlan.candidates.some((candidate) => !candidate.implementation);
    const blocking = validation.filter((code) =>
      code !== "incompleteCandidateImplementations"
      && !(code === "invalidVerdicts" && pendingLegacyCandidate)
      && !(!planContentChanged && ["missingEstimates", "invalidRiskCount", "missingAbsenceReason", "missingSources"].includes(code)),
    );
    if (blocking.length) {
      setErrors(blocking);
      return;
    }
    onApply(nextPlan, draftInputs);
    onClose();
  };

  return (
    <Dialog open={Boolean(section)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent data-form-layout="6" className="flex max-h-[min(90vh,900px)] max-w-3xl flex-col gap-0 overflow-hidden p-0 max-sm:inset-0 max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none">
        <DialogHeader className="border-b px-6 py-5 pr-14">
          <DialogTitle>{t("feasibility.editor.title", { section: title })}</DialogTitle>
          <DialogDescription>{t("feasibility.editor.description")}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {section === "overview" && (
            <FieldGroup className="gap-4">
              <TextareaField label={t("feasibility.candidate.summary")} value={draftPlan.overview} onChange={(overview) => setDraftPlan({ ...draftPlan, overview })} />
              <div className="grid gap-4 md:grid-cols-2">
                <Field className="gap-1.5"><FieldLabel htmlFor={`${uid}-recommended`}>{t("feasibility.overview.recommended")}</FieldLabel><SelectControl id={`${uid}-recommended`} value={draftPlan.recommendedCandidateId} onValueChange={(recommendedCandidateId) => setDraftPlan({ ...draftPlan, recommendedCandidateId })} options={draftPlan.candidates.map((candidate) => ({ value: candidate.id, label: candidate.name }))} /></Field>
                {recommendedImplementation && <Field className="gap-1.5"><FieldLabel htmlFor={`${uid}-decision`}>{t("feasibility.overview.decision")}</FieldLabel><SelectControl id={`${uid}-decision`} value={recommendedImplementation.decision} onValueChange={(decision) => updateCandidateImplementation(draftPlan.recommendedCandidateId, { ...recommendedImplementation, decision: decision as FeasibilityCandidateImplementation["decision"] })} options={["go", "conditional-go", "no-go"].map((decision) => ({ value: decision, label: t(`feasibility.decision.${decision}`) }))} /></Field>}
              </div>
              <TextareaField label={t("feasibility.overview.rationale")} value={draftPlan.recommendationRationale} onChange={(recommendationRationale) => setDraftPlan({ ...draftPlan, recommendationRationale })} />
              {recommendedImplementation && <LinesField label={t("feasibility.overview.preconditions")} value={recommendedImplementation.preconditions} onChange={(preconditions) => updateCandidateImplementation(draftPlan.recommendedCandidateId, { ...recommendedImplementation, preconditions })} />}
            </FieldGroup>
          )}

          {section === "candidates" && (
            <FieldGroup className="gap-4">
              {draftPlan.candidates.map((candidate, index) => (
                <EditCard key={candidate.id} onRemove={draftPlan.candidates.length > 1 ? () => removeCandidate(candidate.id) : undefined} removeLabel={`${t("feasibility.remove")} ${candidate.name}`}>
                  <h4>{t("feasibility.candidate.option", { index: index + 1 })}</h4>
                  <div className="grid gap-3 md:grid-cols-2"><Field className="gap-1.5"><FieldLabel htmlFor={`${uid}-candidate-${candidate.id}-name`}>{t("feasibility.candidate.name")}</FieldLabel><Input id={`${uid}-candidate-${candidate.id}-name`} value={candidate.name} onChange={(event) => setDraftPlan({ ...draftPlan, candidates: draftPlan.candidates.map((item) => item.id === candidate.id ? { ...item, name: event.target.value } : item) })} /></Field><Field className="gap-1.5"><FieldLabel htmlFor={`${uid}-candidate-${candidate.id}-id`}>{t("feasibility.candidate.id")}</FieldLabel><Input id={`${uid}-candidate-${candidate.id}-id`} value={candidate.id} disabled /></Field></div>
                  <TextareaField label={t("feasibility.candidate.summary")} value={candidate.summary} onChange={(summary) => setDraftPlan({ ...draftPlan, candidates: draftPlan.candidates.map((item) => item.id === candidate.id ? { ...item, summary } : item) })} />
                  <div className="grid gap-3 md:grid-cols-2"><LinesField label={t("feasibility.candidate.advantages")} value={candidate.advantages} onChange={(advantages) => setDraftPlan({ ...draftPlan, candidates: draftPlan.candidates.map((item) => item.id === candidate.id ? { ...item, advantages } : item) })} /><LinesField label={t("feasibility.candidate.disadvantages")} value={candidate.disadvantages} onChange={(disadvantages) => setDraftPlan({ ...draftPlan, candidates: draftPlan.candidates.map((item) => item.id === candidate.id ? { ...item, disadvantages } : item) })} /></div>
                  <div className="grid gap-3 md:grid-cols-2"><Field className="gap-1.5"><FieldLabel htmlFor={`${uid}-candidate-${candidate.id}-cost`}>{t("feasibility.candidate.estimatedCost")}</FieldLabel><Input id={`${uid}-candidate-${candidate.id}-cost`} value={candidate.estimatedCost} onChange={(event) => setDraftPlan({ ...draftPlan, candidates: draftPlan.candidates.map((item) => item.id === candidate.id ? { ...item, estimatedCost: event.target.value } : item) })} /></Field><Field className="gap-1.5"><FieldLabel htmlFor={`${uid}-candidate-${candidate.id}-schedule`}>{t("feasibility.candidate.estimatedSchedule")}</FieldLabel><Input id={`${uid}-candidate-${candidate.id}-schedule`} value={candidate.estimatedSchedule} onChange={(event) => setDraftPlan({ ...draftPlan, candidates: draftPlan.candidates.map((item) => item.id === candidate.id ? { ...item, estimatedSchedule: event.target.value } : item) })} /></Field></div>
                  <SourceRuleField rules={rules} value={candidate.sourceRequirementIds} onChange={(sourceRequirementIds) => setDraftPlan({ ...draftPlan, candidates: draftPlan.candidates.map((item) => item.id === candidate.id ? { ...item, sourceRequirementIds } : item) })} />
                  <Input value={candidate.assumption} onChange={(event) => setDraftPlan({ ...draftPlan, candidates: draftPlan.candidates.map((item) => item.id === candidate.id ? { ...item, assumption: event.target.value } : item) })} placeholder={t("feasibility.costs.assumption")} />
                </EditCard>
              ))}
              <Button type="button" variant="outline" disabled={draftPlan.candidates.length >= 3} onClick={() => setDraftPlan({ ...draftPlan, candidates: [...draftPlan.candidates, { id: makeId("option"), name: "", summary: "", advantages: [], disadvantages: [], estimatedCost: "", estimatedSchedule: "", sourceRequirementIds: rules[0] ? [rules[0].id] : [], assumption: "", provenance: "user-edited", implementation: null }] })}><Plus className="size-4" />{t("feasibility.candidate.add")}</Button>
              {draftPlan.candidates.length < 2 && <TextareaField label={t("feasibility.candidate.reducedReason")} value={draftPlan.reducedCandidateReason} onChange={(reducedCandidateReason) => setDraftPlan({ ...draftPlan, reducedCandidateReason })} />}
            </FieldGroup>
          )}

          {section === "technical" && implementation && (
            <FieldGroup className="gap-5">
              <TextareaField label={t("feasibility.technical.architecture")} value={implementation.architecture.summary} onChange={(summary) => updateImplementation({ ...implementation, architecture: { ...implementation.architecture, summary } })} />
              <h4>{t("feasibility.technical.modules")}</h4>
              {implementation.architecture.modules.map((module) => <EditCard key={module.id} onRemove={implementation.architecture.modules.length > 1 ? () => updateImplementation({ ...implementation, architecture: { ...implementation.architecture, modules: implementation.architecture.modules.filter((item) => item.id !== module.id) } }) : undefined} removeLabel={`${t("feasibility.remove")} ${module.name}`}><Input value={module.name} onChange={(event) => updateImplementation({ ...implementation, architecture: { ...implementation.architecture, modules: implementation.architecture.modules.map((item) => item.id === module.id ? { ...item, name: event.target.value } : item) } })} /><TextareaField label={t("feasibility.technical.responsibility")} value={module.responsibility} onChange={(responsibility) => updateImplementation({ ...implementation, architecture: { ...implementation.architecture, modules: implementation.architecture.modules.map((item) => item.id === module.id ? { ...item, responsibility } : item) } })} /><SourceRuleField rules={rules} value={module.sourceRequirementIds} onChange={(sourceRequirementIds) => updateImplementation({ ...implementation, architecture: { ...implementation.architecture, modules: implementation.architecture.modules.map((item) => item.id === module.id ? { ...item, sourceRequirementIds } : item) } })} /><Input value={module.assumption} onChange={(event) => updateImplementation({ ...implementation, architecture: { ...implementation.architecture, modules: implementation.architecture.modules.map((item) => item.id === module.id ? { ...item, assumption: event.target.value } : item) } })} placeholder={t("feasibility.costs.assumption")} /></EditCard>)}
              <Button type="button" variant="outline" onClick={() => updateImplementation({ ...implementation, architecture: { ...implementation.architecture, modules: [...implementation.architecture.modules, { id: makeId("module"), name: "", responsibility: "", sourceRequirementIds: rules[0] ? [rules[0].id] : [], assumption: "", provenance: "user-edited" }] } })}><Plus className="size-4" />{t("feasibility.add")} {t("feasibility.technical.modules")}</Button>
              <h4>{t("feasibility.technical.integrations")}</h4>
              {implementation.integrations.map((integration) => <EditCard key={integration.id} onRemove={() => updateImplementation({ ...implementation, integrations: implementation.integrations.filter((item) => item.id !== integration.id) })} removeLabel={`${t("feasibility.remove")} ${integration.name}`}><Input value={integration.name} onChange={(event) => updateImplementation({ ...implementation, integrations: implementation.integrations.map((item) => item.id === integration.id ? { ...item, name: event.target.value } : item) })} /><TextareaField label={t("feasibility.technical.responsibility")} value={integration.responsibility} onChange={(responsibility) => updateImplementation({ ...implementation, integrations: implementation.integrations.map((item) => item.id === integration.id ? { ...item, responsibility } : item) })} /><SourceRuleField rules={rules} value={integration.sourceRequirementIds} onChange={(sourceRequirementIds) => updateImplementation({ ...implementation, integrations: implementation.integrations.map((item) => item.id === integration.id ? { ...item, sourceRequirementIds } : item) })} /><Input value={integration.assumption} onChange={(event) => updateImplementation({ ...implementation, integrations: implementation.integrations.map((item) => item.id === integration.id ? { ...item, assumption: event.target.value } : item) })} placeholder={t("feasibility.costs.assumption")} /></EditCard>)}
              <Button type="button" variant="outline" onClick={() => updateImplementation({ ...implementation, integrations: [...implementation.integrations, { id: makeId("integration"), name: "", contextExternalSystemId: null, responsibility: "", sourceRequirementIds: rules[0] ? [rules[0].id] : [], assumption: "", provenance: "user-edited" }] })}><Plus className="size-4" />{t("feasibility.add")} {t("feasibility.technical.integrations")}</Button>
              <TextareaField label={t("feasibility.technical.integrationRationale")} value={implementation.integrationRationale} onChange={(integrationRationale) => updateImplementation({ ...implementation, integrationRationale })} />
              <TextareaField label={t("feasibility.technical.data")} value={implementation.dataStrategy.summary} onChange={(summary) => updateImplementation({ ...implementation, dataStrategy: { ...implementation.dataStrategy, summary } })} />
              <SourceRuleField rules={rules} value={implementation.dataStrategy.sourceRequirementIds} onChange={(sourceRequirementIds) => updateImplementation({ ...implementation, dataStrategy: { ...implementation.dataStrategy, sourceRequirementIds } })} />
              <Input value={implementation.dataStrategy.assumption} onChange={(event) => updateImplementation({ ...implementation, dataStrategy: { ...implementation.dataStrategy, assumption: event.target.value } })} placeholder={t("feasibility.costs.assumption")} />
              <TextareaField label={t("feasibility.technical.deployment")} value={implementation.deploymentAndOperations.summary} onChange={(summary) => updateImplementation({ ...implementation, deploymentAndOperations: { ...implementation.deploymentAndOperations, summary } })} />
              <SourceRuleField rules={rules} value={implementation.deploymentAndOperations.sourceRequirementIds} onChange={(sourceRequirementIds) => updateImplementation({ ...implementation, deploymentAndOperations: { ...implementation.deploymentAndOperations, sourceRequirementIds } })} />
              <Input value={implementation.deploymentAndOperations.assumption} onChange={(event) => updateImplementation({ ...implementation, deploymentAndOperations: { ...implementation.deploymentAndOperations, assumption: event.target.value } })} placeholder={t("feasibility.costs.assumption")} />
              <TextareaField label={t("feasibility.technical.security")} value={implementation.securityAndCompliance.summary} onChange={(summary) => updateImplementation({ ...implementation, securityAndCompliance: { ...implementation.securityAndCompliance, summary } })} />
              <SourceRuleField rules={rules} value={implementation.securityAndCompliance.sourceRequirementIds} onChange={(sourceRequirementIds) => updateImplementation({ ...implementation, securityAndCompliance: { ...implementation.securityAndCompliance, sourceRequirementIds } })} />
              <Input value={implementation.securityAndCompliance.assumption} onChange={(event) => updateImplementation({ ...implementation, securityAndCompliance: { ...implementation.securityAndCompliance, assumption: event.target.value } })} placeholder={t("feasibility.costs.assumption")} />
            </FieldGroup>
          )}

          {section === "timeline" && implementation && <FieldGroup className="gap-4">{implementation.milestones.map((milestone, index) => <EditCard key={milestone.id} onRemove={implementation.milestones.length > 1 ? () => updateImplementation({ ...implementation, milestones: implementation.milestones.filter((item) => item.id !== milestone.id) }) : undefined} removeLabel={`${t("feasibility.remove")} ${milestone.name}`}><h4>{index + 1}. {milestone.name || t("feasibility.timeline.title")}</h4><div className="grid gap-3 md:grid-cols-2"><Input value={milestone.name} onChange={(event) => updateImplementation({ ...implementation, milestones: implementation.milestones.map((item) => item.id === milestone.id ? { ...item, name: event.target.value } : item) })} /><Input value={milestone.timeframe} onChange={(event) => updateImplementation({ ...implementation, milestones: implementation.milestones.map((item) => item.id === milestone.id ? { ...item, timeframe: event.target.value } : item) })} placeholder={t("feasibility.timeline.timeframe")} /></div><div className="grid gap-3 md:grid-cols-2"><LinesField label={t("feasibility.timeline.deliverables")} value={milestone.deliverables} onChange={(deliverables) => updateImplementation({ ...implementation, milestones: implementation.milestones.map((item) => item.id === milestone.id ? { ...item, deliverables } : item) })} /><LinesField label={t("feasibility.timeline.roles")} value={milestone.roles} onChange={(roles) => updateImplementation({ ...implementation, milestones: implementation.milestones.map((item) => item.id === milestone.id ? { ...item, roles } : item) })} /><LinesField label={t("feasibility.timeline.dependencies")} value={milestone.dependencies} onChange={(dependencies) => updateImplementation({ ...implementation, milestones: implementation.milestones.map((item) => item.id === milestone.id ? { ...item, dependencies } : item) })} /><LinesField label={t("feasibility.timeline.acceptance")} value={milestone.acceptanceCriteria} onChange={(acceptanceCriteria) => updateImplementation({ ...implementation, milestones: implementation.milestones.map((item) => item.id === milestone.id ? { ...item, acceptanceCriteria } : item) })} /></div><TextareaField label={t("feasibility.timeline.dependencyRationale")} value={milestone.dependencyRationale} onChange={(dependencyRationale) => updateImplementation({ ...implementation, milestones: implementation.milestones.map((item) => item.id === milestone.id ? { ...item, dependencyRationale } : item) })} /><SourceRuleField rules={rules} value={milestone.sourceRequirementIds} onChange={(sourceRequirementIds) => updateImplementation({ ...implementation, milestones: implementation.milestones.map((item) => item.id === milestone.id ? { ...item, sourceRequirementIds } : item) })} /><Input value={milestone.assumption} onChange={(event) => updateImplementation({ ...implementation, milestones: implementation.milestones.map((item) => item.id === milestone.id ? { ...item, assumption: event.target.value } : item) })} placeholder={t("feasibility.costs.assumption")} /></EditCard>)}<Button type="button" variant="outline" onClick={() => updateImplementation({ ...implementation, milestones: [...implementation.milestones, { id: makeId("milestone"), name: "", timeframe: "", deliverables: [], roles: [], dependencies: [], dependencyRationale: "", acceptanceCriteria: [], sourceRequirementIds: rules[0] ? [rules[0].id] : [], assumption: "", provenance: "user-edited" }] })}><Plus className="size-4" />{t("feasibility.timeline.add")}</Button></FieldGroup>}

          {section === "costs" && implementation && <FieldGroup className="gap-5">
            <section className="grid gap-3 rounded-xl border bg-muted/15 p-4"><h4>{t("feasibility.costs.analysisPeriodTitle")}</h4>{implementation.analysisPeriodAssumption ? <><Input type="number" min="0.1" step="0.1" value={implementation.analysisPeriodAssumption.years} onChange={(event) => updateImplementation({ ...implementation, analysisPeriodAssumption: { ...implementation.analysisPeriodAssumption!, years: Number(event.target.value) } })} aria-label={t("feasibility.fields.analysisYears")} /><TextareaField label={t("feasibility.costs.basis")} value={implementation.analysisPeriodAssumption.basis} onChange={(basis) => updateImplementation({ ...implementation, analysisPeriodAssumption: { ...implementation.analysisPeriodAssumption!, basis } })} /><ProvenanceField value={implementation.analysisPeriodAssumption.provenance} onChange={(provenance) => updateImplementation({ ...implementation, analysisPeriodAssumption: { ...implementation.analysisPeriodAssumption!, provenance } })} /></> : <p className="text-sm text-muted-foreground">{t("feasibility.notProvided")}</p>}</section>
            <CostEstimateForm items={implementation.costEstimates} rules={rules} onChange={(costEstimates) => updateImplementation({ ...implementation, costEstimates })} />
            <BenefitEstimateForm items={implementation.benefitEstimates} rules={rules} onChange={(benefitEstimates) => updateImplementation({ ...implementation, benefitEstimates })} />
            {!!filterApplicableAbsenceDeclarations(implementation).length && <section className="grid gap-3 rounded-xl border bg-muted/15 p-4"><h4>{t("feasibility.costs.notApplicable")}</h4>{filterApplicableAbsenceDeclarations(implementation).map((declaration) => <EditCard key={declaration.scope}><p className="text-sm font-medium">{t(`feasibility.absenceScope.${declaration.scope}`)}</p><TextareaField label={t("feasibility.costs.reason")} value={declaration.reason} onChange={(reason) => updateImplementation({ ...implementation, absenceDeclarations: implementation.absenceDeclarations.map((item) => item.scope === declaration.scope ? { ...item, reason } : item) })} /><ProvenanceField value={declaration.provenance} onChange={(provenance) => updateImplementation({ ...implementation, absenceDeclarations: implementation.absenceDeclarations.map((item) => item.scope === declaration.scope ? { ...item, provenance } : item) })} /></EditCard>)}</section>}
            <MoneyItemsForm title={t("feasibility.costs.confirmedCosts")} addLabel={t("feasibility.costs.addCost")} items={draftInputs.costItems} onChange={(costItems) => setDraftInputs({ ...draftInputs, costItems })} />
            <MoneyItemsForm title={t("feasibility.costs.confirmedBenefits")} addLabel={t("feasibility.costs.addBenefit")} items={draftInputs.benefitItems} onChange={(benefitItems) => setDraftInputs({ ...draftInputs, benefitItems })} />
          </FieldGroup>}

          {section === "risks" && implementation && <FieldGroup className="gap-4">{implementation.risks.map((risk) => <EditCard key={risk.id} onRemove={() => updateImplementation({ ...implementation, risks: implementation.risks.filter((item) => item.id !== risk.id) })} removeLabel={`${t("feasibility.remove")} ${risk.risk}`}><TextareaField label={t("feasibility.risks.risk")} value={risk.risk} onChange={(value) => updateImplementation({ ...implementation, risks: implementation.risks.map((item) => item.id === risk.id ? { ...item, risk: value } : item) })} /><div className="grid gap-3 md:grid-cols-3"><Field className="gap-1.5"><FieldLabel htmlFor={`${uid}-risk-${risk.id}-probability`}>{t("feasibility.risks.probability")}</FieldLabel><SelectControl id={`${uid}-risk-${risk.id}-probability`} value={risk.probability} onValueChange={(probability) => updateImplementation({ ...implementation, risks: implementation.risks.map((item) => item.id === risk.id ? { ...item, probability: probability as typeof risk.probability } : item) })} options={["low", "medium", "high"].map((level) => ({ value: level, label: t(`feasibility.level.${level}`) }))} /></Field><Field className="gap-1.5"><FieldLabel htmlFor={`${uid}-risk-${risk.id}-impact`}>{t("feasibility.risks.impact")}</FieldLabel><SelectControl id={`${uid}-risk-${risk.id}-impact`} value={risk.impact} onValueChange={(impact) => updateImplementation({ ...implementation, risks: implementation.risks.map((item) => item.id === risk.id ? { ...item, impact: impact as typeof risk.impact } : item) })} options={["low", "medium", "high"].map((level) => ({ value: level, label: t(`feasibility.level.${level}`) }))} /></Field><Field className="gap-1.5"><FieldLabel htmlFor={`${uid}-risk-${risk.id}-owner`}>{t("feasibility.risks.owner")}</FieldLabel><Input id={`${uid}-risk-${risk.id}-owner`} value={risk.owner} onChange={(event) => updateImplementation({ ...implementation, risks: implementation.risks.map((item) => item.id === risk.id ? { ...item, owner: event.target.value } : item) })} /></Field></div><TextareaField label={t("feasibility.risks.mitigation")} value={risk.mitigation} onChange={(mitigation) => updateImplementation({ ...implementation, risks: implementation.risks.map((item) => item.id === risk.id ? { ...item, mitigation } : item) })} /><SourceRuleField rules={rules} value={risk.sourceRequirementIds} onChange={(sourceRequirementIds) => updateImplementation({ ...implementation, risks: implementation.risks.map((item) => item.id === risk.id ? { ...item, sourceRequirementIds } : item) })} /><Input value={risk.assumption} onChange={(event) => updateImplementation({ ...implementation, risks: implementation.risks.map((item) => item.id === risk.id ? { ...item, assumption: event.target.value } : item) })} placeholder={t("feasibility.costs.assumption")} /><ProvenanceField value={risk.provenance} onChange={(provenance) => updateImplementation({ ...implementation, risks: implementation.risks.map((item) => item.id === risk.id ? { ...item, provenance } : item) })} /></EditCard>)}<Button type="button" variant="outline" disabled={implementation.risks.length >= 5} onClick={() => updateImplementation({ ...implementation, risks: [...implementation.risks, { id: makeId("risk"), risk: "", probability: "medium", impact: "medium", mitigation: "", owner: "待确认", sourceRequirementIds: rules[0] ? [rules[0].id] : [], assumption: "", provenance: "user-edited" }] })}><Plus className="size-4" />{t("feasibility.risks.add")}</Button></FieldGroup>}

          {section === "verdicts" && implementation && <FieldGroup className="gap-4"><div className="grid gap-4 md:grid-cols-2"><Field className="gap-1.5"><FieldLabel htmlFor={`${uid}-verdict-decision`}>{t("feasibility.overview.decision")}</FieldLabel><SelectControl id={`${uid}-verdict-decision`} value={implementation.decision} onValueChange={(decision) => updateImplementation({ ...implementation, decision: decision as FeasibilityCandidateImplementation["decision"] })} options={["go", "conditional-go", "no-go"].map((decision) => ({ value: decision, label: t(`feasibility.decision.${decision}`) }))} /></Field><LinesField label={t("feasibility.overview.preconditions")} value={implementation.preconditions} onChange={(preconditions) => updateImplementation({ ...implementation, preconditions })} /></div><div className="grid gap-4 md:grid-cols-2">{implementation.verdicts.map((verdict) => <EditCard key={verdict.category}><h4>{t(`feasibility.category.${verdict.category}`)}</h4><SelectControl value={verdict.verdict} onValueChange={(value) => updateImplementation({ ...implementation, verdicts: implementation.verdicts.map((item) => item.category === verdict.category ? { ...item, verdict: value as typeof verdict.verdict } : item) })} options={["feasible", "conditional", "not-feasible", "unknown"].map((value) => ({ value, label: t(`feasibility.verdict.${value}`) }))} /><TextareaField label={t("feasibility.verdicts.rationale")} value={verdict.rationale} onChange={(rationale) => updateImplementation({ ...implementation, verdicts: implementation.verdicts.map((item) => item.category === verdict.category ? { ...item, rationale } : item) })} /><ProvenanceField value={verdict.provenance} onChange={(provenance) => updateImplementation({ ...implementation, verdicts: implementation.verdicts.map((item) => item.category === verdict.category ? { ...item, provenance } : item) })} /></EditCard>)}</div></FieldGroup>}

          {section === "supplements" && <FieldGroup className="gap-6">{(["cover", "facts"] as const).map((group) => <section key={group}><h4 className="mb-3">{t(`feasibility.supplements.${group}`)}</h4><div className="grid gap-3 md:grid-cols-2">{FEASIBILITY_INPUT_FIELDS.filter((field) => field.group === group).map((field) => { const value = draftInputs[field.key]; return <Field key={field.key} className="gap-1.5"><FieldLabel htmlFor={`${uid}-input-${field.key}`}>{t(`feasibility.fields.${field.key}`)}</FieldLabel><Input id={`${uid}-input-${field.key}`} type={field.type ?? "text"} value={typeof value === "number" ? value : typeof value === "string" ? value : ""} placeholder={t("feasibility.notProvided")} onChange={(event) => { const raw = event.target.value; setDraftInputs({ ...draftInputs, [field.key]: field.type === "number" ? (raw === "" ? null : Number(raw)) : raw }); }} /></Field>; })}</div></section>)}</FieldGroup>}

          {errors.length > 0 && <Alert variant="destructive" role="alert" className="mt-5 border p-3 text-sm"><ul className="list-disc space-y-1 pl-5">{errors.map((error) => <li key={error}>{t(`feasibility.editor.${error}`)}</li>)}</ul></Alert>}
        </div>
        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          <Button type="button" variant="outline" onClick={onClose}>{t("feasibility.cancel")}</Button>
          <Button type="button" onClick={apply}>{t("feasibility.apply")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
