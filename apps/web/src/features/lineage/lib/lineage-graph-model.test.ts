import { describe, expect, it } from "vitest";
import type {
  DiagramError,
  RunSnapshot,
} from "@uml-platform/contracts";
import type { RequirementRule } from "../../../entities/requirement-rule/model";
import type { WorkspaceRecord } from "../../../entities/workspace/model";
import type { DesignDiagramType } from "../../../entities/diagram/model";
import type { GenerationTask } from "../../workspace-session/model/session-state";
import {
  buildLineageGraph,
  collectLineagePath,
  groupLineageColumns,
  type LineageGraphInput,
} from "./lineage-graph-model";

const baseRule: RequirementRule = {
  id: "REQ-001",
  category: "功能需求",
  text: "用户登录后可以管理实验资源。",
  relatedDiagrams: ["usecase", "class"],
};

function model(diagramKind: "usecase" | "class") {
  return { diagramKind } as unknown as NonNullable<
    WorkspaceRecord["models"][typeof diagramKind]
  >;
}

function designModel(diagramKind: DesignDiagramType) {
  return { diagramKind, modelId: diagramKind } as unknown as WorkspaceRecord["designModels"][string];
}

function diagramError(message: string): DiagramError {
  return {
    stage: "generate_models",
    error: {
      code: "RUN_STRUCTURED_OUTPUT_INVALID",
      message,
      category: "generation",
      retryable: true,
    },
  };
}

function task(overrides: Partial<GenerationTask>): GenerationTask {
  return {
    clientTaskId: "task-1",
    runId: null,
    kind: "requirements",
    title: "生成需求模型",
    status: "running",
    progress: 30,
    message: null,
    errorMessage: null,
    phaseSummary: null,
    technicalDetailsCollapsed: true,
    diagnostics: {
      runKind: "requirements",
      runId: null,
      providerModel: null,
      startedAt: null,
      finishedAt: null,
      activeStage: null,
      streamText: "",
      chunkCount: 0,
      stageStartedAt: {},
      stageMessages: {},
      events: [],
      
      
      
      
      
      
      
      
      requirementTrace: [],
      designTrace: [],
      
    },
    subtasks: [],
    startedAt: "2026-06-16T10:00:00.000Z",
    finishedAt: null,
    ...overrides,
  };
}

function input(overrides: Partial<LineageGraphInput> = {}): LineageGraphInput {
  return {
    requirementText: "订单系统需求",
    rules: [],
    isRulesStale: false,
    requirementReviewCandidates: {},
    models: {},
    generatedDiagrams: [],
    svgArtifacts: {},
    staleDiagrams: [],
    diagramErrors: {},
    selectedDiagrams: [],
    designModels: {},
    generatedDesignDiagrams: [],
    designSvgArtifacts: {},
    designDiagramErrors: {},
    selectedDesignDiagrams: [],
    staleDesignDiagrams: [],
    staleDesignModelIds: [],
    designStaleReasons: {},
    designTraceabilityStale: false,
    designGenerationBlockedReason: null,
    
    
    
    
    generationTasks: [],
    historyItems: [],
    ...overrides,
  };
}

describe("buildLineageGraph", () => {
  it("creates an empty-state graph with rule and product placeholders", () => {
    const graph = buildLineageGraph(input());

    expect(graph.nodes.find((node) => node.id === "rule:empty")?.status).toBe(
      "not-generated",
    );
    
    expect(
      graph.nodes.find((node) => node.id === "document:requirementsSpec")?.status,
    ).toBe("not-generated");
    expect(graph.edges.some((edge) => edge.source === "rule:empty")).toBe(true);
  });

  it("groups nodes into fixed left-to-right columns with stable node order", () => {
    const graph = buildLineageGraph(
      input({
        rules: [baseRule],
        models: {
          usecase: model("usecase"),
          class: model("class"),
        },
        generatedDiagrams: ["class", "usecase"],
        designModels: {
          class: designModel("class"),
          sequence: designModel("sequence"),
        },
        generatedDesignDiagrams: ["class", "sequence"],
        
      }),
    );

    const columns = groupLineageColumns(graph);

    expect(columns.map((column) => column.label)).toEqual([
      "需求规则",
      "需求模型",
      "设计模型",
      "产物",
    ]);
    expect(columns[0].nodes.map((node) => node.id)).toEqual(["rule:REQ-001"]);
    expect(columns[1].nodes.map((node) => node.id)).toEqual([
      "requirement-model:usecase",
      "requirement-model:class",
    ]);
    expect(columns[2].nodes.map((node) => node.id)).toEqual([
      "design-model:sequence",
      "design-model:class",
    ]);
    expect(columns[3].nodes.map((node) => node.id)).toEqual([
      "document:requirementsSpec",
      "document:softwareDesignSpec",
    ]);
  });

  it("marks a completed core chain as current", () => {
    const graph = buildLineageGraph(
      input({
        rules: [baseRule],
        models: {
          usecase: model("usecase"),
          class: model("class"),
        },
        generatedDiagrams: ["usecase", "class"],
        svgArtifacts: {
          usecase: { diagramKind: "usecase", svg: "<svg>usecase</svg>" } as never,
          class: { diagramKind: "class", svg: "<svg>class</svg>" } as never,
        },
        designModels: {
          sequence: designModel("sequence"),
          class: designModel("class"),
        },
        generatedDesignDiagrams: ["sequence", "class"],
        designSvgArtifacts: {
          sequence: { diagramKind: "sequence", svg: "<svg>sequence</svg>" } as never,
          class: { diagramKind: "class", svg: "<svg>class</svg>" } as never,
        },
        
        
      }),
    );

    expect(graph.nodes.find((node) => node.id === "rule:REQ-001")?.status).toBe(
      "current",
    );
    expect(
      graph.nodes.find((node) => node.id === "requirement-model:usecase")?.status,
    ).toBe("current");
    expect(
      graph.nodes.find((node) => node.id === "design-model:sequence")?.status,
    ).toBe("current");
    
  });

  

  

  it("marks old artifacts stale when the requirement source text is cleared", () => {
    const graph = buildLineageGraph(
      input({
        requirementText: "",
        rules: [baseRule],
        isRulesStale: true,
        models: {
          usecase: model("usecase"),
        },
        generatedDiagrams: ["usecase"],
        svgArtifacts: {
          usecase: { diagramKind: "usecase", svg: "<svg>usecase</svg>" } as never,
        },
        staleDiagrams: ["usecase"],
        designModels: {
          sequence: designModel("sequence"),
        },
        generatedDesignDiagrams: ["sequence"],
        designSvgArtifacts: {
          sequence: { diagramKind: "sequence", svg: "<svg>sequence</svg>" } as never,
        },
        staleDesignDiagrams: ["sequence"],
        staleDesignModelIds: ["sequence"],
        designStaleReasons: {
          sequence: "需求源头已删除，此设计模型为旧产物，需重新输入需求并重跑。",
        },
        
        
        historyItems: [
          {
            id: "run-doc",
            createdAt: "2026-06-21T00:00:00.000Z",
            title: "生成需求规格说明书",
            snapshot: null,
            providerModel: "gpt-5.5",
            status: "completed",
            documentKind: "requirementsSpec",
            documentDownloadAvailable: true,
          },
        ],
      }),
    );

    const ruleNode = graph.nodes.find((node) => node.id === "rule:REQ-001");
    const useCaseNode = graph.nodes.find((node) => node.id === "requirement-model:usecase");
    const designNode = graph.nodes.find((node) => node.id === "design-model:sequence");
    
    const documentNode = graph.nodes.find(
      (node) => node.id === "document:requirementsSpec",
    );

    expect(ruleNode?.status).toBe("stale");
    expect(useCaseNode?.status).toBe("stale");
    expect(useCaseNode?.reason).toContain("需求源头已删除");
    expect(useCaseNode?.hasViewableArtifact).toBe(true);
    expect(designNode?.status).toBe("stale");
    expect(designNode?.reason).toContain("需求源头已删除");
    
    
    
    expect(documentNode?.status).toBe("stale");
    expect(documentNode?.reason).toContain("需求源头");
  });

  it("marks completed document history with missing diagrams as stale for review", () => {
    const graph = buildLineageGraph(
      input({
        historyItems: [
          {
            id: "run-doc-warning",
            createdAt: "2026-06-21T00:00:00.000Z",
            title: "生成需求规格说明书",
            snapshot: null,
            providerModel: "gpt-5.5",
            status: "completed",
            documentKind: "requirementsSpec",
            documentDownloadAvailable: true,
            missingArtifactCount: 1,
            missingArtifactSummary: ["用例图：缺少可嵌入图片源"],
          },
        ],
      }),
    );

    const documentNode = graph.nodes.find(
      (node) => node.id === "document:requirementsSpec",
    );
    expect(documentNode?.status).toBe("stale");
    expect(documentNode?.reason).toContain("需求说明书已生成但缺图，需复核");
    expect(documentNode?.reason).toContain("用例图：缺少可嵌入图片源");
    expect(documentNode?.actionLabel).toBe("更新");
  });

  it("marks deleted document history as stale and not viewable", () => {
    const graph = buildLineageGraph(
      input({
        historyItems: [
          {
            id: "run-doc-deleted",
            createdAt: "2026-06-21T00:00:00.000Z",
            title: "生成需求规格说明书",
            snapshot: null,
            providerModel: "gpt-5.5",
            status: "completed",
            runKind: "document",
            documentKind: "requirementsSpec",
            documentDownloadAvailable: false,
            documentStatus: "deleted",
            documentFileName: "requirements-deleted.docx",
          },
        ],
      }),
    );

    const documentNode = graph.nodes.find(
      (node) => node.id === "document:requirementsSpec",
    );
    expect(documentNode?.status).toBe("stale");
    expect(documentNode?.hasViewableArtifact).toBe(false);
    expect(documentNode?.reason).toContain("已在文档中心删除");
  });

  

  

  it("keeps retry and rerun lineage visible in node recent events", () => {
    const graph = buildLineageGraph(
      input({
        rules: [baseRule],
        models: {
          usecase: model("usecase"),
          class: model("class"),
        },
        generatedDiagrams: ["usecase", "class"],
        historyItems: [
          {
            id: "run-retry",
            createdAt: "2026-06-21T01:10:00.000",
            title: "需求模型重试",
            snapshot: null,
            providerModel: "gpt-5.5",
            status: "queued",
            runKind: "requirements",
            stage: "generate_models",
            sourceRunId: "run-failed",
            sourceAction: "retry",
            sourceRunStatus: "failed",
          },
        ],
      }),
    );

    const useCaseNode = graph.nodes.find(
      (node) => node.id === "requirement-model:usecase",
    );
    expect(useCaseNode?.recentEvents).toContainEqual({
      label: "重试自 run-failed",
      description: "06/21 01:10",
    });
  });

  it("keeps fresh design nodes current when only sibling design models are stale", () => {
    const graph = buildLineageGraph(
      input({
        rules: [baseRule],
        models: {
          usecase: model("usecase"),
          class: model("class"),
        },
        generatedDiagrams: ["usecase", "class"],
        designModels: {
          class: designModel("class"),
          sequence: designModel("sequence"),
        },
        generatedDesignDiagrams: ["sequence", "class"],
        designSvgArtifacts: {
          class: { diagramKind: "class", svg: "<svg>class</svg>" } as never,
        },
        designTraceabilityStale: true,
        staleDesignDiagrams: ["sequence"],
        staleDesignModelIds: ["sequence"],
        designStaleReasons: {
          sequence: "上游需求模型或追踪指纹已变化，此设计模型需更新。",
        },
      }),
    );

    expect(
      graph.nodes.find((node) => node.id === "design-model:class")?.status,
    ).toBe("current");
    const sequenceNode = graph.nodes.find(
      (node) => node.id === "design-model:sequence",
    );
    expect(sequenceNode?.status).toBe("stale");
    expect(sequenceNode?.reason).toContain("上游需求模型或追踪指纹已变化");
  });

  it("marks stale downstream requirement nodes with stale-cause edges", () => {
    const graph = buildLineageGraph(
      input({
        rules: [baseRule],
        isRulesStale: true,
        models: { class: model("class") },
        generatedDiagrams: ["class"],
        staleDiagrams: ["class"],
      }),
    );

    const staleNode = graph.nodes.find(
      (node) => node.id === "requirement-model:class",
    );
    expect(staleNode?.status).toBe("stale");
    expect(staleNode?.reason).toContain("需求规则或复核结果已变化");
    expect(
      graph.edges.find(
        (edge) =>
          edge.source === "rule:REQ-001" &&
          edge.target === "requirement-model:class",
      )?.status,
    ).toBe("stale");
  });

  it("projects failed rules-only history as a retryable rule extraction error", () => {
    const failedRulesSnapshot: RunSnapshot = {
      runId: "run-rules-failed",
      requirementText: "订单系统需求",
      selectedDiagrams: [],
      analysisTargetUseCaseIds: [],
      rules: [],
      requirementBaseline: null,
      coverageMatrix: null,
      traceabilityMatrix: null,
      models: [],
      requirementModelTraceability: [],
      plantUml: [],
      svgArtifacts: [],
      diagramErrors: {},
      requirementTrace: [],
      currentStage: "extract_rules",
      status: "failed",
      error: {
        code: "RUN_STRUCTURED_OUTPUT_INVALID",
        message: "rules 必须是数组",
        category: "generation",
        retryable: true,
      },
    };
    const graph = buildLineageGraph(
      input({
        historyItems: [
          {
            id: "run-rules-failed",
            createdAt: "2026-06-21T00:00:00.000Z",
            title: "订单系统需求",
            snapshot: failedRulesSnapshot,
            providerModel: "mock",
          },
        ],
      }),
    );

    const ruleNode = graph.nodes.find((node) => node.id === "rule:empty");
    expect(ruleNode?.status).toBe("error");
    expect(ruleNode?.reason).toContain("需求规则抽取失败");
    expect(ruleNode?.reason).toContain("模型返回的结构化结果不合法");
    expect(ruleNode?.actionLabel).toBe("重试");
  });

  it("keeps failures local and marks blocked edges as errors", () => {
    const graph = buildLineageGraph(
      input({
        rules: [baseRule],
        diagramErrors: {
          class: diagramError("Conflict in primary key definition."),
        },
      }),
    );

    expect(
      graph.nodes.find((node) => node.id === "requirement-model:class")?.status,
    ).toBe("error");
    expect(
      graph.nodes.find((node) => node.id === "requirement-model:usecase")?.status,
    ).not.toBe("error");
    expect(
      graph.edges.find(
        (edge) =>
          edge.source === "rule:REQ-001" &&
          edge.target === "requirement-model:class",
      )?.status,
    ).toBe("error");
  });

  it("shows running scoped generation tasks on the matching node", () => {
    const graph = buildLineageGraph(
      input({
        rules: [baseRule],
        generationTasks: [
          task({
            subtasks: [
              {
                id: "generate_models:usecase",
                label: "用例模型",
                status: "running",
                message: null,
                errorMessage: null,
              },
            ],
          }),
        ],
      }),
    );

    expect(
      graph.nodes.find((node) => node.id === "requirement-model:usecase")?.status,
    ).toBe("running");
  });

  it("keeps old requirement artifacts viewable while the same model reruns", () => {
    const graph = buildLineageGraph(
      input({
        rules: [baseRule],
        models: { usecase: model("usecase") },
        generatedDiagrams: ["usecase"],
        svgArtifacts: {
          usecase: { diagramKind: "usecase", svg: "<svg>old usecase</svg>" } as never,
        },
        generationTasks: [
          task({
            subtasks: [
              {
                id: "generate_models:usecase",
                label: "用例模型",
                status: "running",
                message: null,
                errorMessage: null,
              },
            ],
          }),
        ],
      }),
    );

    const useCaseNode = graph.nodes.find(
      (node) => node.id === "requirement-model:usecase",
    );
    expect(useCaseNode?.status).toBe("running");
    expect(useCaseNode?.hasViewableArtifact).toBe(true);
    expect(useCaseNode?.reason).toContain("重新生成中，旧产物仍可查看");
  });

  it("keeps old design artifacts viewable while the same design model reruns", () => {
    const graph = buildLineageGraph(
      input({
        designModels: {
          class: designModel("class"),
        },
        generatedDesignDiagrams: ["class"],
        designSvgArtifacts: {
          class: { diagramKind: "class", svg: "<svg>old class</svg>" } as never,
        },
        generationTasks: [
          task({
            kind: "design",
            subtasks: [
              {
                id: "generate_design_models:class",
                label: "设计类图",
                status: "queued",
                message: null,
                errorMessage: null,
              },
            ],
          }),
        ],
      }),
    );

    const classNode = graph.nodes.find((node) => node.id === "design-model:class");
    expect(classNode?.status).toBe("running");
    expect(classNode?.hasViewableArtifact).toBe(true);
    expect(classNode?.reason).toContain("重新生成中，旧产物仍可查看");
  });

  it("marks generated requirement models without SVG as structured-only stale nodes", () => {
    const graph = buildLineageGraph(
      input({
        rules: [baseRule],
        models: { usecase: model("usecase") },
        generatedDiagrams: ["usecase"],
      }),
    );

    const useCaseNode = graph.nodes.find(
      (node) => node.id === "requirement-model:usecase",
    );
    expect(useCaseNode?.status).toBe("stale");
    expect(useCaseNode?.hasViewableArtifact).toBe(false);
    expect(useCaseNode?.reason).toContain("结构化模型已生成，但 SVG 尚未生成");
  });

  it("marks generated design models without SVG as structured-only stale nodes", () => {
    const graph = buildLineageGraph(
      input({
        designModels: {
          class: designModel("class"),
        },
        generatedDesignDiagrams: ["class"],
      }),
    );

    const classNode = graph.nodes.find((node) => node.id === "design-model:class");
    expect(classNode?.status).toBe("stale");
    expect(classNode?.hasViewableArtifact).toBe(false);
    expect(classNode?.reason).toContain("结构化模型已生成，但 SVG 尚未生成");
  });

  it("projects active server runs into running lineage nodes after reload", () => {
    const graph = buildLineageGraph(
      input({
        projectRuns: [
          {
            runId: "server-design-active",
            status: "running",
            stage: "generate_design_models",
            runKind: "design",
            requestedDiagrams: ["deployment"],
          },
          {
            runId: "server-document-active",
            status: "queued",
            runKind: "document",
            documentKind: "softwareDesignSpec",
          },
        ],
      }),
    );

    expect(graph.nodes.find((node) => node.id === "design-model:deployment")?.status).toBe(
      "running",
    );
    expect(
      graph.nodes.find((node) => node.id === "document:softwareDesignSpec")?.status,
    ).toBe("running");
    expect(graph.summary.running).toBeGreaterThanOrEqual(2);
  });

  it("collects only directed upstream and downstream impact paths", () => {
    const graph = buildLineageGraph(
      input({
        rules: [baseRule],
        models: {
          usecase: model("usecase"),
          class: model("class"),
        },
        generatedDiagrams: ["usecase", "class"],
        designModels: {
          class: designModel("class"),
          sequence: designModel("sequence"),
        },
        generatedDesignDiagrams: ["sequence", "class"],
      }),
    );

    const path = collectLineagePath(graph, "requirement-model:class");

    expect(path.has("rule:REQ-001")).toBe(true);
    expect(path.has("design-model:class")).toBe(true);
    expect(path.has("document:requirementsSpec")).toBe(true);
    expect(path.has("requirement-model:usecase")).toBe(false);
  });
});
