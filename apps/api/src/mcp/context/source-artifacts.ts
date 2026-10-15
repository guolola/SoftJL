// Extracts only saved requirements and UML domain data; prototype execution settings never enter MCP.
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  atomicRequirementSchema,
  requirementRuleSchema,
  diagramModelSpecSchema,
  designDiagramModelSpecSchema,
  requirementModelTraceabilityEntrySchema,
  designModelTraceabilityEntrySchema,
  testGenerationResultSchema,
  snapshotInputFingerprint,
  designInputFingerprint,
  type McpSourceVersion,
} from "@uml-platform/contracts";
import { supplementalSources } from "./supplemental-sources.js";

export type SourceArtifact = {
  id: string;
  stage: "requirements" | "analysis" | "design" | "tests" | "feasibility" | "implementation";
  title: string;
  requirementIds: string[];
  dependencies: string[];
  sourceConsistency: "unknown" | "conflict";
  issues: string[];
  payload: Record<string, unknown>;
  version: McpSourceVersion;
};
export const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const string = (value: unknown) => (typeof value === "string" ? value : null);
const array = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];
function embeddedRequirementIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(embeddedRequirementIds);
  return Object.entries(record(value)).flatMap(([key, entry]) =>
    key === "sourceRequirementIds"
      ? array(entry).filter((id): id is string => typeof id === "string")
      : key === "sourceRequirementId" && typeof entry === "string"
        ? [entry]
        : entry && typeof entry === "object"
          ? embeddedRequirementIds(entry)
          : [],
  );
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export const contentHash = (value: unknown) =>
  `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`;
function parsedItems<T>(schema: z.ZodType<T>, value: unknown): T[] {
  return array(value).flatMap((entry) => {
    const result = schema.safeParse(entry);
    return result.success ? [result.data] : [];
  });
}
// Historical review metadata cannot reject otherwise valid saved implementation facts or trace edges.
const requirementFactsSchema = atomicRequirementSchema.omit({ status: true, fieldProvenance: true, confidence: true });
const requirementTraceFactsSchema = requirementModelTraceabilityEntrySchema.pick({ ruleId: true, target: true });
const designTraceFactsSchema = designModelTraceabilityEntrySchema.pick({ source: true, targets: true, upstreamDesignRefs: true });
function freshness(
  stored: unknown,
  current: string,
): McpSourceVersion["freshness"] {
  // Unknown and legacy input hashes do not establish a verified source baseline.
  return !current || typeof stored !== "string" || !stored.startsWith("fp:v3:")
    ? "unknown"
    : stored === current
      ? "current"
      : "stale";
}

export function extractSourceArtifacts(state: Record<string, unknown>) {
  const artifacts: SourceArtifact[] = [];
  const issues: string[] = [];
  const add = (
    input: Omit<SourceArtifact, "version">,
    stored: unknown = null,
    current = "",
  ) => {
    const artifact = {
      ...input,
      version: {
        artifactId: input.id,
        contentHash: "",
        inputFingerprint: string(stored),
        freshness: freshness(stored, current),
      },
    } satisfies SourceArtifact;
    artifacts.push(artifact);
    return artifact;
  };
  const ruleInput = snapshotInputFingerprint({
    requirementText: state.requirementText ?? "",
    rules: state.rules ?? [],
  });
  const requirementTrace = parsedItems(
    requirementTraceFactsSchema,
    state.requirementModelTraceability,
  );
  const designTrace = parsedItems(
    designTraceFactsSchema,
    state.designModelTraceability,
  );
  if (
    requirementTrace.length !==
      array(state.requirementModelTraceability).length ||
    designTrace.length !== array(state.designModelTraceability).length
  )
    issues.push("部分追踪记录不符合领域契约，无法验证；请在平台检查来源。");
  if (
    typeof state.requirementText === "string" &&
    state.requirementText.trim()
  ) {
    add({
      id: "requirements:source",
      stage: "requirements",
      title: "学生原始需求",
      requirementIds: [],
      dependencies: [],
      sourceConsistency: "unknown",
      issues: [],
      payload: {
        text: state.requirementText,
        interpretation: "用户保存的原始需求；明确提出的技术要求须保留。",
      },
    });
  }
  const baseline = record(state.requirementBaseline);
  const requirements = parsedItems(
    requirementFactsSchema,
    baseline.requirements,
  );
  const rules = parsedItems(requirementRuleSchema, state.rules);
  if (
    requirements.length !== array(baseline.requirements).length ||
    rules.length !== array(state.rules).length
  )
    issues.push("部分需求字段不符合领域契约，已标记缺失，未输出原始工作区。");
  for (const requirement of requirements) {
    add(
      {
        id: `requirement:${requirement.id}`,
        stage: "requirements",
        title: requirement.sourceFragment,
        requirementIds: [
          requirement.id,
          ...(requirement.sourceRuleId ? [requirement.sourceRuleId] : []),
        ],
        dependencies: [],
        sourceConsistency: "unknown",
        issues: [],
        payload: { requirement },
      },
      state.requirementInputFingerprint,
      ruleInput,
    );
  }
  for (const rule of rules) {
    const linked = requirements.filter((req) => req.sourceRuleId === rule.id);
    add(
      {
        id: `rule:${rule.id}`,
        stage: "requirements",
        title: rule.id,
        requirementIds: [rule.id, ...linked.map((req) => req.id)],
        dependencies: linked.map((req) => `requirement:${req.id}`),
        sourceConsistency: "unknown",
        issues: [],
        payload: { rule },
      },
      state.requirementInputFingerprint,
      ruleInput,
    );
  }

  const currentDesignInput = designInputFingerprint(
    Object.values(record(state.models)),
    array(state.requirementModelTraceability),
  );
  for (const [stage, collection, sourceCollection, fingerprints, schema] of [
    [
      "analysis",
      state.models,
      state.plantUml,
      state.diagramInputFingerprints,
      diagramModelSpecSchema,
    ],
    [
      "design",
      state.designModels,
      state.designPlantUml,
      state.designInputFingerprints,
      designDiagramModelSpecSchema,
    ],
  ] as const) {
    for (const key of new Set([
      ...Object.keys(record(collection)),
      ...Object.keys(record(sourceCollection)),
    ])) {
      const parsed = schema.safeParse(record(collection)[key]);
      const source = string(record(sourceCollection)[key]);
      const model = parsed.success ? parsed.data : null;
      const id = `${stage}:${key}`;
      const dirty =
        record(
          record(state.manualModelEditStatus)[key] ??
            record(state.manualModelEditStatus)[`${stage}:${key}`],
        ).status === "dirty";
      const artifactIssues = [
        ...(!model ? ["结构化模型缺失或不符合契约。"] : []),
        ...(!source ? ["图源码缺失。"] : []),
        ...(dirty ? ["结构化模型已有手动修改，图源码可能不一致。"] : []),
      ];
      add(
        {
          id,
          stage,
          title: model?.title ?? key,
          requirementIds: embeddedRequirementIds(model),
          dependencies: artifacts
            .filter(
              (a) =>
                a.stage === "requirements" &&
                a.requirementIds.some((id) =>
                  embeddedRequirementIds(model).includes(id),
                ),
            )
            .map((a) => a.id),
          sourceConsistency: dirty ? "conflict" : "unknown",
          issues: artifactIssues,
          payload: {
            model,
            plantUml: source,
            traceability: [],
            technologyAdvice:
              "模型中的技术选型是设计建议；只有用户原始需求明确指定或本地仓库已有的约束才作为技术栈依据。",
          },
        },
        record(fingerprints)[key] ??
          (model?.modelId ? record(fingerprints)[model.modelId] : undefined),
        stage === "analysis" ? ruleInput : currentDesignInput,
      );
    }
  }
  const resolve = (
    ref: { modelId?: string; diagramKind: string },
    stage: SourceArtifact["stage"],
  ) =>
    artifacts.filter(
      (a) =>
        a.stage === stage &&
        record(a.payload.model).diagramKind === ref.diagramKind &&
        (ref.modelId
          ? record(a.payload.model).modelId === ref.modelId ||
            a.id === `${stage}:${ref.modelId}`
          : record(a.payload.model).diagramKind === ref.diagramKind),
    );
  for (const trace of requirementTrace) {
    const targets = resolve(trace.target, "analysis");
    for (const target of targets) {
      target.requirementIds.push(trace.ruleId);
      target.dependencies.push(
        ...artifacts
          .filter(
            (a) =>
              a.stage === "requirements" &&
              a.requirementIds.includes(trace.ruleId),
          )
          .map((a) => a.id),
      );
      (target.payload.traceability as unknown[]).push(trace);
      if (targets.length > 1)
        target.issues.push(
          "追踪未指定唯一模型标识，保留全部候选依赖，请确认。",
        );
    }
  }
  for (const trace of designTrace) {
    // The contract points from a design source to requirement-model targets, plus optional upstream designs.
    const upstream = [
      ...trace.targets.flatMap((ref) => resolve(ref, "analysis")),
      ...(trace.upstreamDesignRefs ?? []).flatMap((ref) =>
        resolve(ref, "design"),
      ),
    ];
    for (const source of resolve(trace.source, "design")) {
      source.dependencies.push(...upstream.map((a) => a.id));
      (source.payload.traceability as unknown[]).push(trace);
      if (!upstream.length) source.issues.push("追踪引用的上游模型已缺失。");
    }
  }
  const tests = testGenerationResultSchema.safeParse(
    state.testGenerationResult,
  );
  if (tests.success)
    for (const testCase of tests.data.testCases) {
      const coverage = tests.data.coverageRelations.filter(
        (relation) => relation.testCaseId === testCase.id,
      );
      const requirementIds = [
        ...new Set([
          ...(testCase.sourceRequirementId
            ? [testCase.sourceRequirementId]
            : []),
          ...coverage.flatMap((relation) => relation.requirementIds),
        ]),
      ];
      add({
        id: `test:${testCase.id}`,
        stage: "tests",
        title: testCase.title,
        requirementIds,
        dependencies: [
          ...artifacts
            .filter(
              (a) =>
                a.stage === "requirements" &&
                a.requirementIds.some((id) => requirementIds.includes(id)),
            )
            .map((a) => a.id),
          ...coverage.flatMap((relation) =>
            relation.designModelRefs.flatMap((ref) =>
              resolve(ref, "design").map((a) => a.id),
            ),
          ),
        ],
        sourceConsistency: "unknown",
        issues: [],
        payload: { testCase, coverage },
      });
    }
  else if (state.testGenerationResult)
    issues.push("已有测试场景不符合契约，无法读取，请在平台检查。");
  for (const source of supplementalSources(state)) {
    add(
      {
        id: source.id,
        stage: "feasibility",
        title: source.title,
        requirementIds: source.requirementIds,
        dependencies: artifacts
          .filter(
            (a) =>
              a.stage === "requirements" &&
              a.requirementIds.some((id) => source.requirementIds.includes(id)),
          )
          .map((a) => a.id),
        sourceConsistency: "unknown",
        issues: [],
        payload: source.payload,
      },
      source.stored,
      source.current,
    );
  }
  // Dependency cycles terminate because sets only grow; propagate requirement links for functional scopes.
  let changed = true;
  while (changed) {
    changed = false;
    for (const artifact of artifacts) {
      const linked = new Set([
        ...artifact.requirementIds,
        ...artifacts
          .filter((a) => artifact.dependencies.includes(a.id))
          .flatMap((a) => a.requirementIds),
      ]);
      if (linked.size !== new Set(artifact.requirementIds).size) changed = true;
      artifact.requirementIds = [...linked].sort();
    }
  }
  for (const artifact of artifacts) {
    artifact.dependencies = [...new Set(artifact.dependencies)].sort();
    if (
      ["analysis", "design"].includes(artifact.stage) &&
      !artifact.dependencies.length
    )
      artifact.issues.push("缺少可验证的上游追踪；按功能读取可能不完整。");
    artifact.version.contentHash = contentHash({
      payload: artifact.payload,
      dependencies: artifact.dependencies,
      requirementIds: artifact.requirementIds,
      sourceConsistency: artifact.sourceConsistency,
      issues: artifact.issues,
    });
  }
  // Staleness is transitive: unchanged design content cannot be current when its requirements are stale.
  let staleChanged = true;
  while (staleChanged) {
    staleChanged = false;
    for (const artifact of artifacts)
      if (
        artifact.version.freshness !== "stale" &&
        artifacts.some(
          (a) =>
            artifact.dependencies.includes(a.id) &&
            a.version.freshness === "stale",
        )
      ) {
        artifact.version.freshness = "stale";
        staleChanged = true;
      }
  }
  if (!requirements.length && !rules.length)
    issues.push("尚无结构化需求与验收条件，可先根据原始需求实现明确的部分。");
  return {
    artifacts: artifacts.sort((a, b) => a.id.localeCompare(b.id)),
    issues,
  };
}
