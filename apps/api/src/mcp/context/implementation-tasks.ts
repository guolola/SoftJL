// Builds source-backed coding tasks and explicit readiness issues without inventing acceptance checks or code locations.
import {
  diagramModelSpecSchema,
  designDiagramModelSpecSchema,
  getModelGraphElements,
  modelElementRefSchema,
  type AnyDiagramModel,
  type McpImplementationTask,
  type McpScope,
  type ModelElementRef,
} from "@uml-platform/contracts";
import { contentHash, record, type SourceArtifact } from "./source-artifacts.js";
import { implementationAcceptanceSchema, implementationSources } from "./implementation-sources.js";

type TaskIssue = McpImplementationTask["issues"][number];
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const unique = (values: string[]) => [...new Set(values)].sort();
const globalSource = (artifact: SourceArtifact) =>
  artifact.id === "feasibility:inputs";

const commonGuidance = [
  "以完整设计模型为代码实现的直接依据，读取全部设计关系、行为和约束；需求到设计的正确性由平台负责，编码阶段不重新解释需求或推导设计。遵守工程环境与现有仓库规范，冲突时反馈并确认设计。",
  "先登记预计修改的模块和文件，编码后另行登记实际代码文件、类或函数及测试；预计位置不代表已实现，候选设计元素不要求逐个生成代码。",
  "designRefs 只列真实模型节点作为候选位置；完整关系边、时序消息、条件、约束及列定义仍须从来源产物读取，不能忽略。",
  "根据来源中的验收条件编写正常、边界、异常及权限测试；测试场景是参考，不能把规则正文或生成代码本身当作已确认验收条件。",
  "缺少设计或存在设计歧义时反馈设计缺口，不从原始需求自行设计。blocking 问题阻止将本任务标为验证通过，更新受影响设计与验收依据后重新验证。",
  "MCP 提供的已保存设计与验收条件视为平台认可的实现依据，不携带或重新处理历史审核意见；编码阶段验证代码是否落实这些依据。来源版本或实际代码变化后，原验证结果必须失效并复验。",
];
const diagramGuidance: Record<string, string> = {
  context: "上下文模型确定系统边界、外部参与方和集成职责。",
  function: "功能结构模型用于核对功能范围；功能分解关系不等于任务执行依赖。",
  usecase: "用例模型用于落实参与者权限、功能入口、业务流程及异常分支。",
  activity: "活动模型用于落实控制流程、条件分支、对象传递及终止行为。",
  analysis: "分析交互模型用于理解业务职责与协作；消息及片段约束需完整读取。",
  class: "类模型用于核对实体、接口、职责、操作及约束；分析类不直接等同于实现类。",
  architecture: "架构模型用于确定模块边界、组件职责和依赖。",
  component: "组件模型用于确定接口契约、组件职责及集成关系。",
  sequence: "时序模型用于落实调用顺序、输入输出、条件分支和异常处理。",
  table: "数据库模型用于落实表、列、主外键、唯一性及其他数据约束。",
  navigation: "导航模型用于落实页面、入口、模块与导航权限。",
  prototype: "界面模型用于理解交互入口，不继承平台原型运行环境或仅前端限制。",
  deployment: "部署模型用于核对部署单元、运行环境、外部服务和通信约束。",
};

function parsedModel(artifact: SourceArtifact): AnyDiagramModel | null {
  if (artifact.stage !== "analysis" && artifact.stage !== "design") return null;
  const parsed = (artifact.stage === "analysis" ? diagramModelSpecSchema : designDiagramModelSpecSchema).safeParse(artifact.payload.model);
  return parsed.success ? parsed.data : null;
}

function modelMatches(artifact: SourceArtifact, model: AnyDiagramModel, ref: ModelElementRef) {
  return model.diagramKind === ref.diagramKind &&
    (!ref.modelId || model.modelId === ref.modelId || artifact.id === `${artifact.stage}:${ref.modelId}`);
}

// Trace contracts also support edges, messages and table-scoped columns, beyond graph-node candidates.
function traceElementIds(model: AnyDiagramModel) {
  const ids = new Set(getModelGraphElements(model).map((element) => element.id));
  const raw = record(model);
  for (const key of ["relationships", "messages", "fragments", "activations", "systemBoundaries", "swimlanes"])
    for (const entry of list(raw[key])) {
      const id = record(entry).id;
      if (typeof id === "string") ids.add(id);
    }
  if (model.diagramKind === "table")
    for (const table of model.tables)
      for (const column of table.columns) ids.add(`${table.id}.${column.id}`);
  return ids;
}

function sourceIssues(artifact: SourceArtifact): TaskIssue[] {
  const issues: TaskIssue[] = [];
  const add = (code: string, severity: TaskIssue["severity"], message: string) => issues.push({ code, severity, message: `${artifact.id}：${message}` });
  if (artifact.sourceConsistency === "conflict")
    add("source-inconsistent", "blocking", "结构化模型与图源码可能冲突，须确认并同步依据。");
  if (artifact.version.freshness === "stale")
    add("source-stale", "blocking", "来源已过期，须更新受影响设计并重新验证。");
  else if (artifact.version.freshness === "unknown" && !["requirements:source", "requirements:review", "feasibility:inputs"].includes(artifact.id))
    add("source-freshness-unknown", "warning", "尚无可核对的输入版本，不能声称来源已验证为最新。");
  for (const message of artifact.issues) add("source-note", "warning", message);
  return issues;
}

export function buildImplementationTasks(input: SourceArtifact[], scope?: McpScope): McpImplementationTask[] {
  const artifacts = implementationSources(input.filter((artifact) => artifact.stage !== "implementation"));
  const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const models = new Map(artifacts.flatMap((artifact) => {
    const model = parsedModel(artifact);
    return model ? [[artifact.id, model] as const] : [];
  }));
  const atomic = artifacts.flatMap((artifact) => {
    const parsed = implementationAcceptanceSchema.safeParse(artifact.payload.requirement);
    return artifact.stage === "requirements" && parsed.success ? [{ artifact, requirement: parsed.data }] : [];
  });
  const coveredDesignIds = new Set(artifacts.filter((artifact) => artifact.stage === "design" &&
    atomic.some(({ artifact: acceptance }) => acceptance.requirementIds.some((id) => artifact.requirementIds.includes(id))))
    .map((artifact) => artifact.id));
  // Shared design dependencies belong to the linked task rather than becoming duplicate coding assignments.
  const cover = (id: string) => {
    for (const dependency of byId.get(id)?.dependencies ?? [])
      if (byId.get(dependency)?.stage === "design" && !coveredDesignIds.has(dependency)) {
        coveredDesignIds.add(dependency);
        cover(dependency);
      }
  };
  for (const id of [...coveredDesignIds]) cover(id);
  const seeds = [
    ...atomic.map(({ artifact, requirement }) => ({ artifact, title: `实现设计：${requirement.id}`, criteria: requirement.acceptanceCriteria })),
    ...artifacts.filter((artifact) => artifact.stage === "design" && !coveredDesignIds.has(artifact.id))
      .map((artifact) => ({ artifact, title: `实现设计：${artifact.title}`, criteria: [] as string[] })),
  ];

  const tasks = seeds.map(({ artifact: seed, title, criteria }): McpImplementationTask => {
    const requirementIds = new Set(seed.requirementIds);
    const selected = new Set(artifacts.filter((artifact) =>
      artifact.id === seed.id || globalSource(artifact) ||
      (artifact.requirementIds.some((id) => requirementIds.has(id)) &&
        (artifact.stage !== "requirements" || Boolean(artifact.payload.rule))),
    ).map((artifact) => artifact.id));
    const issues: TaskIssue[] = [];
    // Follow only existing source dependencies. Missing dependencies become issues, never invented references.
    const visit = (id: string) => {
      const artifact = byId.get(id);
      if (!artifact) return;
      for (const dependency of artifact.dependencies) {
        if (!byId.has(dependency)) {
          issues.push({ code: "source-dependency-missing", severity: "blocking", message: `${artifact.id} 引用的来源 ${dependency} 已缺失。` });
        } else if (!selected.has(dependency)) {
          selected.add(dependency);
          visit(dependency);
        }
      }
    };
    for (const id of [...selected]) visit(id);
    const sources = artifacts.filter((artifact) => selected.has(artifact.id));
    for (const source of sources) issues.push(...sourceIssues(source));

    const validateRef = (value: unknown, stage: "analysis" | "design", owner: string, localArtifact?: SourceArtifact) => {
      const parsed = modelElementRefSchema.safeParse(value);
      if (!parsed.success) {
        issues.push({ code: "trace-reference-invalid", severity: "blocking", message: `${owner} 的追踪引用不符合模型元素契约。` });
        return;
      }
      const ref = parsed.data;
      const candidates = (localArtifact ? [localArtifact] : artifacts).filter((artifact) => {
        const model = models.get(artifact.id);
        return artifact.stage === stage && model && modelMatches(artifact, model, ref);
      });
      if (!candidates.some((artifact) => traceElementIds(models.get(artifact.id)!).has(ref.elementId)))
        issues.push({ code: "trace-reference-missing", severity: "blocking", message: `${owner} 的追踪目标 ${ref.modelId ?? ref.diagramKind}/${ref.elementId} 不存在或无法核对，须修复映射。` });
      else if (!ref.modelId && candidates.length > 1)
        issues.push({ code: "trace-model-ambiguous", severity: "warning", message: `${owner} 的 ${ref.diagramKind}/${ref.elementId} 未指定模型标识，存在多个同类型模型候选。` });
    };
    for (const source of sources.filter((artifact) => artifact.stage === "analysis" || artifact.stage === "design")) {
      for (const trace of list(source.payload.traceability).map(record)) {
        if (source.stage === "analysis" && trace.target) validateRef(trace.target, "analysis", source.id);
        if (source.stage === "design") {
          // Validate the design source in its owning model; targets are private upstream requirement provenance.
          validateRef(trace.source, "design", source.id, source);
          for (const ref of list(trace.upstreamDesignRefs)) validateRef(ref, "design", source.id);
        }
      }
    }

    const acceptanceCriteria = unique(criteria.map((text) => text.trim()).filter(Boolean)).map((text) => ({
      id: `${seed.id}:acceptance:${contentHash(text).slice(7, 23)}`,
      text,
      sourceArtifactId: seed.id,
    }));
    if (!acceptanceCriteria.length) issues.push({ code: "acceptance-criteria-missing", severity: "blocking", message: "尚无结构化验收条件；可先计划或实现明确部分，但必须补齐并确认验收条件后才能标为验证通过。" });
    const designRefs = sources.filter((artifact) => artifact.stage === "design").flatMap((artifact) => {
      const model = models.get(artifact.id);
      if (!model) return [];
      const elements = getModelGraphElements(model);
      if (new Set(elements.map((element) => element.id)).size !== elements.length)
        issues.push({ code: "design-element-ambiguous", severity: "blocking", message: `${artifact.id} 存在重复元素标识，须修复后才能建立唯一代码映射。` });
      return [...new Map(elements.map((element) => [`${element.kind}:${element.id}`, element])).values()].map((element) => ({
        artifactId: artifact.id,
        ...(model.modelId ? { modelId: model.modelId } : {}),
        diagramKind: model.diagramKind,
        elementId: element.id,
        elementKind: element.kind,
        label: element.name,
      }));
    });
    if (!sources.some((artifact) => artifact.stage === "design" && models.has(artifact.id)))
      issues.push({ code: "design-model-missing", severity: "blocking", message: "缺少有效设计模型，请在平台补齐设计；编码助手不能从需求自行推导设计。" });
    if (!designRefs.length) issues.push({ code: "design-mapping-missing", severity: "warning", message: "暂无可核对的设计元素映射，请补齐设计元素并记录设计缺口。" });
    return {
      id: `implement:${seed.id}`,
      title: title.slice(0, 160),
      requirementIds: unique([...requirementIds]),
      sourceArtifactIds: unique(sources.map((artifact) => artifact.id)),
      designRefs,
      acceptanceCriteria,
      // Artifact dependency edges express provenance, not a reliable feature execution order.
      dependsOnTaskIds: [],
      issues: [...new Map(issues.map((issue) => [JSON.stringify(issue), issue])).values()],
      guidance: [...commonGuidance, ...unique(sources.flatMap((artifact) => {
        const model = models.get(artifact.id);
        return model && diagramGuidance[model.diagramKind] ? [diagramGuidance[model.diagramKind]] : [];
      }))],
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const requestedRequirements = new Set(scope?.requirementIds ?? []);
  const requestedArtifacts = new Set((scope?.artifactIds ?? []).filter((id) => !id.startsWith("implementation:")));
  if (!requestedRequirements.size && !requestedArtifacts.size) return tasks;
  // Source closure supplies context, not authorization to implement additional requirements.
  return tasks.filter((task) =>
    task.requirementIds.some((id) => requestedRequirements.has(id)) ||
    task.sourceArtifactIds.some((id) => requestedArtifacts.has(id)),
  );
}
