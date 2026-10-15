// Owns workspace shell UI state for selected tabs, active workspace routes, and persisted navigation choices.
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { FeasibilityArtifactKind } from "@uml-platform/contracts";
import {
  DESIGN_DIAGRAM_META,
  DIAGRAM_META,
  type DesignDiagramType,
  type DiagramType,
} from "../../entities/diagram/model";

const DEFAULT_SELECTION: WorkspaceSelection = {
  kind: "system-requirements",
  label: "系统需求",
};

export type WorkspaceSelection =
  | { kind: "system-requirements"; label: string }
  | { kind: "requirements-text"; label: string }
  | {
      kind: "feasibility-home";
      label: string;
      initialSelectedArtifacts?: FeasibilityArtifactKind[];
    }
  | { kind: "feasibility-business-flow"; label: string }
  | { kind: "feasibility-context"; label: string }
  | { kind: "feasibility-context-trace"; label: string }
  | { kind: "feasibility-context-elements"; label: string }
  | { kind: "feasibility-context-relations"; label: string }
  | {
      kind: "feasibility-context-element";
      elementKind: string;
      elementId: string;
      label: string;
    }
  | {
      kind: "feasibility-context-relationship";
      relationshipId: string;
      label: string;
    }
  | { kind: "feasibility-business-flow-trace"; label: string }
  | { kind: "feasibility-business-flow-elements"; label: string }
  | { kind: "feasibility-business-flow-relations"; label: string }
  | {
      kind: "feasibility-business-flow-element";
      elementKind: string;
      elementId: string;
      label: string;
    }
  | {
      kind: "feasibility-business-flow-relationship";
      relationshipId: string;
      label: string;
    }
  | { kind: "feasibility-implementation"; candidateId?: string; label: string }
  | { kind: "requirement-trace-matrix"; diagram: DiagramType; modelId?: string; label: string }
  | { kind: "diagram"; diagram: DiagramType; modelId?: string; label: string }
  | { kind: "design-home"; label: string }
  | {
      kind: "design-trace-matrix";
      diagram: DesignDiagramType;
      modelId?: string;
      label: string;
    }
  | { kind: "test-home"; label: string }
  | {
      kind: "design-diagram";
      diagram: DesignDiagramType;
      label: string;
      modelId?: string;
    }
  | { kind: "documents-home"; label: string }
  | { kind: "document-editor"; documentId: string; label: string }
  | {
      kind: "design-diagram-element";
      diagram: DesignDiagramType;
      modelId?: string;
      elementKind: string;
      elementId: string;
      label: string;
    }
  | {
      kind: "design-diagram-relationship";
      diagram: DesignDiagramType;
      modelId?: string;
      relationshipId: string;
      label: string;
    }
  | {
      kind: "diagram-element";
      diagram: DiagramType;
      modelId?: string;
      elementKind: string;
      elementId: string;
      label: string;
    }
  | {
      kind: "diagram-relationship";
      diagram: DiagramType;
      modelId?: string;
      relationshipId: string;
      label: string;
    }
  ;



export interface WorkspaceTab {
  id: string;
  label: string;
  selection: WorkspaceSelection;
}

interface WorkspaceShellState {
  selection: WorkspaceSelection;
  openTabs: WorkspaceTab[];
  activeTabId: string;
  openWorkspaceTab: (selection: WorkspaceSelection) => void;
  activateWorkspaceTab: (tabId: string) => void;
  restoreWorkspaceTabs: (tabs: WorkspaceTab[], activeTabId: string) => void;
  closeWorkspaceTab: (tabId: string) => void;
  closeOtherWorkspaceTabs: (tabId: string) => void;
  closeWorkspaceTabsByStage: (tabId: string) => void;
  openSystemRequirements: () => void;
  openRequirementsText: () => void;
  openFeasibilityHome: (options?: {
    initialSelectedArtifacts?: FeasibilityArtifactKind[];
  }) => void;
  openFeasibilityBusinessFlow: () => void;
  openFeasibilityContext: () => void;
  openFeasibilityContextTrace: () => void;
  openFeasibilityContextElements: () => void;
  openFeasibilityContextRelations: () => void;
  openFeasibilityContextElement: (
    elementKind: string,
    elementId: string,
    label: string,
  ) => void;
  openFeasibilityContextRelationship: (
    relationshipId: string,
    label: string,
  ) => void;
  openFeasibilityBusinessFlowTrace: () => void;
  openFeasibilityBusinessFlowElements: () => void;
  openFeasibilityBusinessFlowRelations: () => void;
  openFeasibilityBusinessFlowElement: (
    elementKind: string,
    elementId: string,
    label: string,
  ) => void;
  openFeasibilityBusinessFlowRelationship: (
    relationshipId: string,
    label: string,
  ) => void;
  openFeasibilityImplementation: (candidateId?: string, label?: string) => void;
  openRequirementTraceMatrix: (
    diagram: DiagramType,
    modelId?: string,
    label?: string,
  ) => void;
  openDiagram: (diagram: DiagramType, modelId?: string, label?: string) => void;
  openDesignHome: () => void;
  openDesignTraceMatrix: (
    diagram: DesignDiagramType,
    modelId?: string,
    label?: string,
  ) => void;
  openTestHome: () => void;
  openDesignDiagram: (
    diagram: DesignDiagramType,
    modelId?: string,
    label?: string,
  ) => void;
  openDocumentsHome: () => void;
  openDocumentEditor: (documentId: string, label: string) => void;
  openDesignDiagramElement: (
    diagram: DesignDiagramType,
    elementKind: string,
    elementId: string,
    label: string,
    modelId?: string,
  ) => void;
  openDesignDiagramRelationship: (
    diagram: DesignDiagramType,
    relationshipId: string,
    label: string,
    modelId?: string,
  ) => void;
  openDiagramElement: (
    diagram: DiagramType,
    elementKind: string,
    elementId: string,
    label: string,
    modelId?: string,
  ) => void;
  openDiagramRelationship: (
    diagram: DiagramType,
    relationshipId: string,
    label: string,
    modelId?: string,
  ) => void;
  
}

const WorkspaceShellContext = createContext<WorkspaceShellState | null>(null);

function tabIdForSelection(selection: WorkspaceSelection) {
  switch (selection.kind) {
    case "system-requirements":
      return "system-requirements";
    case "requirements-text":
      return "requirements";
    case "feasibility-home":
      return "feasibility";
    case "feasibility-business-flow":
      return "feasibility:business-flow";
    case "feasibility-context":
      return "feasibility:context";
    case "feasibility-context-trace":
      return "feasibility:context:trace";
    case "feasibility-context-elements":
      return "feasibility:context:elements";
    case "feasibility-context-relations":
      return "feasibility:context:relations";
    case "feasibility-context-element":
      return "feasibility:context";
    case "feasibility-context-relationship":
      return "feasibility:context";
    case "feasibility-business-flow-trace":
      return "feasibility:business-flow:trace";
    case "feasibility-business-flow-elements":
      return "feasibility:business-flow:elements";
    case "feasibility-business-flow-relations":
      return "feasibility:business-flow:relations";
    case "feasibility-business-flow-element":
      return "feasibility:business-flow";
    case "feasibility-business-flow-relationship":
      return "feasibility:business-flow";
    case "feasibility-implementation":
      return "feasibility:implementation";
    case "requirement-trace-matrix":
      return `requirements:trace-matrix:${selection.modelId ?? selection.diagram}`;
    case "diagram":
    case "diagram-element":
    case "diagram-relationship":
      return `diagram:${selection.modelId ?? selection.diagram}`;
    case "design-home":
      return "design";
    case "design-trace-matrix":
      return `design:trace-matrix:${selection.modelId ?? selection.diagram}`;
    case "test-home":
      return "test";
    case "design-diagram":
    case "design-diagram-element":
    case "design-diagram-relationship":
      return `design-diagram:${selection.modelId ?? selection.diagram}`;
    case "documents-home":
      return "documents";
    case "document-editor":
      return `document:${selection.documentId}`;
    
  }
}

function tabLabelForSelection(selection: WorkspaceSelection) {
  switch (selection.kind) {
    case "system-requirements":
      return "系统需求";
    case "requirements-text":
      return "需求模型";
    case "feasibility-home":
    case "feasibility-business-flow":
    case "feasibility-business-flow-trace":
    case "feasibility-business-flow-elements":
    case "feasibility-business-flow-relations":
    case "feasibility-business-flow-element":
    case "feasibility-business-flow-relationship":
    case "feasibility-context":
    case "feasibility-context-trace":
    case "feasibility-context-elements":
    case "feasibility-context-relations":
    case "feasibility-context-element":
    case "feasibility-context-relationship":
    case "feasibility-implementation":
      return selection.label;
    case "requirement-trace-matrix":
      return selection.label;
    case "diagram":
    case "diagram-element":
    case "diagram-relationship":
      return selection.label || DIAGRAM_META[selection.diagram].label;
    case "design-home":
      return "设计模型";
    case "design-trace-matrix":
      return selection.label;
    case "test-home":
      return "测试";
    case "design-diagram":
    case "design-diagram-element":
    case "design-diagram-relationship":
      return selection.label || DESIGN_DIAGRAM_META[selection.diagram].label;
    case "documents-home":
      return "说明书";
    case "document-editor":
      return selection.label;
    
  }
}

function createWorkspaceTab(selection: WorkspaceSelection): WorkspaceTab {
  return {
    id: tabIdForSelection(selection),
    label: tabLabelForSelection(selection),
    selection,
  };
}

export type WorkspaceStage = "system-requirements" | "feasibility" | "requirements" | "design" | "test" | "documents";

export function stageForSelection(selection: WorkspaceSelection): WorkspaceStage {
  switch (selection.kind) {
    case "system-requirements":
      return "system-requirements";
    case "feasibility-home":
    case "feasibility-business-flow":
    case "feasibility-business-flow-trace":
    case "feasibility-business-flow-elements":
    case "feasibility-business-flow-relations":
    case "feasibility-business-flow-element":
    case "feasibility-business-flow-relationship":
    case "feasibility-context":
    case "feasibility-context-trace":
    case "feasibility-context-elements":
    case "feasibility-context-relations":
    case "feasibility-context-element":
    case "feasibility-context-relationship":
    case "feasibility-implementation":
      return "feasibility";
    case "requirements-text":
    case "requirement-trace-matrix":
    case "diagram":
    case "diagram-element":
    case "diagram-relationship":
      return "requirements";
    case "design-home":
    case "design-trace-matrix":
    case "design-diagram":
    case "design-diagram-element":
    case "design-diagram-relationship":
      return "design";
    case "test-home":
      return "test";
    case "documents-home":
    case "document-editor":
      return "documents";
    
  }
}

export function WorkspaceShellProvider({ children }: { children: ReactNode }) {
  const defaultTab = useMemo(() => createWorkspaceTab(DEFAULT_SELECTION), []);
  const [openTabs, setOpenTabs] = useState<WorkspaceTab[]>([defaultTab]);
  const [activeTabId, setActiveTabId] = useState(defaultTab.id);
  const selection =
    openTabs.find((tab) => tab.id === activeTabId)?.selection ?? DEFAULT_SELECTION;

  const openWorkspaceTab = useCallback((nextSelection: WorkspaceSelection) => {
    const tab = createWorkspaceTab(nextSelection);
    setOpenTabs((current) => {
      const existing = current.find((item) => item.id === tab.id);
      if (existing) {
        return current.map((item) => (item.id === tab.id ? tab : item));
      }
      return [...current, tab];
    });
    setActiveTabId(tab.id);
  }, []);

  const activateWorkspaceTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  // Guided tours may visit several stages; restore the exact prior tab set on exit.
  const restoreWorkspaceTabs = useCallback((tabs: WorkspaceTab[], previousActiveTabId: string) => {
    const restored = tabs.length ? tabs : [defaultTab];
    setOpenTabs(restored);
    setActiveTabId(restored.some((tab) => tab.id === previousActiveTabId)
      ? previousActiveTabId
      : restored[0].id);
  }, [defaultTab]);

  const closeWorkspaceTab = useCallback(
    (tabId: string) => {
      setOpenTabs((current) => {
        const closingIndex = current.findIndex((tab) => tab.id === tabId);
        if (closingIndex < 0) return current;
        if (current.length === 1) {
          setActiveTabId(defaultTab.id);
          return [defaultTab];
        }

        const next = current.filter((tab) => tab.id !== tabId);
        if (activeTabId === tabId) {
          const nextActive = next[Math.min(closingIndex, next.length - 1)];
          setActiveTabId(nextActive?.id ?? defaultTab.id);
        }
        return next;
      });
    },
    [activeTabId, defaultTab],
  );

  const closeOtherWorkspaceTabs = useCallback(
    (tabId: string) => {
      setOpenTabs((current) => {
        const target = current.find((tab) => tab.id === tabId) ?? defaultTab;
        setActiveTabId(target.id);
        return [target];
      });
    },
    [defaultTab],
  );

  const closeWorkspaceTabsByStage = useCallback(
    (tabId: string) => {
      setOpenTabs((current) => {
        const target = current.find((tab) => tab.id === tabId);
        if (!target) return current;
        const targetStage = stageForSelection(target.selection);
        const next = current.filter((tab) => {
          if (tab.id === target.id) return true;
          return stageForSelection(tab.selection) !== targetStage;
        });
        if (!next.some((tab) => tab.id === activeTabId)) {
          setActiveTabId(target.id);
        }
        return next.length > 0 ? next : [defaultTab];
      });
    },
    [activeTabId, defaultTab],
  );

  const openSystemRequirements = useCallback(() => {
    openWorkspaceTab({ kind: "system-requirements", label: "系统需求" });
  }, [openWorkspaceTab]);

  const openRequirementsText = useCallback(() => {
    openWorkspaceTab({ kind: "requirements-text", label: "需求模型" });
  }, [openWorkspaceTab]);

  const openFeasibilityHome = useCallback(
    (options?: { initialSelectedArtifacts?: FeasibilityArtifactKind[] }) =>
      openWorkspaceTab({
        kind: "feasibility-home",
        label: "可行性分析",
        initialSelectedArtifacts: options?.initialSelectedArtifacts,
      }),
    [openWorkspaceTab],
  );
  const openFeasibilityBusinessFlow = useCallback(() => openWorkspaceTab({ kind: "feasibility-business-flow", label: "业务流程图" }), [openWorkspaceTab]);
  const openFeasibilityContext = useCallback(() => openWorkspaceTab({ kind: "feasibility-context", label: "系统环境图" }), [openWorkspaceTab]);
  const openFeasibilityContextTrace = useCallback(() => openWorkspaceTab({ kind: "feasibility-context-trace", label: "上下文跟踪矩阵" }), [openWorkspaceTab]);
  const openFeasibilityContextElements = useCallback(() => openWorkspaceTab({ kind: "feasibility-context-elements", label: "上下文元素" }), [openWorkspaceTab]);
  const openFeasibilityContextRelations = useCallback(() => openWorkspaceTab({ kind: "feasibility-context-relations", label: "上下文关系" }), [openWorkspaceTab]);
  const openFeasibilityContextElement = useCallback((elementKind: string, elementId: string, label: string) => {
    openWorkspaceTab({ kind: "feasibility-context-element", elementKind, elementId, label });
  }, [openWorkspaceTab]);
  const openFeasibilityContextRelationship = useCallback((relationshipId: string, label: string) => {
    openWorkspaceTab({ kind: "feasibility-context-relationship", relationshipId, label });
  }, [openWorkspaceTab]);
  const openFeasibilityBusinessFlowTrace = useCallback(() => openWorkspaceTab({ kind: "feasibility-business-flow-trace", label: "流程跟踪矩阵" }), [openWorkspaceTab]);
  const openFeasibilityBusinessFlowElements = useCallback(() => openWorkspaceTab({ kind: "feasibility-business-flow-elements", label: "流程元素" }), [openWorkspaceTab]);
  const openFeasibilityBusinessFlowRelations = useCallback(() => openWorkspaceTab({ kind: "feasibility-business-flow-relations", label: "流程关系" }), [openWorkspaceTab]);
  const openFeasibilityBusinessFlowElement = useCallback((elementKind: string, elementId: string, label: string) => {
    openWorkspaceTab({ kind: "feasibility-business-flow-element", elementKind, elementId, label });
  }, [openWorkspaceTab]);
  const openFeasibilityBusinessFlowRelationship = useCallback((relationshipId: string, label: string) => {
    openWorkspaceTab({ kind: "feasibility-business-flow-relationship", relationshipId, label });
  }, [openWorkspaceTab]);
  const openFeasibilityImplementation = useCallback((candidateId?: string, label = "实现方案") => {
    openWorkspaceTab({ kind: "feasibility-implementation", candidateId, label });
  }, [openWorkspaceTab]);

  const openRequirementTraceMatrix = useCallback((
    diagram: DiagramType,
    modelId?: string,
    label?: string,
  ) => {
    openWorkspaceTab({
      kind: "requirement-trace-matrix",
      diagram,
      modelId,
      label: label ? `跟踪矩阵 · ${label}` : `跟踪矩阵 · ${DIAGRAM_META[diagram].label}`,
    });
  }, [openWorkspaceTab]);

  const openDiagram = useCallback((diagram: DiagramType, modelId?: string, label?: string) => {
    openWorkspaceTab({
      kind: "diagram",
      diagram,
      modelId,
      label: label ?? DIAGRAM_META[diagram].label,
    });
  }, [openWorkspaceTab]);

  const openDesignHome = useCallback(() => {
    openWorkspaceTab({ kind: "design-home", label: "设计模型" });
  }, [openWorkspaceTab]);

  const openDesignTraceMatrix = useCallback((
    diagram: DesignDiagramType,
    modelId?: string,
    label?: string,
  ) => {
    openWorkspaceTab({
      kind: "design-trace-matrix",
      diagram,
      modelId,
      label: label ? `跟踪矩阵 · ${label}` : `跟踪矩阵 · ${DESIGN_DIAGRAM_META[diagram].label}`,
    });
  }, [openWorkspaceTab]);

  const openTestHome = useCallback(() => {
    openWorkspaceTab({ kind: "test-home", label: "测试" });
  }, [openWorkspaceTab]);

  const openDesignDiagram = useCallback((
    diagram: DesignDiagramType,
    modelId?: string,
    label?: string,
  ) => {
    openWorkspaceTab({
      kind: "design-diagram",
      diagram,
      modelId,
      label: label ?? DESIGN_DIAGRAM_META[diagram].label,
    });
  }, [openWorkspaceTab]);

  const openDocumentsHome = useCallback(() => {
    openWorkspaceTab({ kind: "documents-home", label: "说明书" });
  }, [openWorkspaceTab]);

  const openDocumentEditor = useCallback(
    (documentId: string, label: string) => {
      openWorkspaceTab({ kind: "document-editor", documentId, label });
    },
    [openWorkspaceTab],
  );

  const openDesignDiagramElement = useCallback(
    (
      diagram: DesignDiagramType,
      elementKind: string,
      elementId: string,
      label: string,
      modelId?: string,
    ) => {
      openWorkspaceTab({
        kind: "design-diagram-element",
        diagram,
        modelId,
        elementKind,
        elementId,
        label,
      });
    },
    [openWorkspaceTab],
  );

  const openDesignDiagramRelationship = useCallback(
    (
      diagram: DesignDiagramType,
      relationshipId: string,
      label: string,
      modelId?: string,
    ) => {
      openWorkspaceTab({
        kind: "design-diagram-relationship",
        diagram,
        modelId,
        relationshipId,
        label,
      });
    },
    [openWorkspaceTab],
  );

  const openDiagramElement = useCallback(
    (
      diagram: DiagramType,
      elementKind: string,
      elementId: string,
      label: string,
      modelId?: string,
    ) => {
      openWorkspaceTab({
        kind: "diagram-element",
        diagram,
        modelId,
        elementKind,
        elementId,
        label,
      });
    },
    [openWorkspaceTab],
  );

  const openDiagramRelationship = useCallback(
    (
      diagram: DiagramType,
      relationshipId: string,
      label: string,
      modelId?: string,
    ) => {
      openWorkspaceTab({
        kind: "diagram-relationship",
        diagram,
        modelId,
        relationshipId,
        label,
      });
    },
    [openWorkspaceTab],
  );

  

  const value = useMemo(
    () => ({
      selection,
      openTabs,
      activeTabId,
      openWorkspaceTab,
      activateWorkspaceTab,
      restoreWorkspaceTabs,
      closeWorkspaceTab,
      closeOtherWorkspaceTabs,
      closeWorkspaceTabsByStage,
      openSystemRequirements,
      openRequirementsText,
      openFeasibilityHome,
      openFeasibilityBusinessFlow,
      openFeasibilityContext,
      openFeasibilityContextTrace,
      openFeasibilityBusinessFlowTrace,
      openFeasibilityContextElements,
      openFeasibilityBusinessFlowElements,
      openFeasibilityContextRelations,
      openFeasibilityBusinessFlowRelations,
      openFeasibilityContextElement,
      openFeasibilityBusinessFlowElement,
      openFeasibilityContextRelationship,
      openFeasibilityBusinessFlowRelationship,
      openFeasibilityImplementation,
      openRequirementTraceMatrix,
      openDiagram,
      openDesignHome,
      openDesignTraceMatrix,
      openTestHome,
      openDesignDiagram,
      openDocumentsHome,
      openDocumentEditor,
      openDesignDiagramElement,
      openDesignDiagramRelationship,
      openDiagramElement,
      openDiagramRelationship,
      
    }),
    [
      activeTabId,
      openTabs,
      openRequirementsText,
      openSystemRequirements,
      openFeasibilityHome,
      openFeasibilityBusinessFlow,
      openFeasibilityContext,
      openFeasibilityContextTrace,
      openFeasibilityBusinessFlowTrace,
      openFeasibilityContextElements,
      openFeasibilityBusinessFlowElements,
      openFeasibilityContextRelations,
      openFeasibilityBusinessFlowRelations,
      openFeasibilityContextElement,
      openFeasibilityBusinessFlowElement,
      openFeasibilityContextRelationship,
      openFeasibilityBusinessFlowRelationship,
      openFeasibilityImplementation,
      openRequirementTraceMatrix,
      openWorkspaceTab,
      activateWorkspaceTab,
      restoreWorkspaceTabs,
      closeWorkspaceTab,
      closeOtherWorkspaceTabs,
      closeWorkspaceTabsByStage,
      openDiagram,
      openDesignHome,
      openDesignTraceMatrix,
      openTestHome,
      openDesignDiagram,
      openDocumentsHome,
      openDocumentEditor,
      openDesignDiagramElement,
      openDesignDiagramRelationship,
      openDiagramElement,
      openDiagramRelationship,
      
      selection,
    ],
  );

  return (
    <WorkspaceShellContext.Provider value={value}>
      {children}
    </WorkspaceShellContext.Provider>
  );
}

export function useOptionalWorkspaceShell() {
  return useContext(WorkspaceShellContext);
}

export function useWorkspaceShell() {
  const value = useContext(WorkspaceShellContext);
  if (!value) {
    throw new Error("useWorkspaceShell must be used within WorkspaceShellProvider");
  }
  return value;
}

export function getSelectionKey(selection: WorkspaceSelection) {
  switch (selection.kind) {
    case "system-requirements":
      return "system-requirements";
    case "requirements-text":
      return "requirements";
    case "feasibility-home":
      return "feasibility";
    case "feasibility-business-flow":
      return "feasibility:business-flow";
    case "feasibility-context":
      return "feasibility:context";
    case "feasibility-context-trace":
      return "feasibility:context:trace";
    case "feasibility-context-elements":
      return "feasibility:context:elements";
    case "feasibility-context-relations":
      return "feasibility:context:relations";
    case "feasibility-context-element":
      return `feasibility-context-element:context:${selection.elementKind}:${selection.elementId}`;
    case "feasibility-context-relationship":
      return `feasibility-context-relationship:context:${selection.relationshipId}`;
    case "feasibility-business-flow-trace":
      return "feasibility:business-flow:trace";
    case "feasibility-business-flow-elements":
      return "feasibility:business-flow:elements";
    case "feasibility-business-flow-relations":
      return "feasibility:business-flow:relations";
    case "feasibility-business-flow-element":
      return `feasibility-business-flow-element:feasibility-business-flow:${selection.elementKind}:${selection.elementId}`;
    case "feasibility-business-flow-relationship":
      return `feasibility-business-flow-relationship:feasibility-business-flow:${selection.relationshipId}`;
    case "feasibility-implementation":
      return selection.candidateId
        ? `feasibility:implementation:${selection.candidateId}`
        : "feasibility:implementation";
    case "requirement-trace-matrix":
      return `requirements:trace-matrix:${selection.modelId ?? selection.diagram}`;
    case "diagram":
      return `diagram:${selection.modelId ?? selection.diagram}`;
    case "design-home":
      return "design";
    case "design-trace-matrix":
      return `design:trace-matrix:${selection.modelId ?? selection.diagram}`;
    case "test-home":
      return "test";
    case "design-diagram":
      return `design-diagram:${selection.modelId ?? selection.diagram}`;
    case "documents-home":
      return "documents";
    case "document-editor":
      return `document:${selection.documentId}`;
    case "design-diagram-element":
      return `design-diagram-element:${selection.modelId ?? selection.diagram}:${selection.elementKind}:${selection.elementId}`;
    case "design-diagram-relationship":
      return `design-diagram-relationship:${selection.modelId ?? selection.diagram}:${selection.relationshipId}`;
    case "diagram-element":
      return `diagram-element:${selection.modelId ?? selection.diagram}:${selection.elementKind}:${selection.elementId}`;
    case "diagram-relationship":
      return `diagram-relationship:${selection.modelId ?? selection.diagram}:${selection.relationshipId}`;
    
  }
}
