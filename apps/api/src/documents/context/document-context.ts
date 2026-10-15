// Owns document context shaping and section normalization before DOCX rendering.
import {
  documentContentResultSchema,
  type DesignDiagramKind,
  type DesignDiagramModelSpec,
  type DiagramKind,
  type DiagramModelSpec,
  type DocumentKind,
  type DocumentSection,
  type StartDocumentRunRequest,
  type UseCaseDiagramSpec,
} from "@uml-platform/contracts";

export function documentTitle(documentKind: DocumentKind) {
  return documentKind === "requirementsSpec"
    ? "需求规格说明书"
    : documentKind === "softwareDesignSpec"
      ? "软件设计说明书"
      : "可行性研究报告";
}

export function expectedDocumentDiagramKinds(documentKind: DocumentKind) {
  return documentKind === "requirementsSpec"
    ? ["function", "activity", "usecase", "class", "deployment", "prototype", "analysis"]
    : documentKind === "softwareDesignSpec"
      ? ["architecture", "sequence", "class", "navigation", "table", "component", "deployment"]
      : ["context"];
}

const FORBIDDEN_DOCUMENT_PATTERNS = [
  /当前阶段未明确/u,
  /待补充/u,
  /待完善/u,
  /后续评审/u,
  /后续补充/u,
  /后续.*补充/u,
  /见(?:上文|下文|前文|后文|[^。；，,]*小节|[^。；，,]*章节|[^。；，,]*部分)/u,
  /参考(?:上文|下文|前文|后文|[^。；，,]*小节|[^。；，,]*章节|[^。；，,]*部分)/u,
];

const FALLBACK_FACT = "由需求文本、模型元素和追踪关系综合确定";

export function textHasForbiddenDocumentPlaceholder(text: string) {
  return FORBIDDEN_DOCUMENT_PATTERNS.some((pattern) => pattern.test(text));
}

function sectionTextValues(section: DocumentSection) {
  return [
    section.title,
    ...section.body,
    ...(section.table?.headers ?? []),
    ...(section.table?.rows.flat() ?? []),
  ];
}

export function findForbiddenDocumentPhrases(sections: DocumentSection[]) {
  const matches = new Set<string>();
  for (const section of sections) {
    for (const text of sectionTextValues(section)) {
      for (const pattern of FORBIDDEN_DOCUMENT_PATTERNS) {
        const match = text.match(pattern)?.[0];
        if (match) matches.add(match);
      }
    }
  }
  return Array.from(matches);
}

export function findUnsupportedDocumentClaims(
  input: StartDocumentRunRequest,
  sections: DocumentSection[],
) {
  const trustedCorpus = JSON.stringify({
    requirementText: input.requirementText,
    rules: input.rules,
    requirementBaseline: input.requirementBaseline,
    requirementModels: input.requirementModels,
    designModels: input.designModels,
    feasibilityInputs: input.feasibilityInputs,
    feasibilityImplementationPlan: input.feasibilityImplementationPlan,
  });
  const currentYear = String(new Date().getFullYear());
  const allowedTitles = new Set([
    "需求规格说明书",
    "软件设计说明书",
    "可行性研究报告",
  ]);
  const issues = new Set<string>();

  for (const section of sections) {
    for (const text of sectionTextValues(section)) {
      for (const year of text.match(/(?:19|20)\d{2}/gu) ?? []) {
        if (year !== currentYear && !trustedCorpus.includes(year)) {
          issues.add(`无来源年份 ${year}`);
        }
      }
      for (const match of text.matchAll(/《([^》]{2,80})》/gu)) {
        const title = match[1]?.trim();
        if (
          title &&
          !allowedTitles.has(title) &&
          !trustedCorpus.includes(`《${title}》`) &&
          !trustedCorpus.includes(title)
        ) {
          issues.add(`无来源参考资料《${title}》`);
        }
      }
    }
  }

  return Array.from(issues);
}

function sanitizeFallbackText(text: string, fallback = FALLBACK_FACT) {
  return textHasForbiddenDocumentPlaceholder(text) ? fallback : text;
}

function compactText(value: string | undefined | null, fallback = FALLBACK_FACT) {
  const text = value?.trim();
  return text ? sanitizeFallbackText(text, fallback) : fallback;
}

function compactJoin(values: Array<string | undefined | null>, fallback = FALLBACK_FACT) {
  const filtered = values.map((value) => value?.trim()).filter(Boolean);
  return filtered.length > 0 ? filtered.join("；") : fallback;
}

function briefText(value: string, maxChars = 180) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "系统围绕用户提交的业务目标组织功能、数据、界面和运行约束。";
  return normalized.length <= maxChars
    ? normalized
    : `${normalized.slice(0, Math.max(0, maxChars - 1))}…`;
}

function sectionBodyFromLines(lines: string[], fallback: string) {
  const body = lines.map((line) => line.trim()).filter(Boolean);
  return body.length > 0 ? body : [fallback];
}

function useCaseModels(input: StartDocumentRunRequest): UseCaseDiagramSpec[] {
  return input.requirementModels.filter(
    (model): model is UseCaseDiagramSpec => model.diagramKind === "usecase",
  );
}

function requirementModel<TKind extends DiagramKind>(
  input: StartDocumentRunRequest,
  diagramKind: TKind,
) {
  return input.requirementModels.find(
    (model): model is Extract<DiagramModelSpec, { diagramKind: TKind }> =>
      model.diagramKind === diagramKind,
  );
}

function requirementModels<TKind extends DiagramKind>(
  input: StartDocumentRunRequest,
  diagramKind: TKind,
) {
  return input.requirementModels.filter(
    (model): model is Extract<DiagramModelSpec, { diagramKind: TKind }> =>
      model.diagramKind === diagramKind,
  );
}

function designModel<TKind extends DesignDiagramKind>(
  input: StartDocumentRunRequest,
  diagramKind: TKind,
) {
  return input.designModels.find(
    (model): model is Extract<DesignDiagramModelSpec, { diagramKind: TKind }> =>
      model.diagramKind === diagramKind,
  );
}

function designModels<TKind extends DesignDiagramKind>(
  input: StartDocumentRunRequest,
  diagramKind: TKind,
) {
  return input.designModels.filter(
    (model): model is Extract<DesignDiagramModelSpec, { diagramKind: TKind }> =>
      model.diagramKind === diagramKind,
  );
}

function sequenceModelIdForUseCaseId(useCaseId: string) {
  return `sequence:${useCaseId}`;
}

function analysisModelIdForUseCaseId(useCaseId: string) {
  return `analysis:${useCaseId}`;
}

function requirementUseCases(input: StartDocumentRunRequest): UseCaseDiagramSpec["useCases"] {
  const useCases = useCaseModels(input).flatMap((model) => model.useCases);
  if (useCases.length > 0) return useCases;
  const sequenceUseCases = designModels(input, "sequence")
    .filter((model) => model.sourceUseCaseId || model.modelId)
    .map((model, index) => {
      const sourceUseCaseId =
        model.sourceUseCaseId ??
        model.modelId?.replace(/^sequence:/u, "") ??
        `UC-${index + 1}`;
      return {
        id: sourceUseCaseId,
        name: model.sourceUseCaseName ?? model.title,
        goal: model.summary,
        description: model.summary,
        preconditions: ["用户具备访问系统并提交业务信息的条件"],
        postconditions: ["系统完成业务处理、返回处理结果并保留必要记录"],
        supportingActorIds: [],
        eventFlows: [],
      };
    });
  if (sequenceUseCases.length > 0) return sequenceUseCases;
  return [
    {
      id: "UC-1",
      name: "核心业务处理",
      goal: briefText(input.requirementText),
      description: briefText(input.requirementText),
      preconditions: ["用户具备访问系统并提交业务信息的条件"],
      postconditions: ["系统完成业务处理、返回处理结果并保留必要记录"],
      supportingActorIds: [],
      eventFlows: [
        {
          id: "flow-main",
          name: "主业务流程",
          flowType: "main",
          trigger: "用户发起业务操作",
          steps: [
            {
              order: 1,
              actor: "actor",
              actorAction: "提交业务请求",
              systemAction: "校验请求、执行业务规则并组织结果数据",
              expectedResult: "用户获得处理结果，系统记录业务状态",
            },
          ],
        },
      ],
    },
  ];
}

function useCaseActorIds(useCase: ReturnType<typeof requirementUseCases>[number]) {
  return [useCase.primaryActorId, ...useCase.supportingActorIds].filter(
    (actorId): actorId is string => Boolean(actorId),
  );
}

function allActors(input: StartDocumentRunRequest) {
  return useCaseModels(input).flatMap((model) => model.actors);
}

function requirementActors(input: StartDocumentRunRequest, actorIds: string[]) {
  const actors = allActors(input);
  const selected = actorIds
    .map((actorId) => actors.find((actor) => actor.id === actorId)?.name)
    .filter(Boolean);
  if (selected.length > 0) return selected;
  if (actors.length > 0) return actors.map((actor) => actor.name);
  return ["主要用户"];
}

function actorDescriptionBody(input: StartDocumentRunRequest) {
  const actors = allActors(input);
  if (actors.length === 0) {
    return [
      "主要用户负责发起系统业务操作、提交业务数据并接收系统反馈；外部系统或服务在需求文本涉及集成时承担数据交换、通知或认证等支撑职责。",
    ];
  }
  return actors.map((actor) => {
    const responsibilities = compactJoin(actor.responsibilities, "承担与其角色相关的业务操作和结果确认");
    return `${actor.name}：${actor.description ?? responsibilities}。职责：${responsibilities}。`;
  });
}

function eventFlowTypeLabel(flowType: string) {
  if (flowType === "main") return "主事件流";
  if (flowType === "alternative") return "备选事件流";
  if (flowType === "exception") return "异常事件流";
  return "事件流";
}

function useCaseEventFlowBody(
  useCase: ReturnType<typeof requirementUseCases>[number],
) {
  if (!useCase.eventFlows || useCase.eventFlows.length === 0) {
    return [`事件流：${compactText(useCase.description, useCase.goal)}`];
  }
  return useCase.eventFlows.flatMap((flow) => [
    `${eventFlowTypeLabel(flow.flowType)}：${flow.name}${
      flow.condition ? `（条件：${flow.condition}）` : ""
    }${flow.trigger ? `，触发：${flow.trigger}` : ""}`,
    ...flow.steps.map((step) => {
      const actorAction = step.actorAction ? `参与者：${step.actorAction}` : "";
      const systemAction = step.systemAction ? `系统：${step.systemAction}` : "";
      const expectedResult = step.expectedResult ? `结果：${step.expectedResult}` : "";
      return `步骤 ${step.order}：${[actorAction, systemAction, expectedResult]
        .filter(Boolean)
        .join("；")}`;
    }),
  ]);
}

function requirementRulesBody(input: StartDocumentRunRequest) {
  if (input.rules.length === 0) {
    return [`文本需求：${briefText(input.requirementText, 260)}`];
  }
  return input.rules.map((rule) => `${rule.id}（${rule.category}）：${rule.text}`);
}

function rulesForDiagram(input: StartDocumentRunRequest, diagramKind: DiagramKind) {
  return input.rules.filter((rule) => rule.relatedDiagrams.includes(diagramKind));
}

function formatTraceRuleId(ruleId: string) {
  const text = ruleId.trim();
  return /^r\d+$/iu.test(text) ? text.toUpperCase() : text;
}

function traceRefLabel(ref: { diagramKind: string; label: string }) {
  return `${documentDiagramLabel(ref.diagramKind)}：${ref.label}`;
}

function trustedTraceRefId(ref: {
  diagramKind: string;
  elementId: string;
  modelId?: string;
}) {
  return `${ref.modelId ? `${ref.modelId}:` : ""}${ref.diagramKind}:${ref.elementId}`.toLowerCase();
}

function requirementIdByRuleId(input: StartDocumentRunRequest) {
  const baseline = input.requirementBaseline;
  return new Map(
    (baseline?.requirements ?? []).flatMap((requirement) =>
      requirement.sourceRuleId
        ? [[requirement.sourceRuleId.toLowerCase(), requirement.id] as const]
        : [],
    ),
  );
}

function acceptedRequirementBaselineRows(input: StartDocumentRunRequest) {
  const baseline = input.requirementBaseline;
  const rows = (baseline?.requirements ?? [])
    .filter((requirement) => requirement.status === "accepted")
    .map((requirement, index) => [
      String(index + 1),
      requirement.id,
      requirement.sourceRuleId ?? "原文",
      requirement.sourceFragment,
    ]);
  return rows.length > 0
    ? rows
    : [["1", "未提供/待确认", "未提供/待确认", "当前没有已接受需求基线"]];
}

function isTrustedRequirementTrace(
  input: StartDocumentRunRequest,
  entry: StartDocumentRunRequest["requirementModelTraceability"][number],
) {
  if (
    entry.reviewStatus === "pending" ||
    entry.confidence === "low" ||
    entry.mappingSource === "auto-filled-pending-review"
  ) {
    return false;
  }
  const coverageMatrix = input.coverageMatrix;
  if (!coverageMatrix) return true;
  const requirementId =
    requirementIdByRuleId(input).get(entry.ruleId.toLowerCase()) ?? entry.ruleId;
  const coverageRow = coverageMatrix.rows.find(
    (row) => row.requirementId.toLowerCase() === requirementId.toLowerCase(),
  );
  return Boolean(
    coverageRow?.modelElements.some(
      (elementId) =>
        elementId.toLowerCase() === trustedTraceRefId(entry.target),
    ),
  );
}

function requirementTraceRows(
  input: StartDocumentRunRequest,
  diagramKind: DiagramKind,
  modelId?: string,
) {
  const traceRows = input.requirementModelTraceability
    .filter(
      (entry) =>
        entry.target.diagramKind === diagramKind &&
        (!modelId || entry.target.modelId === modelId) &&
        isTrustedRequirementTrace(input, entry),
    )
    .map((entry, index) => [
      String(index + 1),
      formatTraceRuleId(entry.ruleId),
      entry.target.label,
    ]);
  if (traceRows.length > 0) return traceRows;

  if (input.coverageMatrix) {
    return [["1", "无可信映射", "当前图暂无通过语义校验的需求追踪"]];
  }

  if (diagramKind === "analysis") {
    return [[
      "1",
      "无直接规则映射",
      modelId
        ? `由 ${modelId.replace(/^analysis:/u, "")} 的已确认用例事件流派生`
        : "由已确认用例事件流派生",
    ]];
  }

  const relatedRules = rulesForDiagram(input, diagramKind);
  if (relatedRules.length > 0) {
    return relatedRules.map((rule, index) => [
      String(index + 1),
      formatTraceRuleId(rule.id),
      rule.text,
    ]);
  }

  return [["1", "需求文本", briefText(input.requirementText, 120)]];
}

function designTraceRows(
  input: StartDocumentRunRequest,
  diagramKind: DesignDiagramKind,
  modelId?: string,
) {
  const trustedDesignElements = input.coverageMatrix
    ? new Set(
        input.coverageMatrix.rows.flatMap((row) =>
          row.designElements.map((elementId) => elementId.toLowerCase()),
        ),
      )
    : null;
  const scopedEntries = input.designModelTraceability.filter(
    (entry) =>
      entry.source.diagramKind === diagramKind &&
      (!modelId || entry.source.modelId === modelId),
  );
  const rows = scopedEntries
    .filter(
      (entry) =>
        entry.reviewStatus !== "pending" &&
        entry.confidence !== "low" &&
        entry.mappingSource !== "auto-filled-pending-review" &&
        (!trustedDesignElements ||
          trustedDesignElements.has(trustedTraceRefId(entry.source))),
    )
    .map((entry, index) => [
      String(index + 1),
      entry.source.label,
      compactJoin(entry.targets.map(traceRefLabel), "需求模型元素"),
    ]);
  if (rows.length > 0) return rows;
  if (trustedDesignElements || scopedEntries.length > 0) {
    return [["1", documentDiagramLabel(diagramKind), "当前图暂无通过语义校验的设计追踪"]];
  }
  return [["1", documentDiagramLabel(diagramKind), "需求模型元素"]];
}

function requirementClasses(input: StartDocumentRunRequest) {
  const model = requirementModel(input, "class");
  return model && "classes" in model ? model.classes : [];
}

function designClasses(input: StartDocumentRunRequest) {
  const model = designModel(input, "class");
  return model && "classes" in model ? model.classes : [];
}

function designTables(input: StartDocumentRunRequest) {
  const model = designModel(input, "table");
  return model && "tables" in model ? model.tables : [];
}

function functionStructureBody(input: StartDocumentRunRequest) {
  const model = requirementModel(input, "function");
  if (!model || model.nodes.length === 0) {
    return rulesForDiagram(input, "function").map(
      (rule) => `功能项 ${rule.id}：${rule.text}`,
    );
  }
  return model.nodes.map((node) => {
    const source = node.sourceRequirementIds.length > 0
      ? `，来源需求：${node.sourceRequirementIds.join("、")}`
      : "";
    return `${node.name}：${node.description ?? "承担系统功能分解中的业务能力"}${source}。`;
  });
}

function activityBody(input: StartDocumentRunRequest, stage: "requirement" | "design") {
  const model = stage === "requirement"
    ? requirementModel(input, "activity")
    : designModel(input, "navigation");
  if (!model || model.nodes.length === 0) {
    return [
      stage === "requirement"
        ? "总体业务流程围绕用户发起操作、系统校验处理、业务状态更新和结果反馈展开。"
        : "界面关系围绕入口页面、业务表单、状态反馈、列表详情和返回路径组织。",
    ];
  }
  return [
    ...(model.diagramKind === "activity" ? model.swimlanes.map((lane) => `泳道 ${lane.id}：${lane.name}`) : []),
    ...model.nodes.map((node) => `节点 ${node.id}：${node.name ?? node.id}（${"type" in node ? node.type : node.nodeType}）${"dataType" in node ? `，对象类型 ${node.dataType}，状态 ${node.state ?? "未指定"}` : ""}${"route" in node && node.route ? `，路由 ${node.route}` : ""}${"inputPins" in node ? `，输入引脚 ${(node.inputPins ?? []).map((pin) => `${pin.id}:${pin.dataType}`).join("、")}，输出引脚 ${(node.outputPins ?? []).map((pin) => `${pin.id}:${pin.dataType}`).join("、")}` : ""}`),
    ...model.relationships.map((edge) => `${edge.id}：${edge.sourceId} → ${edge.targetId}（${edge.type}）${"label" in edge && edge.label ? `，${edge.label}` : ""}${edge.condition ? `；条件：${edge.condition}` : ""}${edge.guard ? `；守卫：${edge.guard}` : ""}${edge.trigger ? `；触发：${edge.trigger}` : ""}`),
  ];
}

function classDescriptionBody(classes: ReturnType<typeof requirementClasses> | ReturnType<typeof designClasses>) {
  if (classes.length === 0) {
    return [
      "领域对象围绕需求文本中的业务名词、状态数据和操作结果组织，用于承接功能需求中的核心数据结构。",
    ];
  }
  return classes.map((item) => {
    const attributes = item.attributes.map((attribute) => attribute.name).join("、");
    const operations = item.operations.map((operation) => operation.name).join("、");
    return `${item.name}：${item.description ?? item.type ?? "业务领域对象"}；属性：${
      attributes || "由业务字段构成"
    }；操作：${operations || "以领域职责和业务规则驱动"}。`;
  });
}

function classRelationBody(model: Extract<DiagramModelSpec | DesignDiagramModelSpec, { diagramKind: "class" }> | undefined) {
  if (!model || model.relationships.length === 0) {
    return ["类之间围绕业务对象的拥有、引用、依赖和继承关系组织，保证功能处理过程中的数据语义一致。"];
  }
  return model.relationships.map((relation) => {
    const source = model.classes.find((item) => item.id === relation.sourceId)?.name ?? relation.sourceId;
    const target = model.classes.find((item) => item.id === relation.targetId)?.name ?? relation.targetId;
    return `${source} 与 ${target}：${relation.type}${
      relation.label ? `，${relation.label}` : ""
    }${relation.description ? `，${relation.description}` : ""}。`;
  });
}

function deploymentBody(
  model: Extract<DiagramModelSpec | DesignDiagramModelSpec, { diagramKind: "deployment" }> | undefined,
  stage: "requirement" | "design",
) {
  if (!model) return [stage === "requirement" ? "尚未记录部署约束。" : "尚未生成部署设计。"];
  return [
    ...model.nodes.map((node) => `节点 ${node.id}：${node.name}（${node.nodeType}），技术：${node.technology ?? "未指定"}，上层节点：${node.parentId ?? "无"}，环境约束：${node.environment ?? "未指定"}`),
    ...model.databases.map((node) => `数据库执行环境 ${node.id}：${node.name}，上层节点：${node.parentId ?? "无"}，引擎：${node.engine ?? "未指定"}`),
    ...model.externalSystems.map((node) => `外部系统 ${node.id}：${node.name}`),
    ...model.components.map((node) => `逻辑组件 ${node.id}：${node.name}`),
    ...model.artifacts.map((node) => `制品 ${node.id}：${node.name}（${node.artifactType ?? "未指定类型"}）`),
    ...model.relationships.map((edge) => `${edge.id}：${edge.sourceId} → ${edge.targetId}（${edge.type}），方向 ${edge.direction ?? "outbound"}${edge.protocol ? `，协议 ${edge.protocol}` : ""}${edge.port ? `，端口 ${edge.port}` : ""}${"label" in edge && edge.label ? `，${edge.label}` : ""}${edge.description ? `，${edge.description}` : ""}`),
    ...model.notes,
  ];
}

function prototypeBody(input: StartDocumentRunRequest) {
  const model = requirementModel(input, "prototype");
  if (!model || model.nodes.length === 0) {
    return [
      "界面需求围绕用户入口、业务表单、列表详情、结果反馈和错误提示组织，界面跳转保持业务流程连续。",
    ];
  }
  return [
    `界面节点：${compactJoin(model.nodes.map((node) => `${node.name}（${node.nodeType}）`))}。`,
    `界面关系：${compactJoin(
      model.relationships.map((relation) => `${relation.sourceId} → ${relation.targetId}（${relation.type}）${relation.label ?? ""}${relation.trigger ? `；触发：${relation.trigger}` : ""}${relation.condition ? `；条件：${relation.condition}` : ""}${relation.guard ? `；守卫：${relation.guard}` : ""}`),
      "导航、包含、提交、返回和依赖关系",
    )}。`,
  ];
}

function architectureBody(input: StartDocumentRunRequest) {
  const model = designModel(input, "architecture");
  if (!model) {
    return [
      "系统架构按表现层、业务层、数据层和外部集成边界组织，核心依赖从需求功能分解和设计类职责中抽取。",
    ];
  }
  return [
    `架构包：${compactJoin(model.packages.map((item) => item.name), "表现层、业务层、数据层和外部集成层")}。`,
    `核心组件：${compactJoin(model.components.map((item) => item.name), "业务组件、数据组件和接口组件")}。`,
    `架构依赖数量：${model.relationships.length}，用于表达包、组件和子系统之间的调用或包含关系。`,
  ];
}

function componentBody(input: StartDocumentRunRequest) {
  const model = designModel(input, "component");
  if (!model) {
    return [
      "组件设计按设计类职责划分业务组件、接口组件和数据访问组件，组件之间通过清晰接口协作。",
    ];
  }
  return [
    `组件：${compactJoin(model.components.map((item) => `${item.name}${item.componentType ? `（${item.componentType}）` : ""}`))}。`,
    `接口：${compactJoin(model.interfaces.map((item) => item.name), "组件提供和依赖的业务接口")}。`,
    `组件关系数量：${model.relationships.length}，用于表达依赖、提供接口、需要接口、组合和通信关系。`,
  ];
}

function sequenceModelForUseCase(
  input: StartDocumentRunRequest,
  useCase: ReturnType<typeof requirementUseCases>[number],
) {
  return designModels(input, "sequence").find(
    (model) =>
      model.sourceUseCaseId === useCase.id ||
      model.modelId === sequenceModelIdForUseCaseId(useCase.id),
  );
}

function analysisModelForUseCase(
  input: StartDocumentRunRequest,
  useCase: ReturnType<typeof requirementUseCases>[number],
) {
  return requirementModels(input, "analysis").find(
    (model) =>
      model.sourceUseCaseId === useCase.id ||
      model.modelId === analysisModelIdForUseCaseId(useCase.id),
  );
}

function sequenceBody(
  model: Extract<DiagramModelSpec | DesignDiagramModelSpec, { diagramKind: "sequence" | "analysis" }> | undefined,
  useCase: ReturnType<typeof requirementUseCases>[number],
  stage: "analysis" | "design",
) {
  if (!model) {
    return [
      stage === "analysis"
        ? `${useCase.name} 的需求分析围绕参与者请求、系统响应、领域对象协作和结果反馈展开。`
        : `${useCase.name} 的实现方案围绕边界对象、控制对象、服务对象、实体对象和数据访问对象之间的方法调用展开。`,
      ...useCaseEventFlowBody(useCase),
    ];
  }
  return [
    ...model.participants.map((participant) => `${participant.id}：${participant.name}（${participant.participantType}）`),
    ...model.messages.map((message) => `${message.id}：${message.sourceId} → ${message.targetId}（${message.type}）${message.name}(${message.parameters.join(", ")})${message.returnValue ? `：${message.returnValue}` : ""}${message.condition ? `；条件：${message.condition}` : ""}`),
    ...model.fragments.flatMap((fragment) => [
      `片段 ${fragment.id}（${fragment.type}）：${fragment.label}；条件 ${fragment.condition ?? "无"}；父片段 ${fragment.parentFragmentId ?? "无"}；父分支 ${fragment.parentBranchId ?? "无"}；消息 ${fragment.messageIds.join("、")}`,
      ...(fragment.branches ?? []).map((branch) => `分支 ${branch.id}：${branch.label ?? ""}；条件 ${branch.condition ?? "无"}；消息 ${branch.messageIds.join("、")}`),
    ]),
    ...(model.activations ?? []).map((activation) => `激活 ${activation.id}：${activation.participantId}，${activation.startMessageId} 至 ${activation.endMessageId}`),
  ];
}

function requirementUseCaseClassRows(input: StartDocumentRunRequest) {
  const classes = requirementClasses(input);
  return requirementUseCases(input).map((useCase, index) => [
    String(index + 1),
    useCase.name,
    compactJoin(requirementActors(input, useCaseActorIds(useCase)), "主要用户"),
    compactJoin(classes.map((item) => item.name), "由领域概念模型承接的业务对象"),
    compactJoin(
      input.rules
        .filter((rule) => rule.relatedDiagrams.includes("usecase"))
        .map((rule) => rule.id),
      "由用例目标和事件流推导",
    ),
  ]);
}

function designUseCaseInterfaceRows(input: StartDocumentRunRequest) {
  const prototype = requirementModel(input, "prototype");
  return requirementUseCases(input).map((useCase, index) => {
    const screens =
      prototype?.nodes
        .filter((node) => node.sourceUseCaseIds.includes(useCase.id))
        .map((node) => node.name) ?? [];
    return [
      String(index + 1),
      useCase.name,
      compactJoin(screens, "与该用例交互路径一致的界面节点"),
    ];
  });
}

function designUseCaseObjectClassRows(input: StartDocumentRunRequest) {
  const classes = designClasses(input);
  return requirementUseCases(input).map((useCase, index) => {
    const participants = sequenceModelForUseCase(input, useCase)?.participants ?? [];
    return [
      String(index + 1),
      useCase.name,
      compactJoin(participants.map((item) => item.name), "边界对象、控制对象、服务对象和实体对象"),
      compactJoin(classes.map((item) => item.name), "由设计类图承接的设计类"),
      "用例实现设计通过对象协作映射到设计类职责",
    ];
  });
}

function classTableRows(input: StartDocumentRunRequest) {
  const tables = designTables(input);
  const classes = designClasses(input).filter((item) =>
    ["entity", "aggregate"].includes(item.classKind ?? ""),
  );
  const persistentClasses = classes.length > 0 ? classes : designClasses(input);
  const sourceClasses = persistentClasses.length > 0
    ? persistentClasses
    : [{ name: "核心业务对象" }];
  return sourceClasses.map((item, index) => [
    String(index + 1),
    item.name,
    tables[index]?.name ?? `${item.name}数据表`,
    "表结构依据持久化类的标识、属性和关联关系组织",
  ]);
}

function tableDesignBody(input: StartDocumentRunRequest) {
  const tables = designTables(input);
  if (tables.length === 0) {
    return ["数据库表围绕持久化类、业务主键、状态字段、时间字段和关联外键组织，支撑核心业务数据的保存与查询。"];
  }

  return tables.flatMap((table) => [
    `${table.name}：${table.description ?? "保存对应业务对象及其状态数据"}`,
    ...(table.relationalConstraints ?? []).map((key) => key.type === "check" ? `检查约束 ${key.name ?? key.id}：${key.expression}` : `${key.type} ${key.name ?? key.id} (${key.columnIds.join(", ")})${key.type === "foreign-key" ? ` REFERENCES ${key.referenceTableId} (${key.referenceColumnIds.join(", ")})` : ""}`),
    ...table.columns.map((column) => {
      const constraints = [
        column.isPrimaryKey ? "主键" : undefined,
        column.isForeignKey ? "外键" : undefined,
        column.nullable ? "可空" : "非空",
        column.references
          ? `引用 ${column.references.tableId}.${column.references.columnId}`
          : undefined,
      ].filter(Boolean);
      return `字段 ${column.name}，类型 ${column.dataType}，限制：${constraints.join("、") || "按业务规则约束"}。`;
    }),
  ]);
}

function tableRelationBody(input: StartDocumentRunRequest) {
  const model = designModel(input, "table");
  if (!model || model.relationships.length === 0) {
    return ["表之间通过业务标识、外键字段和关联表组织一对一、一对多或多对多关系，保证查询和更新的一致性。"];
  }
  return model.relationships.map((relation) => {
    const source = model.tables.find((table) => table.id === relation.sourceTableId)?.name ?? relation.sourceTableId;
    const target = model.tables.find((table) => table.id === relation.targetTableId)?.name ?? relation.targetTableId;
    return `${source}（${relation.sourceMultiplicity ?? ""}）与 ${target}（${relation.targetMultiplicity ?? ""}）：${relation.type}${relation.label ? `，${relation.label}` : ""}${relation.description ? `，${relation.description}` : ""}。`;
  });
}

function unresolvedRequirementIssuesBody(input: StartDocumentRunRequest) {
  return [
    `需求书已围绕 ${input.rules.length || 1} 条需求线索和 ${input.requirementModels.length || 1} 类需求模型组织说明。实现前重点校验模型元素命名、异常流程、权限边界、部署资源和数据字段是否与代码实现保持一致。`,
  ];
}

function unresolvedDesignIssuesBody(input: StartDocumentRunRequest) {
  return [
    `设计书已围绕 ${input.designModels.length || 1} 类设计模型组织说明。编码和联调阶段重点校验接口方法、数据表字段、组件依赖、部署节点和界面状态流转是否与设计模型保持一致。`,
  ];
}

export function buildDocumentContext(input: StartDocumentRunRequest) {
  return {
    documentKind: input.documentKind,
    requirementText: input.requirementText,
    rules: input.rules,
    requirementModels: input.requirementModels,
    requirementModelTraceability: input.requirementModelTraceability,
    requirementPlantUml: input.requirementPlantUml.map((artifact) => ({
      diagramKind: artifact.diagramKind,
      modelId: artifact.modelId,
      hasSource: Boolean(artifact.source),
    })),
    requirementSvgArtifacts: input.requirementSvgArtifacts.map((artifact) => ({
      diagramKind: artifact.diagramKind,
      modelId: artifact.modelId,
      hasSvg: Boolean(artifact.svg),
    })),
    designModels: input.designModels,
    designModelTraceability: input.designModelTraceability,
    designPlantUml: input.designPlantUml.map((artifact) => ({
      diagramKind: artifact.diagramKind,
      modelId: artifact.modelId,
      hasSource: Boolean(artifact.source),
    })),
    designSvgArtifacts: input.designSvgArtifacts.map((artifact) => ({
      diagramKind: artifact.diagramKind,
      modelId: artifact.modelId,
      hasSvg: Boolean(artifact.svg),
    })),
    feasibilityInputs: input.feasibilityInputs,
    feasibilityImplementationPlan: input.feasibilityImplementationPlan,
    canonicalSections: fallbackDocumentSections(input).map((section) => ({
      level: section.level,
      title: section.title,
      diagramKind: section.diagramKind,
      diagramModelId: section.diagramModelId,
      tableHeaders: section.table?.headers,
    })),
    forbiddenPhrases: [
      "当前阶段未明确",
      "待补充",
      "待完善",
      "后续评审",
      "后续补充",
      "见某小节/章节/部分",
    ],
  };
}

export function fallbackDocumentSections(input: StartDocumentRunRequest): DocumentSection[] {
  if (input.documentKind === "requirementsSpec") {
    const useCases = requirementUseCases(input);
    const requirementClass = requirementModel(input, "class");
    const requirementDeployment = requirementModel(input, "deployment");
    return documentContentResultSchema.parse({
      sections: [
        { level: 1, title: "项目引言", body: [] },
        { level: 2, title: "编写目的", body: ["本文档基于需求文本、需求规则、需求模型和模型追踪关系，说明系统目标、功能边界、数据对象、运行环境、界面关系和需求分析结果，为后续设计、实现和测试提供可追溯线索。"] },
        { level: 2, title: "基线", body: [`基线由 ${input.rules.length || 1} 条需求线索、${input.requirementModels.length || 1} 类需求模型、PlantUML 图源和渲染图产物组成。`] },
        { level: 2, title: "定义与标识", body: [`需求项以规则编号和模型元素标识表达；用例以 UC 标识表达；图产物按 ${expectedDocumentDiagramKinds("requirementsSpec").join("、")} 分类组织。`] },
        { level: 2, title: "参考资料", body: ["参考资料为用户输入的原始需求文本、平台抽取的需求规则、需求阶段 UML 模型、PlantUML 图源、SVG 图产物和元素级追踪关系。"] },
        { level: 1, title: "需求概述", body: [] },
        { level: 2, title: "系统目标", body: [`系统目标：${briefText(input.requirementText, 320)}`] },
        { level: 2, title: "文本需求", body: requirementRulesBody(input) },
        { level: 2, title: "功能结构", body: ["功能结构图按照系统能力、子功能和功能依赖组织，表达需求文本中的功能分解关系。"], diagramKind: "function" },
        { level: 3, title: "功能结构详述", body: sectionBodyFromLines(functionStructureBody(input), "功能结构由需求规则中的业务能力分解形成。") },
        { level: 3, title: "跟踪关系", body: ["功能结构与需求规则的对应关系如下。"], table: { headers: ["编号", "需求规则", "模型元素"], rows: requirementTraceRows(input, "function") } },
        { level: 2, title: "总体业务流程", body: ["总体业务流程图描述跨角色业务活动、条件分支、状态流转和结果反馈。"], diagramKind: "activity" },
        { level: 3, title: "总体业务流程详述", body: activityBody(input, "requirement") },
        { level: 3, title: "跟踪关系", body: ["总体业务流程与需求规则的对应关系如下。"], table: { headers: ["编号", "需求规则", "模型元素"], rows: requirementTraceRows(input, "activity") } },
        { level: 1, title: "功能需求（用例模型）", body: [] },
        { level: 2, title: "用例图", body: ["用例图表达系统边界、参与者、用例目标和用例之间的包含、扩展或泛化关系。"], diagramKind: "usecase" },
        { level: 2, title: "用户（角色）和跟踪关系", body: actorDescriptionBody(input), table: { headers: ["编号", "需求规则", "模型元素"], rows: requirementTraceRows(input, "usecase") } },
        ...useCases.map((useCase) => ({
          level: 2 as const,
          title: `用例：${useCase.name}`,
          body: [
            `用例标识：${useCase.id}`,
            `概述：${compactText(useCase.description, useCase.goal)}`,
            `执行者：${compactJoin(requirementActors(input, useCaseActorIds(useCase)), "主要用户")}`,
            `前置条件：${compactJoin(useCase.preconditions, "用户具备访问系统并提交业务信息的条件")}`,
            ...useCaseEventFlowBody(useCase),
            `后置条件：${compactJoin(useCase.postconditions, "系统完成业务处理、返回结果并记录状态")}`,
          ],
        })),
        { level: 1, title: "数据需求（领域概念模型）", body: [] },
        { level: 2, title: "领域概念模型", body: ["领域概念模型描述业务对象、属性、关系和约束，承接功能需求中的数据语义。"], diagramKind: "class" },
        { level: 2, title: "类的描述", body: classDescriptionBody(requirementClasses(input)) },
        { level: 2, title: "类与类的关系", body: classRelationBody(requirementClass) },
        { level: 2, title: "跟踪矩阵", body: ["领域概念模型与需求规则的对应关系如下。"], table: { headers: ["编号", "需求规则", "模型元素"], rows: requirementTraceRows(input, "class") } },
        { level: 1, title: "运行需求", body: [] },
        { level: 2, title: "部署需求模型", body: ["部署需求模型表达需求阶段可识别的运行节点、外部系统、数据存储、通信关系和部署约束。"], diagramKind: "deployment" },
        { level: 2, title: "部署描述", body: deploymentBody(requirementDeployment, "requirement") },
        { level: 2, title: "跟踪矩阵", body: ["部署需求模型与需求规则的对应关系如下。"], table: { headers: ["编号", "需求规则", "模型元素"], rows: requirementTraceRows(input, "deployment") } },
        { level: 1, title: "界面需求", body: [] },
        { level: 2, title: "界面关系图", body: ["原型界面关系图描述页面、模块、入口点、提交动作和返回路径。"], diagramKind: "prototype" },
        { level: 2, title: "界面总体描述", body: prototypeBody(input) },
        { level: 2, title: "跟踪矩阵", body: ["界面需求与需求规则的对应关系如下。"], table: { headers: ["编号", "需求规则", "模型元素"], rows: requirementTraceRows(input, "prototype") } },
        { level: 1, title: "需求分析", body: [] },
        ...useCases.flatMap((useCase) => {
          const model = analysisModelForUseCase(input, useCase);
          return [
            {
              level: 2 as const,
              title: `用例 ${useCase.name} 的分析`,
              body: sequenceBody(model, useCase, "analysis"),
              diagramKind: "analysis",
              diagramModelId: model?.modelId ?? analysisModelIdForUseCaseId(useCase.id),
            },
            {
              level: 3 as const,
              title: "顺序图的描述",
              body: sequenceBody(model, useCase, "analysis"),
            },
            {
              level: 3 as const,
              title: "跟踪关系",
              body: ["需求分析模型与需求规则的对应关系如下。"],
              table: {
                headers: ["编号", "需求规则", "模型元素"],
                rows: requirementTraceRows(
                  input,
                  "analysis",
                  model?.modelId ?? analysisModelIdForUseCaseId(useCase.id),
                ),
              },
            },
          ];
        }),
        { level: 1, title: "其它需求", body: [] },
        { level: 2, title: "性能需求", body: ["系统应在主要业务流程中保持稳定响应，查询、提交、状态更新和结果反馈需要支持课程项目规模下的连续操作；批量数据、长列表和复杂图形展示应采用分页、缓存或异步处理降低等待时间。"] },
        { level: 2, title: "安全需求", body: ["系统应保护用户身份、业务数据和操作记录；登录态、权限边界、输入校验、异常提示和数据访问过程需要防止越权、错误提交和敏感信息泄露。"] },
        { level: 2, title: "操作需求", body: ["系统操作应围绕清晰入口、明确反馈、可恢复错误和可追踪结果组织；用户提交、编辑、删除、查询和导出操作需要保持状态提示一致。"] },
        { level: 2, title: "其它需求约束", body: ["系统应保持需求模型、设计模型、代码实现和测试用例之间的追踪一致；部署、数据字段、接口命名和异常流程应与模型元素保持同源。"] },
        { level: 1, title: "尚未解决的问题", body: unresolvedRequirementIssuesBody(input) },
        { level: 1, title: "附录", body: [] },
        { level: 2, title: "术语表", body: [`模型类型：${expectedDocumentDiagramKinds("requirementsSpec").map((kind) => documentDiagramLabel(kind)).join("、")}。`] },
        { level: 2, title: "需求原始资料", body: [briefText(input.requirementText, 1200)] },
      ],
    }).sections;
  }

  if (input.documentKind === "feasibilityStudy") {
    const plan = input.feasibilityImplementationPlan;
    if (!plan) {
      throw new Error("可行性研究报告缺少实现方案。");
    }
    const recommendedCandidate = plan.candidates.find(
      (candidate) => candidate.id === plan.recommendedCandidateId,
    );
    const implementation = recommendedCandidate?.implementation;
    if (!recommendedCandidate || !implementation) {
      throw new Error("推荐方案缺少完整的技术、实施、风险或可行性结论，请重新生成实现方案。");
    }
    const facts = input.feasibilityInputs;
    const value = (text: string | number | null | undefined) =>
      text === null || text === undefined || String(text).trim() === ""
        ? "未提供/待确认"
        : String(text);
    const context = requirementModel(input, "context");
    if (!context) throw new Error("可行性研究报告缺少上下文模型。");
    const traceRows = [
      ...context.people.flatMap((element) => element.sourceRequirementIds.map((id) => [id, "人员", element.name])),
      ...context.externalSystems.flatMap((element) => element.sourceRequirementIds.map((id) => [id, "外部系统", element.name])),
      ...context.relationships.flatMap((relation) => relation.sourceRequirementIds.map((id) => [id, "关系", relation.label])),
    ];
    const analysisYears = facts.analysisYears ?? implementation.analysisPeriodAssumption?.years ?? 1;
    const hasStructuredCosts = implementation.costEstimates.length > 0;
    const hasStructuredBenefits = implementation.benefitEstimates.some((item) => item.range);
    const periodBasis = facts.analysisYears
      ? `采用用户确认的 ${facts.analysisYears} 年分析期。`
      : implementation.analysisPeriodAssumption
        ? `采用 AI 估算的 ${implementation.analysisPeriodAssumption.years} 年分析期：${implementation.analysisPeriodAssumption.basis}`
        : "旧方案未保存分析周期；请重新生成完整估算后计算区间指标。";
    const frequencyFactor = (frequency: "one-time" | "monthly" | "annual") =>
      frequency === "monthly" ? analysisYears * 12 : frequency === "annual" ? analysisYears : 1;
    const sumRanges = (items: Array<{ range: { minimum: number; maximum: number }; frequency: "one-time" | "monthly" | "annual" }>) =>
      items.reduce((total, item) => ({
        minimum: total.minimum + item.range.minimum * frequencyFactor(item.frequency),
        maximum: total.maximum + item.range.maximum * frequencyFactor(item.frequency),
      }), { minimum: 0, maximum: 0 });
    const quantifiedBenefits = implementation.benefitEstimates.filter(
      (item): item is typeof item & { range: NonNullable<typeof item.range> } => Boolean(item.range),
    );
    const totalCostRange = sumRanges(implementation.costEstimates);
    const totalBenefitRange = sumRanges(quantifiedBenefits);
    const formatRange = (range: { minimum: number; maximum: number }, available = true) => available
      ? `CNY ${range.minimum.toFixed(2)}–${range.maximum.toFixed(2)}`
      : "数据不足，未计算（旧方案需重新生成）";
    const ratioRange = totalCostRange.minimum > 0 && totalCostRange.maximum > 0
      ? {
          minimum: totalBenefitRange.minimum / totalCostRange.maximum,
          maximum: totalBenefitRange.maximum / totalCostRange.minimum,
        }
      : null;
    const annualBenefits = quantifiedBenefits
      .filter((item) => item.frequency !== "one-time")
      .reduce((total, item) => ({
        minimum: total.minimum + item.range.minimum * (item.frequency === "monthly" ? 12 : 1),
        maximum: total.maximum + item.range.maximum * (item.frequency === "monthly" ? 12 : 1),
      }), { minimum: 0, maximum: 0 });
    const oneTimeCosts = sumRanges(implementation.costEstimates.filter((item) => item.frequency === "one-time"));
    const paybackRange = annualBenefits.minimum > 0 && annualBenefits.maximum > 0
      ? {
          minimum: oneTimeCosts.minimum / annualBenefits.maximum,
          maximum: oneTimeCosts.maximum / annualBenefits.minimum,
        }
      : null;
    const costRows = (category: "capital" | "other-one-time" | "recurring") => {
      const rows = implementation.costEstimates
        .filter((item) => item.category === category)
        .map((item) => [item.name, formatRange(item.range), item.frequency, item.range.basis, item.range.confidence, item.provenance]);
      const scope = category === "capital" ? "capital-costs" : category === "other-one-time" ? "other-one-time-costs" : "recurring-costs";
      const absence = implementation.absenceDeclarations.find((item) => item.scope === scope);
      return rows.length ? rows : [["不适用", "—", "—", absence?.reason ?? "旧方案未提供该类别估算。", "—", absence?.provenance ?? "legacy"]];
    };
    const benefitRows = (category: "one-time" | "recurring" | "intangible") => {
      const rows = implementation.benefitEstimates
        .filter((item) => item.category === category)
        .map((item) => [item.name, item.range ? formatRange(item.range) : "不可量化", item.frequency, item.range?.basis ?? item.outcome, item.range?.confidence ?? "—", item.provenance]);
      const scope = category === "one-time" ? "one-time-benefits" : category === "recurring" ? "recurring-benefits" : "intangible-benefits";
      const absence = implementation.absenceDeclarations.find((item) => item.scope === scope);
      return rows.length ? rows : [["不适用", "—", "—", absence?.reason ?? "旧方案未提供该类别估算。", "—", absence?.provenance ?? "legacy"]];
    };
    const alternatives = plan.candidates.filter((candidate) => candidate.id !== plan.recommendedCandidateId);
    return documentContentResultSchema.parse({ sections: [
        { level: 1, title: "引言", body: ["本文档依据已接受的需求规则、系统上下文图（系统环境图）、实现方案和用户补充事实，对项目实施条件进行结构化可行性研究。"] },
      { level: 2, title: "编写目的", body: ["明确系统建设前提、比较实现方案、识别成本收益和风险，并形成可执行且可追溯的实施结论。"] },
      { level: 2, title: "背景", body: [`项目名称：${value(facts.projectName)}`, `任务提出者：${value(facts.proposedBy)}`, `开发者：${value(facts.developedBy)}`, `预期用户或运行单位：${value(facts.expectedUsers)}`, context.summary, "下表由上下文元素和关系的来源规则编号确定性生成。"], table: { headers: ["需求规则", "目标类型", "上下文目标"], rows: traceRows.length ? traceRows : [["未提供/待确认", "未提供/待确认", "未提供/待确认"]] }, diagramKind: "context", diagramModelId: "context" },
      { level: 2, title: "定义", body: [`系统边界由“${context.system.name}”及其人员、外部系统和交互关系共同界定；候选方案以 ${plan.candidates.map((candidate) => candidate.name).join("、")} 标识。`] },
      { level: 2, title: "参考资料", body: [`用户提供资料：${value(facts.references)}`, `需求基线和来源规则共 ${input.rules.length} 条，作为方案分析与追踪依据。`] },
      { level: 1, title: "可行性研究的前提", body: [] },
      { level: 2, title: "要求", body: input.rules.map((rule) => `${rule.id}：${rule.text}`) },
      { level: 2, title: "目标", body: [plan.overview, `推荐候选方案：${recommendedCandidate.name}。`] },
      { level: 2, title: "条件、假定和限制", body: [`目标环境：${value(facts.targetEnvironment)}`, `期限：${value(facts.deadline)}`, `预期寿命：${value(facts.expectedLifetimeYears)} 年`, `预算上限：${value(facts.budgetLimit)}`, `团队规模与技能：${value(facts.teamSize)} 人；${value(facts.teamSkills)}`, `可用资源：${value(facts.availableResources)}`, `法律政策约束：${value(facts.legalConstraints)}`, periodBasis] },
      { level: 2, title: "进行可行性研究的方法", body: ["采用需求规则追踪、系统边界分析、两个候选方案对比、成本收益区间计算、风险矩阵和五类可行性结论进行研究。AI 负责形成可编辑草案，用户事实保持原文，数值指标由系统确定性计算。"] },
      { level: 2, title: "评价尺度", body: ["评价尺度包括需求覆盖程度、技术实现难度、运行适应性、实施周期、成本收益区间、风险等级和法律政策约束。AI 估算均保留依据、置信度与来源状态。"] },
      { level: 1, title: "所建议的系统", body: [] },
      { level: 2, title: "对所建议系统的说明", body: [plan.overview, `推荐方案：${recommendedCandidate.name}`, recommendedCandidate.summary, plan.recommendationRationale], table: { headers: ["模块", "职责", "来源规则或假设"], rows: implementation.architecture.modules.map((item) => [item.name, item.responsibility, item.sourceRequirementIds.join("、") || item.assumption]) } },
      { level: 2, title: "处理流程和数据流程", body: [implementation.architecture.summary, implementation.dataStrategy.summary, ...implementation.integrations.map((item) => `${item.name}：${item.responsibility}`), implementation.integrations.length ? "上述集成共同承接系统边界内的数据交换。" : implementation.integrationRationale] },
      { level: 2, title: "改进之处", body: recommendedCandidate.advantages.map((item) => `预期改进：${item}`) },
      { level: 2, title: "影响", body: [] },
      { level: 3, title: "对设备的影响", body: [`目标环境：${value(facts.targetEnvironment)}`, implementation.deploymentAndOperations.summary] },
      { level: 3, title: "对软件的影响", body: [implementation.architecture.summary, implementation.dataStrategy.summary, implementation.securityAndCompliance.summary] },
      { level: 3, title: "对用户单位机构的影响", body: [`预期用户或运行单位：${value(facts.expectedUsers)}`, `角色资源：${Array.from(new Set(implementation.milestones.flatMap((item) => item.roles))).join("、")}`] },
      { level: 3, title: "对系统运行过程的影响", body: [implementation.deploymentAndOperations.summary, ...implementation.preconditions] },
      { level: 3, title: "对开发的影响", body: ["实施计划如下。"], table: { headers: ["里程碑", "时间", "交付物", "角色", "依赖或说明", "验收条件"], rows: implementation.milestones.map((item) => [item.name, item.timeframe, item.deliverables.join("；"), item.roles.join("；"), item.dependencies.join("；") || item.dependencyRationale, item.acceptanceCriteria.join("；")]) } },
      { level: 3, title: "对地点和设施的影响", body: [`目标环境：${value(facts.targetEnvironment)}`, implementation.deploymentAndOperations.summary] },
      { level: 3, title: "对经费开支的影响", body: [`推荐方案预估成本：${recommendedCandidate.estimatedCost}`, `成本区间按 ${analysisYears} 年分析期汇总为 ${formatRange(totalCostRange, hasStructuredCosts)}；全部金额均保留 AI 估算或用户修改状态。`] },
      { level: 2, title: "局限性", body: [recommendedCandidate.disadvantages.map((item) => `方案局限：${item}`).join("；") || "方案局限已在风险登记表中说明。"], table: { headers: ["风险", "概率", "影响", "缓解措施", "责任人", "来源规则或假设", "来源状态"], rows: implementation.risks.map((risk) => [risk.risk, risk.probability, risk.impact, risk.mitigation, risk.owner, risk.sourceRequirementIds.join("、") || risk.assumption, risk.provenance]) } },
      { level: 2, title: "技术条件方面的可行性", body: [implementation.verdicts.find((item) => item.category === "technical")?.rationale ?? implementation.architecture.summary, `团队技能：${value(facts.teamSkills)}`, `可用资源：${value(facts.availableResources)}`, `实施周期：${recommendedCandidate.estimatedSchedule}`] },
      { level: 1, title: "可选择的其他系统方案", body: alternatives.length ? ["以下为未被推荐的完整候选方案及未选中理由。"] : [plan.reducedCandidateReason || "当前约束下没有其他可比较的系统方案。"] },
      ...alternatives.map((candidate, index) => ({ level: 2 as const, title: `可选择的系统方案${index + 1}`, body: [candidate.name, candidate.summary, `优势：${candidate.advantages.join("；")}`, `不足：${candidate.disadvantages.join("；")}`, `预估成本：${candidate.estimatedCost}`, `实施周期：${candidate.estimatedSchedule}`, `未选中理由：${plan.recommendationRationale}`] })),
      { level: 1, title: "投资及效益分析", body: [`成本区间合计：${formatRange(totalCostRange, hasStructuredCosts)}`, `可量化收益区间合计：${formatRange(totalBenefitRange, hasStructuredBenefits)}`, periodBasis] },
      { level: 2, title: "支出", body: [`以下金额为推荐方案在 ${analysisYears} 年分析期内的区间估算。`] },
      { level: 3, title: "基本建设投资", body: [], table: { headers: ["名称", "金额区间", "频率", "估算依据", "置信度", "来源状态"], rows: costRows("capital") } },
      { level: 3, title: "其他一次性支出", body: [], table: { headers: ["名称", "金额区间", "频率", "估算依据", "置信度", "来源状态"], rows: costRows("other-one-time") } },
      { level: 3, title: "非一次性支出", body: [], table: { headers: ["名称", "金额区间", "频率", "估算依据", "置信度", "来源状态"], rows: costRows("recurring") } },
      { level: 2, title: "收益", body: [`以下收益为推荐方案在 ${analysisYears} 年分析期内的区间估算和定性结果。`] },
      { level: 3, title: "一次性收益", body: [], table: { headers: ["名称", "金额区间", "频率", "估算依据或结果", "置信度", "来源状态"], rows: benefitRows("one-time") } },
      { level: 3, title: "非一次性收益", body: [], table: { headers: ["名称", "金额区间", "频率", "估算依据或结果", "置信度", "来源状态"], rows: benefitRows("recurring") } },
      { level: 3, title: "不可计量的收益", body: [], table: { headers: ["名称", "金额区间", "频率", "估算依据或结果", "置信度", "来源状态"], rows: benefitRows("intangible") } },
      { level: 2, title: "收益/投资比", body: ratioRange ? [`收益投资比区间：${ratioRange.minimum.toFixed(2)}–${ratioRange.maximum.toFixed(2)}。`, periodBasis] : ["成本区间为零或收益资料不足，系统无法形成有效收益投资比。", periodBasis] },
      { level: 2, title: "投资回收期", body: paybackRange ? [`简单投资回收期区间：${paybackRange.minimum.toFixed(2)}–${paybackRange.maximum.toFixed(2)} 年。`, "结果由一次性成本区间与年化可量化收益区间确定性计算。"] : ["一次性成本或年化收益不足，系统无法形成有效回收期。"] },
      { level: 2, title: "敏感性分析", body: [`在成本取上界、收益取下界时，收益投资比约为 ${ratioRange?.minimum.toFixed(2) ?? "不可计算"}；在成本取下界、收益取上界时约为 ${ratioRange?.maximum.toFixed(2) ?? "不可计算"}。`, `主要敏感因素来自估算置信度较低的条目：${[...implementation.costEstimates, ...implementation.benefitEstimates.filter((item) => item.range)].filter((item) => item.range?.confidence === "low").map((item) => item.name).join("、") || "当前没有低置信度量化条目"}。`] },
      { level: 1, title: "社会因素方面的可行性", body: [] },
      { level: 2, title: "法律方面的可行性", body: [`用户提供的法律政策约束：${value(facts.legalConstraints)}`, implementation.securityAndCompliance.summary, implementation.verdicts.find((item) => item.category === "legal")?.rationale ?? "法律结论须由用户根据实际约束确认。"] },
      { level: 2, title: "使用方面的可行性", body: [`预期用户或运行单位：${value(facts.expectedUsers)}`, implementation.verdicts.find((item) => item.category === "operational")?.rationale ?? "使用条件依据需求和实施方案评估。", implementation.deploymentAndOperations.summary] },
      { level: 1, title: "结论", body: [`总体决策：${implementation.decision}`, `实施前置条件：${implementation.preconditions.join("；") || "未提供/待确认"}`] },
    ] }).sections;
  }

  const useCases = requirementUseCases(input);
  const designClass = designModel(input, "class");
  const designDeployment = designModel(input, "deployment");
  return documentContentResultSchema.parse({
    sections: [
      { level: 1, title: "引言", body: [] },
      { level: 2, title: "系统概述", body: [`系统概述：${briefText(input.requirementText, 320)}`] },
      { level: 2, title: "基线", body: [`设计基线由 ${input.requirementModels.length || 1} 类需求模型、${input.designModels.length || 1} 类设计模型和 ${input.designModelTraceability.length || 1} 组设计追踪关系组成。`] },
      {
        level: 2,
        title: "已确认业务约束",
        body: ["以下约束直接来自通过复核的需求基线，设计与实现不得弱化其数字、比较符、角色、状态和条件分支。"],
        table: {
          headers: ["编号", "需求标识", "来源规则", "已确认约束"],
          rows: acceptedRequirementBaselineRows(input),
        },
      },
      { level: 2, title: "定义与标识", body: ["设计模型按总体架构图、用例实现设计、设计类图、界面关系图、数据库设计、组件（构件）关系和部署设计组织；用例实现设计以 sequence:<useCaseId> 标识。"] },
      { level: 2, title: "参考资料", body: ["参考资料为需求规格内容、需求阶段 UML 模型、设计阶段 UML 模型、PlantUML 图源、SVG 图产物和模型追踪关系。"] },
      { level: 1, title: "系统总体架构 (System Architecture)", body: [] },
      { level: 2, title: "系统总体逻辑流程设计", body: ["本节复用需求阶段总体业务流程图，说明设计方案需要承接的业务活动、条件分支和状态流转。"], diagramKind: "activity", diagramModelId: "requirement:activity" },
      { level: 3, title: "流程描述", body: activityBody(input, "requirement") },
      { level: 3, title: "跟踪关系", body: ["总体逻辑流程与需求规则的对应关系如下。"], table: { headers: ["编号", "需求规则", "模型元素"], rows: requirementTraceRows(input, "activity") } },
      { level: 2, title: "系统架构设计", body: architectureBody(input), diagramKind: "architecture" },
      { level: 3, title: "总体架构描述", body: architectureBody(input) },
      { level: 3, title: "跟踪关系", body: ["总体架构与需求模型元素的对应关系如下。"], table: { headers: ["编号", "设计元素", "映射需求元素"], rows: designTraceRows(input, "architecture") } },
      { level: 1, title: "用例实现设计 (Use Case Realization)", body: [] },
      ...useCases.flatMap((useCase) => {
        const model = sequenceModelForUseCase(input, useCase);
        return [
          {
            level: 2 as const,
            title: `用例 ${useCase.name} 的实现方案`,
            body: sequenceBody(model, useCase, "design"),
            diagramKind: "sequence",
            diagramModelId: model?.modelId ?? sequenceModelIdForUseCaseId(useCase.id),
          },
          {
            level: 3 as const,
            title: "方案描述",
            body: sequenceBody(model, useCase, "design"),
          },
          {
            level: 3 as const,
            title: "跟踪关系",
            body: ["用例实现设计与需求模型元素的对应关系如下。"],
            table: {
              headers: ["编号", "设计元素", "映射需求元素"],
              rows: designTraceRows(
                input,
                "sequence",
                model?.modelId ?? sequenceModelIdForUseCaseId(useCase.id),
              ),
            },
          },
        ];
      }),
      { level: 1, title: "领域模型设计 (Static Class & Domain Model)", body: [] },
      { level: 2, title: "设计类图", body: ["设计类图表达实体类、服务类、值对象、接口和类之间的静态关系。"], diagramKind: "class" },
      { level: 2, title: "设计类描述", body: classDescriptionBody(designClasses(input)) },
      { level: 2, title: "设计类之间的关系", body: classRelationBody(designClass) },
      { level: 2, title: "设计类跟踪矩阵", body: ["设计类与需求模型元素的对应关系如下。"], table: { headers: ["编号", "设计元素", "映射需求元素"], rows: designTraceRows(input, "class") } },
      { level: 1, title: "交互响应与前端组件设计 (UI/UX Componentization)", body: [] },
      { level: 2, title: "界面关系图", body: ["页面导航图表达页面、入口、模块、条件导航和返回路径。"], diagramKind: "navigation" },
      { level: 2, title: "界面的详述", body: activityBody(input, "design") },
      { level: 2, title: "跟踪关系", body: ["用例与界面的对应关系如下。"], table: { headers: ["编号", "用例名称", "界面名称"], rows: designUseCaseInterfaceRows(input) } },
      { level: 1, title: "数据库设计 (Persistence & Data Strategy)", body: [] },
      { level: 2, title: "表与表的关系图", body: ["表关系图表达数据表、主键、外键和表间基数关系。"], diagramKind: "table" },
      { level: 2, title: "表的详述", body: tableDesignBody(input) },
      { level: 2, title: "表与表的关系详述", body: tableRelationBody(input) },
      { level: 2, title: "跟踪关系", body: ["数据库设计与需求模型元素的对应关系如下。"], table: { headers: ["编号", "设计元素", "映射需求元素"], rows: designTraceRows(input, "table") } },
      { level: 1, title: "组件设计", body: [] },
      { level: 2, title: "设计阶段的组件关系图", body: ["组件（构件）关系图表达组件、接口、依赖、组合和通信关系。"], diagramKind: "component" },
      { level: 2, title: "组件描述", body: componentBody(input) },
      { level: 2, title: "跟踪矩阵", body: ["组件设计与需求模型元素的对应关系如下。"], table: { headers: ["编号", "设计元素", "映射需求元素"], rows: designTraceRows(input, "component") } },
      { level: 1, title: "部署设计与交付 (Deployment & CI/CD)", body: [] },
      { level: 2, title: "设计阶段的部署图", body: ["部署设计图表达组件、节点、数据库和外部系统之间的交付关系。"], diagramKind: "deployment" },
      { level: 2, title: "部署描述", body: deploymentBody(designDeployment, "design") },
      { level: 2, title: "跟踪矩阵", body: ["部署设计与需求模型元素的对应关系如下。"], table: { headers: ["编号", "设计元素", "映射需求元素"], rows: designTraceRows(input, "deployment") } },
      { level: 1, title: "尚未设计的问题", body: unresolvedDesignIssuesBody(input) },
    ],
  }).sections;
}

const LEADING_NUMBER_PATTERN =
  /^\s*(?:第\s*)?\d+(?:\.\d+){0,2}(?:\s*[章节]\s*)?[\s.、：:-]*/;

function sectionKey(title: string) {
  return title
    .replace(LEADING_NUMBER_PATTERN, "")
    .replace(/\s+/g, "")
    .trim();
}

function containsForbiddenContent(section: DocumentSection) {
  return sectionTextValues(section).some(textHasForbiddenDocumentPlaceholder);
}

export function mergeDocumentSectionsWithTemplate(
  template: DocumentSection[],
  generated: DocumentSection[],
) {
  const generatedByTitle = new Map(
    generated.map((section) => [sectionKey(section.title), section]),
  );

  return documentContentResultSchema.parse({
    sections: template.map((section) => {
      const generatedSection = generatedByTitle.get(sectionKey(section.title));
      if (!generatedSection || containsForbiddenContent(generatedSection)) {
        return section;
      }

      const generatedTableHasForbidden = generatedSection.table
        ? containsForbiddenContent({
            level: generatedSection.level,
            title: generatedSection.title,
            body: [],
            table: generatedSection.table,
          })
        : false;

      return {
        ...section,
        body:
          generatedSection.body.length > 0 ? generatedSection.body : section.body,
        diagramModelId: generatedSection.diagramModelId ?? section.diagramModelId,
        table: section.table
          ? {
              headers: section.table.headers,
              rows:
                generatedSection.table?.rows &&
                generatedSection.table.rows.length > 0 &&
                !generatedTableHasForbidden
                  ? generatedSection.table.rows
                  : section.table.rows,
            }
          : generatedTableHasForbidden
            ? undefined
            : generatedSection.table,
      };
    }),
  }).sections;
}

export function diagramPlantUmlForDocument(input: StartDocumentRunRequest) {
  const map = new Map<string, string>();
  const artifacts =
    input.documentKind === "requirementsSpec"
      ? input.requirementPlantUml
      : input.documentKind === "softwareDesignSpec"
        ? input.designPlantUml
        : input.requirementPlantUml;
  for (const artifact of artifacts) {
    map.set(artifact.modelId ?? artifact.diagramKind, artifact.source);
  }
  if (input.documentKind === "softwareDesignSpec") {
    const requirementActivity = input.requirementPlantUml.find(
      (artifact) => artifact.diagramKind === "activity",
    );
    if (requirementActivity) {
      map.set("requirement:activity", requirementActivity.source);
    }
  }
  return map;
}

export function diagramSvgKindsForDocument(input: StartDocumentRunRequest) {
  const set = new Set<string>();
  const artifacts =
    input.documentKind === "requirementsSpec"
      ? input.requirementSvgArtifacts
      : input.documentKind === "softwareDesignSpec"
        ? input.designSvgArtifacts
        : input.requirementSvgArtifacts;
  for (const artifact of artifacts) {
    set.add(artifact.modelId ?? artifact.diagramKind);
  }
  if (input.documentKind === "softwareDesignSpec") {
    const requirementActivity = input.requirementSvgArtifacts.find(
      (artifact) => artifact.diagramKind === "activity",
    );
    if (requirementActivity) {
      set.add("requirement:activity");
    }
  }
  return set;
}

export function documentDiagramLabel(diagramKind: string, sectionTitle?: string) {
  const title = sectionTitle?.replace(LEADING_NUMBER_PATTERN, "").trim();
  if (title) return title;
  const labels: Record<string, string> = {
    function: "功能结构图",
    usecase: "用例图",
    class: "领域概念模型",
    activity: "总体业务流程",
    deployment: "部署需求模型",
    prototype: "原型界面关系",
    analysis: "需求分析模型",
    context: "系统上下文图（系统环境图）",
    architecture: "总体架构图",
    sequence: "用例实现设计",
    component: "组件（构件）关系",
    table: "数据库设计",
  };
  return labels[diagramKind] ?? "UML 图";
}

export function ensureDocumentDiagramSections(
  documentKind: DocumentKind,
  sections: DocumentSection[],
) {
  void documentKind;
  return documentContentResultSchema.parse({ sections }).sections;
}

function replaceUnprovidedInstitutionNames(text: string, allowedSource: string) {
  return text.replace(/[\u4e00-\u9fa5]{2,}(?:大学|学院)/g, (match) =>
    allowedSource.includes(match) ? match : "软件系统",
  );
}

export function sanitizeDocumentSections(
  input: StartDocumentRunRequest,
  sections: DocumentSection[],
) {
  const allowedSource = JSON.stringify(buildDocumentContext(input));
  return documentContentResultSchema.parse({
    sections: sections.map((section) => ({
      ...section,
      title: replaceUnprovidedInstitutionNames(section.title, allowedSource),
      body: section.body.map((paragraph) =>
        sanitizeFallbackText(
          replaceUnprovidedInstitutionNames(paragraph, allowedSource),
          "本节内容依据需求文本、模型元素和追踪关系整理为完整说明。",
        ),
      ),
      table: section.table
        ? {
            headers: section.table.headers.map((cell) =>
              replaceUnprovidedInstitutionNames(cell, allowedSource),
            ),
            rows: section.table.rows.map((row) =>
              row.map((cell) =>
                sanitizeFallbackText(
                  replaceUnprovidedInstitutionNames(cell, allowedSource),
                ),
              ),
            ),
          }
        : undefined,
    })),
  }).sections;
}
