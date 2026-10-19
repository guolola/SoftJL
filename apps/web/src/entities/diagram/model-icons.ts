// Owns model-category SVGs so navigation, cards, lineage and generation tasks share one visual vocabulary.
import { createLucideIcon, Wrench, type LucideIcon } from "lucide-react";
import type { FeasibilityArtifactKind } from "@uml-platform/contracts";
import type { DesignDiagramType, DiagramType } from "./model";

// Keep the same 24px grid and stroke contract as shared UI icons. Model symbols remain
// recognizable at 16px; lifecycle state is shown separately rather than replacing the symbol.
const SystemContext = createLucideIcon("ModelSystemContext", [
  ["rect", { key: "system", x: "8", y: "7", width: "8", height: "10", rx: "1" }],
  ["circle", { key: "actor", cx: "3", cy: "7", r: "2" }],
  ["path", { key: "actor-body", d: "M3 9v6m-2-3h4m0 0h3" }],
  ["rect", { key: "external-system", x: "19", y: "9", width: "4", height: "6", rx: "1" }],
  ["path", { key: "interaction", d: "M16 12h3m-9-1h4" }],
]);

const BusinessSystemFlow = createLucideIcon("ModelBusinessSystemFlow", [
  ["rect", { key: "lanes", x: "2", y: "2", width: "20", height: "20", rx: "1" }],
  ["path", { key: "lane-headers", d: "M12 2v20M2 6h20" }],
  ["rect", { key: "business-action", x: "5", y: "9", width: "5", height: "4", rx: "1" }],
  ["rect", { key: "system-action", x: "14", y: "16", width: "5", height: "4", rx: "1" }],
  ["path", { key: "handoff", d: "M10 11h6v5m-2-2 2 2 2-2" }],
]);

const FunctionStructure = createLucideIcon("ModelFunctionStructure", [
  ["rect", { key: "parent", x: "9", y: "2", width: "6", height: "5", rx: "1" }],
  ["rect", { key: "left-child", x: "2", y: "17", width: "6", height: "5", rx: "1" }],
  ["rect", { key: "right-child", x: "16", y: "17", width: "6", height: "5", rx: "1" }],
  ["path", { key: "decomposition", d: "M12 7v5M5 17v-5h14v5" }],
]);

const BusinessActivity = createLucideIcon("ModelBusinessActivity", [
  ["circle", { key: "start", cx: "12", cy: "3", r: "1.5", fill: "currentColor" }],
  ["rect", { key: "action", x: "8", y: "7", width: "8", height: "4", rx: "1.5" }],
  ["path", { key: "control-flow", d: "M12 4.5V7m0 4v2m-4 4H3v4m13-4h5v4" }],
  ["path", { key: "decision", d: "m12 13 4 4-4 4-4-4Z" }],
]);

const UseCase = createLucideIcon("ModelUseCase", [
  ["circle", { key: "actor", cx: "3", cy: "5", r: "2" }],
  ["path", { key: "actor-body", d: "M3 7v8m-2-5h4m-4 9 2-4 2 4" }],
  ["rect", { key: "boundary", x: "9", y: "2", width: "13", height: "20", rx: "1" }],
  ["ellipse", { key: "first-use-case", cx: "15.5", cy: "8", rx: "4", ry: "2" }],
  ["ellipse", { key: "second-use-case", cx: "15.5", cy: "16", rx: "4", ry: "2" }],
  ["path", { key: "participation", d: "m5 10 6-2m-6 2 6 6" }],
]);

const DomainConcept = createLucideIcon("ModelDomainConcept", [
  ["rect", { key: "first-concept", x: "2", y: "3", width: "7", height: "6", rx: "1" }],
  ["rect", { key: "second-concept", x: "15", y: "3", width: "7", height: "6", rx: "1" }],
  ["rect", { key: "third-concept", x: "9", y: "16", width: "7", height: "6", rx: "1" }],
  ["path", { key: "associations", d: "M9 6h6M5 9v4h7v3" }],
]);

const PrototypeInterface = createLucideIcon("ModelPrototypeInterface", [
  ["rect", { key: "first-screen", x: "2", y: "3", width: "12", height: "9", rx: "1" }],
  ["rect", { key: "second-screen", x: "10", y: "13", width: "12", height: "9", rx: "1" }],
  ["path", { key: "screen-headers", d: "M2 6h12m-4 10h12" }],
  ["path", { key: "screen-relationship", d: "M6 12v6h4" }],
]);

const DeploymentRequirement = createLucideIcon("ModelDeploymentRequirement", [
  ["rect", { key: "first-environment", x: "2", y: "3", width: "11", height: "6", rx: "1" }],
  ["rect", { key: "second-environment", x: "2", y: "15", width: "11", height: "6", rx: "1" }],
  ["path", { key: "environment-indicators", d: "M5 6h.01M5 18h.01" }],
  ["rect", { key: "external-system", x: "18", y: "9", width: "4", height: "6", rx: "1" }],
  ["path", { key: "communication-constraints", d: "M13 6h3v6h2M13 18h3v-6" }],
]);

// Analysis uses collaborating objects; realization adds object headers and an activation bar.
const RequirementAnalysis = createLucideIcon("ModelRequirementAnalysis", [
  ["circle", { key: "boundary-object", cx: "4", cy: "5", r: "2" }],
  ["circle", { key: "control-object", cx: "12", cy: "5", r: "2" }],
  ["circle", { key: "entity-object", cx: "20", cy: "5", r: "2" }],
  ["path", { key: "lifelines", d: "M4 7v15M12 7v15M20 7v15", strokeDasharray: "2 3" }],
  ["path", { key: "messages", d: "M4 11h8m-2-2 2 2-2 2m2 5h8m-2-2 2 2-2 2" }],
]);

const Architecture = createLucideIcon("ModelArchitecture", [
  ["rect", { key: "presentation-layer", x: "3", y: "2", width: "18", height: "4", rx: "1" }],
  ["rect", { key: "business-layer", x: "3", y: "10", width: "18", height: "4", rx: "1" }],
  ["rect", { key: "data-layer", x: "3", y: "18", width: "18", height: "4", rx: "1" }],
  ["path", { key: "layers-and-modules", d: "M12 6v4m0 4v4m-3-8v4m6-4v4" }],
]);

const ImplementationSequence = createLucideIcon("ModelImplementationSequence", [
  ["rect", { key: "caller", x: "2", y: "2", width: "6", height: "4", rx: "1" }],
  ["rect", { key: "callee", x: "16", y: "2", width: "6", height: "4", rx: "1" }],
  ["path", { key: "lifelines", d: "M5 6v16M19 6v4m0 8v4", strokeDasharray: "2 3" }],
  ["rect", { key: "activation", x: "17", y: "10", width: "4", height: "8" }],
  ["path", { key: "call", d: "M5 10h12m-2-2 2 2-2 2" }],
  ["path", { key: "return", d: "M17 18H5m2-2-2 2 2 2", strokeDasharray: "2 2" }],
]);

const DesignClass = createLucideIcon("ModelDesignClass", [
  ["rect", { key: "class", x: "4", y: "2", width: "16", height: "20", rx: "1" }],
  ["path", { key: "compartments", d: "M4 8h16M4 15h16" }],
  ["path", { key: "name-attributes-operations", d: "M7 5h5m-5 6h2m3 0h5m-10 8h2m3 0h4" }],
]);

const PageNavigation = createLucideIcon("ModelPageNavigation", [
  ["rect", { key: "source-page", x: "2", y: "2", width: "8", height: "7", rx: "1" }],
  ["rect", { key: "target-page", x: "14", y: "15", width: "8", height: "7", rx: "1" }],
  ["path", { key: "page-headers", d: "M2 5h8m4 13h8" }],
  ["path", { key: "navigation", d: "M10 6h8v9m-2-2 2 2 2-2" }],
]);

const DatabaseSchema = createLucideIcon("ModelDatabaseSchema", [
  ["rect", { key: "first-table", x: "1", y: "2", width: "9", height: "10", rx: "1" }],
  ["rect", { key: "second-table", x: "14", y: "12", width: "9", height: "10", rx: "1" }],
  ["path", { key: "rows-and-columns", d: "M1 6h9M5 6v6m9 4h9m-5 0v6" }],
  ["path", { key: "foreign-key", d: "M10 9h8v3" }],
]);

const ComponentDiagram = createLucideIcon("ModelComponent", [
  ["path", { key: "component", d: "M6 7V3h16v18H6v-3m0-4v-3" }],
  ["rect", { key: "upper-tab", x: "2", y: "7", width: "7", height: "4" }],
  ["rect", { key: "lower-tab", x: "2", y: "14", width: "7", height: "4" }],
]);

const DeploymentDesign = createLucideIcon("ModelDeploymentDesign", [
  ["path", { key: "node", d: "m3 7 5-4h13v14l-5 4H3V7h13l5-4M16 7v14" }],
  ["path", { key: "deployed-artifact", d: "M6 11h4l3 3v3H6Zm4 0v3h3" }],
]);

export const REQUIREMENT_DIAGRAM_ICON = {
  context: SystemContext,
  function: FunctionStructure,
  activity: BusinessActivity,
  usecase: UseCase,
  class: DomainConcept,
  prototype: PrototypeInterface,
  deployment: DeploymentRequirement,
  analysis: RequirementAnalysis,
} satisfies Record<DiagramType, LucideIcon>;

export const DESIGN_DIAGRAM_ICON = {
  architecture: Architecture,
  sequence: ImplementationSequence,
  class: DesignClass,
  navigation: PageNavigation,
  table: DatabaseSchema,
  component: ComponentDiagram,
  deployment: DeploymentDesign,
} satisfies Record<DesignDiagramType, LucideIcon>;

export const FEASIBILITY_ARTIFACT_ICON = {
  context: SystemContext,
  "business-flow": BusinessSystemFlow,
  implementation: Wrench,
} satisfies Record<FeasibilityArtifactKind, LucideIcon>;
