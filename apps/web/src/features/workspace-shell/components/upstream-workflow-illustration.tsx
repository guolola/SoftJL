// Shows how a card's direct upstream inputs converge through the platform logo into its target artifact.
import type { CSSProperties } from "react";
import { type RequirementRule } from "@uml-platform/contracts";
import type { LucideIcon } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { categoryChipTone } from "../../../shared/ui/category-tones";
import { ProductLogo } from "../../../shared/ui/product-logo";
import { cn } from "../../../shared/ui/utils";
import {
  directUpstreamInputs,
  upstreamRuleNodes,
  upstreamInputColorIndex,
  upstreamInputIcon,
  upstreamInputKey,
  upstreamInputLabel,
  type UpstreamInput,
  type UpstreamInputState,
  type UpstreamStage,
  type UpstreamStageTarget,
} from "../lib/upstream-dependencies";

// Desktop geometry is fixed so connector endpoints line up with node centers without measuring the DOM.
const NODE_HEIGHT = 40;
const NODE_GAP = 8;
const LOGO_SIZE = 64;
const CONVERGE_WIDTH = 208;
const OUTPUT_WIDTH = 144;

const STATE_TONE: Record<UpstreamInputState, { badge: string; stroke: string }> = {
  ready: { badge: "bg-success/10 text-success", stroke: "stroke-primary/45" },
  stale: { badge: "bg-warning/10 text-warning", stroke: "stroke-warning/70" },
  missing: { badge: "bg-destructive/10 text-destructive", stroke: "stroke-muted-foreground/35" },
  planned: { badge: "bg-primary/10 text-primary", stroke: "stroke-primary/45" },
  running: { badge: "bg-primary/10 text-primary", stroke: "stroke-primary/70" },
};
// Optional inputs never block generation, so their absence stays neutral.
const OPTIONAL_MISSING_TONE = { badge: "bg-muted text-muted-foreground", stroke: "stroke-muted-foreground/30" };

type UpstreamWorkflowIllustrationProps<S extends UpstreamStage> = {
  id: string;
  stage: S;
  target: UpstreamStageTarget[S];
  targetLabel: string;
  targetEnglish?: string;
  targetIcon: LucideIcon;
  targetColorIndex: number;
  /** Tooltip on the target node, e.g. the localized source summary. */
  targetHint?: string;
  /** Candidate rules before generation or evidenced references from the current model. */
  rules?: readonly RequirementRule[];
  ruleMode?: "mapped";
  resolveState: (input: UpstreamInput) => UpstreamInputState;
  className?: string;
};

export function UpstreamWorkflowIllustration<S extends UpstreamStage>({
  id,
  stage,
  target,
  targetLabel,
  targetEnglish,
  targetIcon: TargetIcon,
  targetColorIndex,
  targetHint,
  rules,
  ruleMode,
  resolveState,
  className,
}: UpstreamWorkflowIllustrationProps<S>) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const separator = t("workflowIllustration.separator");
  // Baselines remain generation dependencies, but the illustration only shows concrete source inputs.
  const nodes = directUpstreamInputs(stage, target).filter(input => input.kind !== "baseline").flatMap((input) => {
    const state = resolveState(input);
    const optional = input.kind === "supplementary";
    const ruleNodes = input.kind === "rules" ? upstreamRuleNodes(rules ?? []) : [];
    const sources = ruleNodes.length ? ruleNodes : [undefined];
    return sources.map((source) => {
      const rule = source?.rule;
      const kind = source?.kind;
      const missingType = Boolean(source && !rule);
      const label = missingType
        ? t("requirementSemantics.missingType", { type: t(`requirementSemantics.kinds.${kind}`) })
        : rule ? `${t(`requirementSemantics.kinds.${kind}`)} ${source!.ordinal}`
        : upstreamInputLabel(input, t, rules);
      // Rule classification is display metadata, not a source acceptance constraint.
      const nodeState = missingType ? "missing" : state;
      return {
        key: rule ? `${upstreamInputKey(input)}:${rule.id}` : missingType ? `${upstreamInputKey(input)}:missing:${kind}` : upstreamInputKey(input),
        label,
        hint: rule ? `${label}: ${rule.text}` : label,
        Icon: upstreamInputIcon(input, kind),
        colorIndex: upstreamInputColorIndex(input, kind),
        state: nodeState,
        stateLabel: input.kind === "rules" && ruleMode && nodeState === "ready" ? t(`requirementSemantics.${ruleMode}Badge`) : t(`workflowIllustration.states.${nodeState}`),
        optional,
        tone: optional && nodeState === "missing" ? OPTIONAL_MISSING_TONE : input.kind === "rules" && ruleMode === "mapped" && nodeState === "ready" ? STATE_TONE.planned : STATE_TONE[nodeState],
      };
    });
  });
  const summary = t("workflowIllustration.summary", {
    target: targetLabel,
    inputs: nodes.map((node) => t("workflowIllustration.summaryItem", {
      label: node.optional ? `${node.label}${t("workflowIllustration.optionalSuffix")}` : node.label,
      state: node.stateLabel,
    })).join(separator),
  });

  const count = nodes.length;
  const stackHeight = count * NODE_HEIGHT + Math.max(0, count - 1) * NODE_GAP;
  const height = Math.max(stackHeight, LOGO_SIZE);
  const offset = (height - stackHeight) / 2;
  const middle = height / 2;
  const convergePaths = nodes.map((_, index) => {
    const y = offset + index * (NODE_HEIGHT + NODE_GAP) + NODE_HEIGHT / 2;
    const bend = CONVERGE_WIDTH / 2;
    return `M0 ${y} C${bend} ${y} ${bend} ${middle} ${CONVERGE_WIDTH} ${middle}`;
  });
  // The stacked layout spreads curve starts evenly across the width above the logo.
  const stackedPaths = nodes.map((_, index) => {
    const x = ((index + 0.5) / Math.max(count, 1)) * 100;
    return `M${x} 0 C${x} 18 50 14 50 32`;
  });
  const outputPath = `M4 8H${OUTPUT_WIDTH - 8}`;

  return (
    <figure
      id={id}
      data-slot="upstream-workflow"
      data-stage={stage}
      data-target={String(target)}
      aria-label={t("workflowIllustration.title", { target: targetLabel })}
      className={cn("min-w-0 scroll-mt-4 py-4", className)}
    >
      {/* Keyboard and screen-reader users hear the dependency summary when the inspected card changes. */}
      <p className="sr-only" aria-live="polite">{summary}</p>
      {ruleMode && <figcaption className="mb-3 text-center text-xs text-muted-foreground">{t("requirementSemantics.mappedHint")}</figcaption>}
      <div
        className="flex min-w-0 flex-col items-center md:flex-row md:justify-center"
        style={{ "--upstream-flow-height": `${height}px` } as CSSProperties}
      >
        <ul
          aria-label={t("workflowIllustration.inputsLabel")}
          className="flex w-full min-w-0 flex-wrap justify-center gap-2 md:h-(--upstream-flow-height) md:w-64 md:flex-none md:flex-col md:flex-nowrap lg:w-72"
        >
          {nodes.map(({ key, label, hint, Icon, colorIndex, state, stateLabel, optional, tone }) => (
            <li
              key={key}
              data-input={key}
              data-state={state}
              title={hint}
              className="flex h-10 min-w-0 max-w-full shrink-0 items-center gap-2 rounded-lg border border-border/80 bg-card px-2 shadow-xs md:w-full"
            >
              <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md border", categoryChipTone(colorIndex))}>
                <Icon aria-hidden="true" className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{label}</span>
              {optional && (
                <span className="shrink-0 rounded border border-dashed border-border px-1 text-[10px] leading-4 text-muted-foreground">
                  {t("workflowIllustration.optional")}
                </span>
              )}
              <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 text-[10px] font-medium leading-4", tone.badge)}>
                <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                {stateLabel}
              </span>
            </li>
          ))}
        </ul>

        <svg
          aria-hidden="true"
          focusable="false"
          data-slot="upstream-connectors"
          className="hidden shrink-0 overflow-visible md:block md:w-24 lg:w-40 xl:w-52"
          width={CONVERGE_WIDTH}
          height={height}
          viewBox={`0 0 ${CONVERGE_WIDTH} ${height}`}
          preserveAspectRatio="none"
          fill="none"
        >
          {convergePaths.map((d, index) => (
            <path
              key={nodes[index].key}
              d={d}
              className={nodes[index].tone.stroke}
              strokeWidth={1.25}
              strokeLinecap="round"
              strokeDasharray={nodes[index].state === "missing" || nodes[index].state === "planned" ? "3 4" : undefined}
            />
          ))}
          {/* Subtle flow dots only render when the user allows motion. */}
          {!reduceMotion && convergePaths.map((d, index) => nodes[index].state === "missing" || nodes[index].state === "planned" ? null : (
            <circle key={`flow-${nodes[index].key}`} r={2} className="fill-primary/60">
              <animateMotion dur="2.8s" repeatCount="indefinite" path={d} />
            </circle>
          ))}
        </svg>
        <svg
          aria-hidden="true"
          focusable="false"
          className="h-8 w-full max-w-sm md:hidden"
          viewBox="0 0 100 32"
          preserveAspectRatio="none"
          fill="none"
        >
          {stackedPaths.map((d, index) => (
            <path
              key={nodes[index].key}
              d={d}
              className={nodes[index].tone.stroke}
              strokeWidth={1.25}
              vectorEffect="non-scaling-stroke"
              strokeDasharray={nodes[index].state === "missing" || nodes[index].state === "planned" ? "3 4" : undefined}
            />
          ))}
        </svg>

        <div data-slot="upstream-platform" className="relative flex shrink-0 items-center justify-center">
          <span aria-hidden="true" className="absolute -inset-2 rounded-[1.75rem] bg-primary/10 blur-md" />
          <ProductLogo
            variant="badge"
            aria-label={t("workflowIllustration.platform")}
            className="relative size-16 drop-shadow-sm"
          />
        </div>

        <svg
          aria-hidden="true"
          focusable="false"
          className="hidden shrink-0 md:block md:w-16 lg:w-28 xl:w-36"
          width={OUTPUT_WIDTH}
          height={16}
          viewBox={`0 0 ${OUTPUT_WIDTH} 16`}
          preserveAspectRatio="none"
          fill="none"
        >
          <path d={outputPath} className="stroke-primary/45" strokeWidth={1.25} strokeLinecap="round" />
          <path
            d={`M${OUTPUT_WIDTH - 11} 4L${OUTPUT_WIDTH - 6} 8L${OUTPUT_WIDTH - 11} 12`}
            className="stroke-primary/60"
            strokeWidth={1.25}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {!reduceMotion && (
            <circle r={2} className="fill-primary/60">
              <animateMotion dur="1.6s" repeatCount="indefinite" path={outputPath} />
            </circle>
          )}
        </svg>
        <svg aria-hidden="true" focusable="false" className="my-1 h-7 w-4 md:hidden" viewBox="0 0 16 28" fill="none">
          <path d="M8 2V24" className="stroke-primary/45" strokeWidth={1.25} strokeLinecap="round" />
          <path d="M4 20L8 25L12 20" className="stroke-primary/60" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        <div
          data-slot="upstream-target"
          title={targetHint}
          className="flex min-w-0 max-w-full items-center gap-3 rounded-xl border border-primary/30 bg-card px-3 py-2.5 shadow-xs md:w-56 lg:w-64"
        >
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg border", categoryChipTone(targetColorIndex))}>
            <TargetIcon aria-hidden="true" className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("workflowIllustration.targetLabel")}
            </span>
            <span className="block truncate text-sm font-semibold text-foreground">{targetLabel}</span>
            {targetEnglish && <span className="block truncate text-[11px] text-muted-foreground">{targetEnglish}</span>}
          </span>
        </div>
      </div>
    </figure>
  );
}
