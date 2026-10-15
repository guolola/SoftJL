// Verifies saved run history snapshots restore partial design artifacts consistently.
import { describe, expect, it } from "vitest";
import type {
  
  DesignDiagramModelSpec,
  DesignRunSnapshot,
  DocumentRunSnapshot,
} from "@uml-platform/contracts";
import { createRestoredSnapshotPlan } from "./history-restore";

function tableDesignModel(): DesignDiagramModelSpec {
  return {
    diagramKind: "table",
    modelId: "table",
    title: "数据库设计",
    summary: "用户表。",
    notes: [],
    tables: [
      {
        id: "users",
        name: "users",
        constraints: [],
        relationalConstraints: [{ id: "pk_users", type: "primary-key", columnIds: ["id"] }],
        columns: [
          {
            id: "id",
            name: "id",
            dataType: "VARCHAR",
            constraints: [],
            isPrimaryKey: true,
            isForeignKey: false,
            nullable: false,
          },
        ],
      },
    ],
    relationships: [],
  };
}

function failedPartialDesignSnapshot(): DesignRunSnapshot {
  const table = tableDesignModel();
  return {
    runId: "design-partial-history",
    requirementText: "简单社交软件",
    selectedDiagrams: ["table", "component"],
    requestedDiagrams: ["table", "component"],
    rules: [],
    requirementBaseline: null,
    coverageMatrix: null,
    traceabilityMatrix: null,
    requirementModels: [],
    requirementModelTraceability: [],
    models: [table],
    designModelTraceability: [],
    plantUml: [
      {
        diagramKind: "table",
        modelId: "table",
        source: "@startuml\n@enduml",
      },
    ],
    svgArtifacts: [
      {
        diagramKind: "table",
        modelId: "table",
        svg: "<svg data-kind=\"table\" />",
        renderMeta: {
          engine: "plantuml",
          generatedAt: "2026-06-18T00:00:00.000Z",
          sourceLength: 18,
          durationMs: 1,
        },
      },
    ],
    diagramErrors: {
      component: {
        stage: "render_svg",
        error: {
          code: "RUN_RENDER_FAILED",
          message: "组件图渲染失败",
          category: "render",
          retryable: true,
        },
      },
    },
    designTrace: [],
    currentStage: "render_svg",
    status: "failed",
    error: {
      code: "RUN_RENDER_FAILED",
      message: "组件图渲染失败",
      category: "render",
      retryable: true,
    },
  };
}

function completedDocumentSnapshot(): DocumentRunSnapshot {
  return {
    runId: "document-history",
    documentKind: "requirementsSpec",
    requirementText: "说明书历史中的旧需求",
    documentId: "doc-history",
    sections: [],
    fileName: "requirements.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    byteLength: 1024,
    missingArtifacts: [],
    currentStage: "render_document_file",
    status: "completed",
    error: null,
  };
}

function completedCodeSnapshot(): CodeRunSnapshot {
  const table = tableDesignModel();
  return {
    runId: "code-history",
    requirementText: "简单社交软件",
    rules: [],
    requirementBaseline: null,
    coverageMatrix: null,
    traceabilityMatrix: null,
    designModels: [table],
    designPlantUml: [
      {
        diagramKind: "table",
        modelId: "table",
        source: "@startuml\nclass users\n@enduml",
      },
    ],
    spec: null,
    businessLogic: null,
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    filePlan: null,
    
    
    
    
    
    
    files: {
      "/src/App.tsx": "export default function App() { return null; }",
    },
    entryFile: "/src/App.tsx",
    dependencies: {},
    agentPlan: [],
    generationMode: "continue",
    changedFileCount: 1,
    diagnostics: [],
    
    currentStage: "verify_code_preview",
    status: "completed",
    error: null,
  };
}

describe("createRestoredSnapshotPlan", () => {
  it("restores successful design artifacts from failed partial snapshots", () => {
    const plan = createRestoredSnapshotPlan({
      snapshot: failedPartialDesignSnapshot(),
      rulesVersion: 1,
      textVersion: 1,
    });

    expect(plan.artifacts?.kind).toBe("design");
    expect(Object.keys(plan.artifacts?.designModels ?? {})).toEqual(["table"]);
    expect(Object.keys(plan.artifacts?.designSvgArtifacts ?? {})).toEqual([
      "table",
    ]);
    expect(plan.artifacts?.generatedDesignDiagrams).toEqual(["table"]);
    expect(plan.artifacts?.designDiagramErrors.component?.error.code).toBe(
      "RUN_RENDER_FAILED",
    );
  });

  it("rejects document snapshots because they are not workspace restore artifacts", () => {
    expect(() =>
      createRestoredSnapshotPlan({
        snapshot: completedDocumentSnapshot(),
        rulesVersion: 1,
        textVersion: 1,
      }),
    ).toThrow("说明书快照不能恢复为项目工作台。");
  });

  
});
