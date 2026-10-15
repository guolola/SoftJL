// UML model, test generation, PlantUML, SVG, and design traceability contract schemas.
import { z } from "zod";
import {
  designDiagramKindSchema,
  diagramKindSchema,
  umlDiagramKindSchema,
  type DesignDiagramKind,
} from "./requirements.js";

export const visibilitySchema = z.enum(["public", "protected", "private", "package"]);
export type Visibility = z.infer<typeof visibilitySchema>;

const noteListSchema = z.array(z.string().min(1));

export const useCaseActorTypeSchema = z.enum(["human", "system", "external"]);
export type UseCaseActorType = z.infer<typeof useCaseActorTypeSchema>;

export const useCaseActorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  actorType: useCaseActorTypeSchema,
  description: z.string().min(1).optional(),
  responsibilities: noteListSchema,
});
export type UseCaseActor = z.infer<typeof useCaseActorSchema>;

export const useCaseEventFlowTypeSchema = z.enum([
  "main",
  "alternative",
  "exception",
]);
export type UseCaseEventFlowType = z.infer<typeof useCaseEventFlowTypeSchema>;

export const useCaseEventFlowStepActorSchema = z.enum([
  "actor",
  "system",
  "external",
]);
export type UseCaseEventFlowStepActor = z.infer<
  typeof useCaseEventFlowStepActorSchema
>;

export const useCaseEventFlowStepSchema = z.object({
  order: z.number().int().min(1),
  actor: useCaseEventFlowStepActorSchema,
  actorAction: z.string().min(1).optional(),
  systemAction: z.string().min(1).optional(),
  expectedResult: z.string().min(1).optional(),
  sourceRequirementId: z.string().min(1).optional(),
});
export type UseCaseEventFlowStep = z.infer<typeof useCaseEventFlowStepSchema>;

export const useCaseEventFlowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  flowType: useCaseEventFlowTypeSchema,
  trigger: z.string().min(1).optional(),
  condition: z.string().min(1).optional(),
  steps: z.array(useCaseEventFlowStepSchema).default([]),
});
export type UseCaseEventFlow = z.infer<typeof useCaseEventFlowSchema>;

export const useCaseSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  goal: z.string().min(1),
  description: z.string().min(1).optional(),
  preconditions: noteListSchema,
  postconditions: noteListSchema,
  systemBoundaryId: z.string().min(1).optional(),
  extensionPoints: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) })).optional(),
  primaryActorId: z.string().min(1).optional(),
  supportingActorIds: z.array(z.string().min(1)),
  eventFlows: z.array(useCaseEventFlowSchema).default([]),
});
export type UseCaseSpec = z.infer<typeof useCaseSpecSchema>;

export const systemBoundarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1).optional(),
});
export type SystemBoundary = z.infer<typeof systemBoundarySchema>;

export const useCaseRelationshipTypeSchema = z.enum([
  "association",
  "include",
  "extend",
  "generalization",
]);
export type UseCaseRelationshipType = z.infer<typeof useCaseRelationshipTypeSchema>;

export const useCaseRelationshipSchema = z.object({
  extensionPointIds: z.array(z.string().min(1)).optional(),
  id: z.string().min(1),
  type: useCaseRelationshipTypeSchema,
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  label: z.string().min(1).optional(),
  condition: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type UseCaseRelationship = z.infer<typeof useCaseRelationshipSchema>;

export const useCaseDiagramSpecSchema = z.object({
  diagramKind: z.literal("usecase"),
  modelId: z.string().min(1).optional(),
  title: z.string().min(1),
  summary: z.string().min(1),
  notes: noteListSchema,
  actors: z.array(useCaseActorSchema),
  useCases: z.array(useCaseSpecSchema),
  systemBoundaries: z.array(systemBoundarySchema),
  relationships: z.array(useCaseRelationshipSchema),
});
export type UseCaseDiagramSpec = z.infer<typeof useCaseDiagramSpecSchema>;

export const functionNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  sourceRequirementIds: z.array(z.string().min(1)).default([]),
});
export type FunctionNode = z.infer<typeof functionNodeSchema>;

export const functionRelationshipTypeSchema = z.enum([
  "decomposition",
]);
export type FunctionRelationshipType = z.infer<
  typeof functionRelationshipTypeSchema
>;

export const functionRelationshipSchema = z.object({
  id: z.string().min(1),
  type: functionRelationshipTypeSchema,
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  label: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type FunctionRelationship = z.infer<typeof functionRelationshipSchema>;

export const functionStructureDiagramSpecSchema = z.object({
  diagramKind: z.literal("function"),
  modelId: z.string().min(1).optional(),
  title: z.string().min(1),
  summary: z.string().min(1),
  notes: noteListSchema,
  nodes: z.array(functionNodeSchema),
  relationships: z.array(functionRelationshipSchema),
});
export type FunctionStructureDiagramSpec = z.infer<
  typeof functionStructureDiagramSpecSchema
>;

export const classKindSchema = z.enum(["entity", "aggregate", "valueObject", "service", "other"]);
export type ClassKind = z.infer<typeof classKindSchema>;

export const classAttributeSchema = z.object({
  isStatic: z.boolean().optional(),
  name: z.string().min(1),
  chineseName: z.string().min(1).optional(),
  englishName: z.string().min(1).optional(),
  type: z.string().min(1),
  constraints: z.array(z.string().min(1)).default([]),
  visibility: visibilitySchema,
  required: z.boolean().optional(),
  multiplicity: z.string().min(1).optional(),
  defaultValue: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type ClassAttribute = z.infer<typeof classAttributeSchema>;

export const operationParameterSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  required: z.boolean().optional(),
  direction: z.enum(["in", "out", "inout"]).optional(),
});
export type OperationParameter = z.infer<typeof operationParameterSchema>;

export const classOperationSchema = z.object({
  isStatic: z.boolean().optional(),
  isAbstract: z.boolean().optional(),
  name: z.string().min(1),
  returnType: z.string().min(1).optional(),
  visibility: visibilitySchema,
  parameters: z.array(operationParameterSchema),
  description: z.string().min(1).optional(),
});
export type ClassOperation = z.infer<typeof classOperationSchema>;

export const classEntitySchema = z.object({
  isAbstract: z.boolean().optional(),
  id: z.string().min(1),
  name: z.string().min(1),
  chineseName: z.string().min(1).optional(),
  englishName: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  constraints: z.array(z.string().min(1)).default([]),
  classKind: classKindSchema.optional(),
  stereotype: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  attributes: z.array(classAttributeSchema).default([]),
  operations: z.array(classOperationSchema).default([]),
});
export type ClassEntity = z.infer<typeof classEntitySchema>;

export const interfaceEntitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  chineseName: z.string().min(1).optional(),
  englishName: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  constraints: z.array(z.string().min(1)).default([]),
  description: z.string().min(1).optional(),
  operations: z.array(classOperationSchema).default([]),
});
export type InterfaceEntity = z.infer<typeof interfaceEntitySchema>;

export const enumEntitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  literals: noteListSchema,
});
export type EnumEntity = z.infer<typeof enumEntitySchema>;

export const classRelationshipTypeSchema = z.enum([
  "association",
  "aggregation",
  "composition",
  "inheritance",
  "implementation",
  "dependency",
]);
export type ClassRelationshipType = z.infer<typeof classRelationshipTypeSchema>;

export const classRelationshipSchema = z.object({
  id: z.string().min(1),
  type: classRelationshipTypeSchema,
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  sourceRole: z.string().min(1).optional(),
  targetRole: z.string().min(1).optional(),
  sourceMultiplicity: z.string().min(1).optional(),
  targetMultiplicity: z.string().min(1).optional(),
  navigability: z.enum(["none", "source-to-target", "target-to-source", "bidirectional"]).optional(),
  label: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type ClassRelationship = z.infer<typeof classRelationshipSchema>;

export const classDiagramSpecSchema = z.object({
  diagramKind: z.literal("class"),
  modelId: z.string().min(1).optional(),
  title: z.string().min(1),
  summary: z.string().min(1),
  notes: noteListSchema,
  classes: z.array(classEntitySchema),
  interfaces: z.array(interfaceEntitySchema),
  enums: z.array(enumEntitySchema),
  relationships: z.array(classRelationshipSchema),
});
export type ClassDiagramSpec = z.infer<typeof classDiagramSpecSchema>;

export const activityNodeTypeSchema = z.enum([
  "start",
  "end",
  "activity",
  "decision",
  "merge",
  "fork",
  "join",
  "object",
  "flow_final",
]);
export type ActivityNodeType = z.infer<typeof activityNodeTypeSchema>;

export const swimlaneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1).optional(),
});
export type Swimlane = z.infer<typeof swimlaneSchema>;

export const activityPinSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  dataType: z.string().min(1),
  multiplicity: z.string().min(1).optional(),
});
export type ActivityPin = z.infer<typeof activityPinSchema>;

const activityNodeBaseSchema = z.object({
  actorOrLane: z.string().min(1).optional(),
  id: z.string().min(1),
  description: z.string().min(1).optional(),
});

export const activityStartNodeSchema = activityNodeBaseSchema.extend({
  type: z.literal("start"),
  name: z.string().min(1).default("开始"),
});
export type ActivityStartNode = z.infer<typeof activityStartNodeSchema>;

export const activityEndNodeSchema = activityNodeBaseSchema.extend({
  type: z.literal("end"),
  name: z.string().min(1).default("结束"),
});
export type ActivityEndNode = z.infer<typeof activityEndNodeSchema>;

export const activityActionNodeSchema = activityNodeBaseSchema.extend({
  type: z.literal("activity"),
  name: z.string().min(1),
  actorOrLane: z.string().min(1).optional(),
  input: z.array(z.string().min(1)).default([]),
  output: z.array(z.string().min(1)).default([]),
  inputPins: z.array(activityPinSchema).optional(),
  outputPins: z.array(activityPinSchema).optional(),
});
export type ActivityActionNode = z.infer<typeof activityActionNodeSchema>;

export const activityDecisionNodeSchema = activityNodeBaseSchema.extend({
  type: z.literal("decision"),
  name: z.string().min(1).optional(),
  question: z.string().min(1).optional(),
});
export type ActivityDecisionNode = z.infer<typeof activityDecisionNodeSchema>;

export const activityMergeNodeSchema = activityNodeBaseSchema.extend({
  type: z.literal("merge"),
  name: z.string().min(1).optional(),
});
export type ActivityMergeNode = z.infer<typeof activityMergeNodeSchema>;

export const activityForkNodeSchema = activityNodeBaseSchema.extend({
  type: z.literal("fork"),
  name: z.string().min(1).optional(),
});
export type ActivityForkNode = z.infer<typeof activityForkNodeSchema>;

export const activityJoinNodeSchema = activityNodeBaseSchema.extend({
  type: z.literal("join"),
  name: z.string().min(1).optional(),
});
export type ActivityJoinNode = z.infer<typeof activityJoinNodeSchema>;

export const activityObjectNodeSchema = activityNodeBaseSchema.extend({
  type: z.literal("object"),
  name: z.string().min(1),
  dataType: z.string().min(1),
  state: z.string().min(1).optional(),
});
export const activityFlowFinalNodeSchema = activityNodeBaseSchema.extend({
  type: z.literal("flow_final"),
  name: z.string().min(1).default("分支结束"),
});

export const activityNodeSchema = z.discriminatedUnion("type", [
  activityStartNodeSchema,
  activityEndNodeSchema,
  activityActionNodeSchema,
  activityDecisionNodeSchema,
  activityMergeNodeSchema,
  activityForkNodeSchema,
  activityJoinNodeSchema,
  activityObjectNodeSchema,
  activityFlowFinalNodeSchema,
]);
export type ActivityNode = z.infer<typeof activityNodeSchema>;

export const activityRelationshipTypeSchema = z.enum(["control_flow", "object_flow"]);
export type ActivityRelationshipType = z.infer<typeof activityRelationshipTypeSchema>;

export const activityRelationshipSchema = z.object({
  id: z.string().min(1),
  type: activityRelationshipTypeSchema,
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  condition: z.string().min(1).optional(),
  guard: z.string().min(1).optional(),
  trigger: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type ActivityRelationship = z.infer<typeof activityRelationshipSchema>;

export const activityDiagramSpecSchema = z.object({
  diagramKind: z.literal("activity"),
  modelId: z.string().min(1).optional(),
  title: z.string().min(1),
  summary: z.string().min(1),
  notes: noteListSchema,
  swimlanes: z.array(swimlaneSchema),
  nodes: z.array(activityNodeSchema),
  relationships: z.array(activityRelationshipSchema),
});
export type ActivityDiagramSpec = z.infer<typeof activityDiagramSpecSchema>;

// Feasibility uses a high-level control-flow subset, not the full activity profile.
export const feasibilityActivityDiagramSpecSchema = activityDiagramSpecSchema.extend({
  nodes: z.array(z.discriminatedUnion("type", [activityStartNodeSchema, activityEndNodeSchema,
    activityActionNodeSchema.extend({ inputPins: z.array(activityPinSchema).max(0).optional(), outputPins: z.array(activityPinSchema).max(0).optional() }),
    activityDecisionNodeSchema, activityMergeNodeSchema, activityForkNodeSchema, activityJoinNodeSchema])),
  relationships: z.array(activityRelationshipSchema.extend({ type: z.literal("control_flow") })),
});


export const deploymentNodeTypeSchema = z.enum([
  "node",
  "device",
  "execution-environment",
]);
export type DeploymentNodeType = z.infer<typeof deploymentNodeTypeSchema>;

export const deploymentNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  nodeType: deploymentNodeTypeSchema,
  parentId: z.string().min(1).optional(),
  technology: z.string().min(1).optional(),
  environment: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type DeploymentNode = z.infer<typeof deploymentNodeSchema>;

export const deploymentDatabaseSchema = z.object({
  parentId: z.string().min(1).optional(),
  id: z.string().min(1),
  name: z.string().min(1),
  engine: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type DeploymentDatabase = z.infer<typeof deploymentDatabaseSchema>;

export const deploymentComponentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  componentType: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type DeploymentComponent = z.infer<typeof deploymentComponentSchema>;

export const externalSystemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1).optional(),
});
export type ExternalSystem = z.infer<typeof externalSystemSchema>;

export const deploymentArtifactSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  artifactType: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type DeploymentArtifactSpec = z.infer<typeof deploymentArtifactSpecSchema>;

export const deploymentRelationshipTypeSchema = z.enum([
  "deployment",
  "communication",
  "dependency",
  "manifestation",
]);
export type DeploymentRelationshipType = z.infer<typeof deploymentRelationshipTypeSchema>;

export const deploymentRelationshipSchema = z.object({
  id: z.string().min(1),
  type: deploymentRelationshipTypeSchema,
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  protocol: z.string().min(1).optional(),
  port: z.string().min(1).optional(),
  direction: z.enum(["one-way", "two-way", "inbound", "outbound"]).optional(),
  label: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type DeploymentRelationship = z.infer<typeof deploymentRelationshipSchema>;

export const deploymentDiagramSpecSchema = z.object({
  diagramKind: z.literal("deployment"),
  modelId: z.string().min(1).optional(),
  title: z.string().min(1),
  summary: z.string().min(1),
  notes: noteListSchema,
  nodes: z.array(deploymentNodeSchema),
  databases: z.array(deploymentDatabaseSchema),
  components: z.array(deploymentComponentSchema),
  externalSystems: z.array(externalSystemSchema),
  artifacts: z.array(deploymentArtifactSpecSchema),
  relationships: z.array(deploymentRelationshipSchema),
});
export type DeploymentDiagramSpec = z.infer<typeof deploymentDiagramSpecSchema>;

export const sequenceParticipantTypeSchema = z.enum([
  "actor",
  "boundary",
  "control",
  "entity",
  "service",
  "database",
  "external",
]);
export type SequenceParticipantType = z.infer<typeof sequenceParticipantTypeSchema>;

export const sequenceParticipantSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  participantType: sequenceParticipantTypeSchema,
  description: z.string().min(1).optional(),
});
export type SequenceParticipant = z.infer<typeof sequenceParticipantSchema>;

export const sequenceMessageTypeSchema = z.enum([
  "sync",
  "async",
  "return",
  "create",
  "destroy",
]);
export type SequenceMessageType = z.infer<typeof sequenceMessageTypeSchema>;

export const sequenceMessageSchema = z.object({
  id: z.string().min(1),
  type: sequenceMessageTypeSchema,
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  name: z.string().min(1),
  parameters: z.array(z.string().min(1)),
  returnValue: z.string().min(1).optional(),
  condition: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type SequenceMessage = z.infer<typeof sequenceMessageSchema>;

export const sequenceFragmentTypeSchema = z.enum([
  "alt",
  "opt",
  "loop",
  "par",
]);
export type SequenceFragmentType = z.infer<typeof sequenceFragmentTypeSchema>;

export const sequenceFragmentBranchSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  condition: z.string().min(1).optional(),
  // An empty operand expresses a legal no-op alternative (for example an else branch).
  messageIds: z.array(z.string().min(1)),
});
export type SequenceFragmentBranch = z.infer<typeof sequenceFragmentBranchSchema>;

export const sequenceFragmentSchema = z.object({
  parentFragmentId: z.string().min(1).optional(),
  parentBranchId: z.string().min(1).optional(),
  id: z.string().min(1),
  type: sequenceFragmentTypeSchema,
  label: z.string().min(1),
  messageIds: z.array(z.string().min(1)).min(1),
  condition: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  branches: z.array(sequenceFragmentBranchSchema).optional(),
});
export type SequenceFragment = z.infer<typeof sequenceFragmentSchema>;

export const sequenceActivationSchema = z.object({
  id: z.string().min(1),
  participantId: z.string().min(1),
  startMessageId: z.string().min(1),
  endMessageId: z.string().min(1),
});

export const sequenceDiagramSpecSchema = z.object({
  activations: z.array(sequenceActivationSchema).optional(),
  diagramKind: z.literal("sequence"),
  modelId: z.string().min(1).optional(),
  sourceUseCaseId: z.string().min(1).optional(),
  sourceUseCaseName: z.string().min(1).optional(),
  title: z.string().min(1),
  summary: z.string().min(1),
  notes: noteListSchema,
  participants: z.array(sequenceParticipantSchema),
  messages: z.array(sequenceMessageSchema),
  fragments: z.array(sequenceFragmentSchema),
});
export type SequenceDiagramSpec = z.infer<typeof sequenceDiagramSpecSchema>;

export const analysisSequenceDiagramSpecSchema = sequenceDiagramSpecSchema.extend({
  diagramKind: z.literal("analysis"),
  participants: z.array(sequenceParticipantSchema.extend({ participantType: z.enum(["actor", "boundary", "control", "entity"]) })),
});
export type AnalysisSequenceDiagramSpec = z.infer<
  typeof analysisSequenceDiagramSpecSchema
>;

export const prototypeInterfaceNodeTypeSchema = z.enum([
  "screen",
  "module",
  "entry-point",
]);
export type PrototypeInterfaceNodeType = z.infer<
  typeof prototypeInterfaceNodeTypeSchema
>;

export const prototypeInterfaceNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  nodeType: prototypeInterfaceNodeTypeSchema,
  route: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  sourceUseCaseIds: z.array(z.string().min(1)).default([]),
  sourceRequirementIds: z.array(z.string().min(1)).default([]),
});
export type PrototypeInterfaceNode = z.infer<
  typeof prototypeInterfaceNodeSchema
>;

export const prototypeInterfaceRelationshipTypeSchema = z.enum([
  "navigation",
  "contains",
  "opens",
  "submits",
  "returns",
  "depends-on",
]);
export type PrototypeInterfaceRelationshipType = z.infer<
  typeof prototypeInterfaceRelationshipTypeSchema
>;

export const prototypeInterfaceRelationshipSchema = z.object({
  id: z.string().min(1),
  type: prototypeInterfaceRelationshipTypeSchema,
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  label: z.string().min(1).optional(),
  guard: z.string().min(1).optional(),
  trigger: z.string().min(1).optional(),
  condition: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type PrototypeInterfaceRelationship = z.infer<
  typeof prototypeInterfaceRelationshipSchema
>;

export const prototypeInterfaceDiagramSpecSchema = z.object({
  diagramKind: z.literal("prototype"),
  modelId: z.string().min(1).optional(),
  title: z.string().min(1),
  summary: z.string().min(1),
  notes: noteListSchema,
  nodes: z.array(prototypeInterfaceNodeSchema),
  relationships: z.array(prototypeInterfaceRelationshipSchema),
});
export type PrototypeInterfaceDiagramSpec = z.infer<
  typeof prototypeInterfaceDiagramSpecSchema
>;

export const navigationDiagramSpecSchema = prototypeInterfaceDiagramSpecSchema.extend({
  diagramKind: z.literal("navigation"),
});
export type NavigationDiagramSpec = z.infer<typeof navigationDiagramSpecSchema>;

export const architecturePackageSchema = z.object({
  parentId: z.string().min(1).optional(),
  id: z.string().min(1),
  name: z.string().min(1),
  stereotype: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type ArchitecturePackage = z.infer<typeof architecturePackageSchema>;

export const architectureComponentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  componentType: z.string().min(1).optional(),
  packageId: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  sourceRequirementIds: z.array(z.string().min(1)).default([]),
});
export type ArchitectureComponent = z.infer<typeof architectureComponentSchema>;

export const architectureRelationshipTypeSchema = z.enum([
  "contains",
  "dependency",
  "communication",
]);
export type ArchitectureRelationshipType = z.infer<
  typeof architectureRelationshipTypeSchema
>;

export const architectureRelationshipSchema = z.object({
  id: z.string().min(1),
  type: architectureRelationshipTypeSchema,
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  label: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type ArchitectureRelationship = z.infer<
  typeof architectureRelationshipSchema
>;

export const architectureDiagramSpecSchema = z.object({
  diagramKind: z.literal("architecture"),
  modelId: z.string().min(1).optional(),
  title: z.string().min(1),
  summary: z.string().min(1),
  notes: noteListSchema,
  packages: z.array(architecturePackageSchema),
  components: z.array(architectureComponentSchema),
  relationships: z.array(architectureRelationshipSchema),
});
export type ArchitectureDiagramSpec = z.infer<
  typeof architectureDiagramSpecSchema
>;

export const componentRelationshipElementSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  componentType: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  sourceClassIds: z.array(z.string().min(1)).default([]),
});
export type ComponentRelationshipElement = z.infer<
  typeof componentRelationshipElementSchema
>;

export const componentInterfaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  operationNames: z.array(z.string().min(1)).default([]),
});
export type ComponentInterface = z.infer<typeof componentInterfaceSchema>;

export const componentRelationshipTypeSchema = z.enum([
  "dependency",
  "provided-interface",
  "required-interface",
  "composition",
  "communication",
]);
export type ComponentRelationshipType = z.infer<
  typeof componentRelationshipTypeSchema
>;

export const componentRelationshipSchema = z.object({
  id: z.string().min(1),
  type: componentRelationshipTypeSchema,
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  label: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type ComponentRelationship = z.infer<
  typeof componentRelationshipSchema
>;

export const componentRelationshipDiagramSpecSchema = z.object({
  diagramKind: z.literal("component"),
  modelId: z.string().min(1).optional(),
  title: z.string().min(1),
  summary: z.string().min(1),
  notes: noteListSchema,
  components: z.array(componentRelationshipElementSchema),
  interfaces: z.array(componentInterfaceSchema),
  relationships: z.array(componentRelationshipSchema),
});
export type ComponentRelationshipDiagramSpec = z.infer<
  typeof componentRelationshipDiagramSpecSchema
>;

export const tableColumnReferenceSchema = z.object({
  tableId: z.string().min(1),
  columnId: z.string().min(1),
});
export type TableColumnReference = z.infer<typeof tableColumnReferenceSchema>;

export const tableColumnSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  chineseName: z.string().min(1).optional(),
  englishName: z.string().min(1).optional(),
  dataType: z.string().min(1),
  constraints: z.array(z.string().min(1)).default([]),
  isPrimaryKey: z.boolean().default(false),
  isForeignKey: z.boolean().default(false),
  nullable: z.boolean().default(true),
  references: tableColumnReferenceSchema.optional(),
  description: z.string().min(1).optional(),
});
export type TableColumn = z.infer<typeof tableColumnSchema>;

const relationalKeyBaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  columnIds: z.array(z.string().min(1)).min(1),
});
export const tableRelationalConstraintSchema = z.discriminatedUnion("type", [
  relationalKeyBaseSchema.extend({ type: z.literal("primary-key") }),
  relationalKeyBaseSchema.extend({ type: z.literal("unique") }),
  relationalKeyBaseSchema.extend({
    type: z.literal("foreign-key"),
    referenceTableId: z.string().min(1),
    referenceColumnIds: z.array(z.string().min(1)).min(1),
  }),
  z.object({ id: z.string().min(1), name: z.string().min(1).optional(), type: z.literal("check"), expression: z.string().min(1) }),
]);
export type TableRelationalConstraint = z.infer<typeof tableRelationalConstraintSchema>;

export const tableSchema = z.object({
  relationalConstraints: z.array(tableRelationalConstraintSchema).default([]),
  id: z.string().min(1),
  name: z.string().min(1),
  chineseName: z.string().min(1).optional(),
  englishName: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  constraints: z.array(z.string().min(1)).default([]),
  description: z.string().min(1).optional(),
  columns: z.array(tableColumnSchema).min(1),
});
export type TableSpec = z.infer<typeof tableSchema>;

export const tableRelationshipTypeSchema = z.enum([
  "one-to-one",
  "one-to-many",
]);
export type TableRelationshipType = z.infer<typeof tableRelationshipTypeSchema>;

export const tableRelationshipSchema = z.object({
  sourceMultiplicity: z.enum(["1", "0..1"]).optional(),
  targetMultiplicity: z.enum(["0..1", "0..*"]).optional(),
  identifying: z.boolean().optional(),
  sourceColumnIds: z.array(z.string().min(1)).optional(),
  targetColumnIds: z.array(z.string().min(1)).optional(),
  id: z.string().min(1),
  type: tableRelationshipTypeSchema,
  sourceTableId: z.string().min(1),
  targetTableId: z.string().min(1),
  label: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type TableRelationship = z.infer<typeof tableRelationshipSchema>;

export const tableDiagramSpecSchema = z.object({
  diagramKind: z.literal("table"),
  modelId: z.string().min(1).optional(),
  title: z.string().min(1),
  summary: z.string().min(1),
  notes: noteListSchema,
  tables: z.array(tableSchema).min(1),
  relationships: z.array(tableRelationshipSchema).default([]),
});
export type TableDiagramSpec = z.infer<typeof tableDiagramSpecSchema>;

export const contextElementSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  sourceRequirementIds: z.array(z.string().min(1)).default([]),
});
export type ContextElement = z.infer<typeof contextElementSchema>;

export const contextRelationshipSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  direction: z.enum(["directed", "bidirectional"]),
  label: z.string().min(1),
  description: z.string().min(1).optional(),
  sourceRequirementIds: z.array(z.string().min(1)).min(1),
});
export type ContextRelationship = z.infer<typeof contextRelationshipSchema>;

export const contextDiagramSpecSchema = z.object({
  diagramKind: z.literal("context"),
  modelId: z.string().min(1).default("context"),
  title: z.string().min(1),
  summary: z.string().min(1),
  notes: noteListSchema,
  system: contextElementSchema.extend({ sourceRequirementIds: z.array(z.string()).max(0).default([]) }),
  people: z.array(contextElementSchema.extend({ sourceRequirementIds: z.array(z.string().min(1)).min(1) })),
  externalSystems: z.array(contextElementSchema.extend({ sourceRequirementIds: z.array(z.string().min(1)).min(1) })),
  relationships: z.array(contextRelationshipSchema),
});
export type ContextDiagramSpec = z.infer<typeof contextDiagramSpecSchema>;

export const requirementClassDiagramSpecSchema = classDiagramSpecSchema.extend({
  interfaces: z.array(interfaceEntitySchema).max(0),
  classes: z.array(classEntitySchema.extend({
    classKind: z.enum(["entity", "aggregate", "valueObject", "other"]).optional(),
    operations: z.array(classOperationSchema).max(0).default([]),
  })),
  relationships: z.array(classRelationshipSchema.extend({ type: z.enum(["association", "aggregation", "composition", "inheritance"]) })),
});

// Requirements capture known infrastructure, while implementation artifacts belong to design.
export const requirementDeploymentDiagramSpecSchema = deploymentDiagramSpecSchema.extend({
  components: z.array(deploymentComponentSchema).max(0),
  artifacts: z.array(deploymentArtifactSpecSchema).max(0),
  relationships: z.array(deploymentRelationshipSchema.extend({ type: z.literal("communication") })),
});

export const diagramModelSpecSchema = z.discriminatedUnion("diagramKind", [
  contextDiagramSpecSchema,
  functionStructureDiagramSpecSchema,
  useCaseDiagramSpecSchema,
  requirementClassDiagramSpecSchema,
  activityDiagramSpecSchema,
  requirementDeploymentDiagramSpecSchema,
  prototypeInterfaceDiagramSpecSchema,
  analysisSequenceDiagramSpecSchema,
]);
export type DiagramModelSpec = z.infer<typeof diagramModelSpecSchema>;

export const modelElementRefSchema = z.object({
  modelId: z.string().min(1).optional(),
  diagramKind: umlDiagramKindSchema,
  elementId: z.string().min(1),
  elementKind: z.string().min(1),
  label: z.string().min(1),
});
export type ModelElementRef = z.infer<typeof modelElementRefSchema>;

export const requirementModelTraceabilityEntrySchema = z.object({
  ruleId: z.string().min(1),
  target: modelElementRefSchema,
  mappingSource: z.enum(["llm", "auto-filled-pending-review"]).optional(),
  reviewStatus: z.enum(["confirmed", "pending"]).optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  rationale: z.string().min(1).optional(),
});
export type RequirementModelTraceabilityEntry = z.infer<
  typeof requirementModelTraceabilityEntrySchema
>;

export const designModelTraceabilityEntrySchema = z.object({
  source: modelElementRefSchema,
  targets: z.array(modelElementRefSchema).min(1),
  upstreamDesignRefs: z.array(modelElementRefSchema).optional(),
  mappingSource: z
    .enum(["llm", "derived-from-endpoints", "auto-filled-pending-review"])
    .optional(),
  reviewStatus: z.enum(["confirmed", "pending"]).optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  rationale: z.string().min(1).optional(),
});
export type DesignModelTraceabilityEntry = z.infer<
  typeof designModelTraceabilityEntrySchema
>;

export const diagramModelsResultSchema = z.object({
  models: z.array(diagramModelSpecSchema),
  requirementModelTraceability: z.array(requirementModelTraceabilityEntrySchema),
});
export type DiagramModelsResult = z.infer<typeof diagramModelsResultSchema>;

export const designDiagramModelSpecSchema = z.discriminatedUnion("diagramKind", [
  architectureDiagramSpecSchema,
  sequenceDiagramSpecSchema,
  classDiagramSpecSchema,
  navigationDiagramSpecSchema,
  componentRelationshipDiagramSpecSchema,
  deploymentDiagramSpecSchema,
  tableDiagramSpecSchema,
]);
export type DesignDiagramModelSpec = z.infer<typeof designDiagramModelSpecSchema>;

export const designDiagramModelsResultSchema = z.object({
  models: z.array(designDiagramModelSpecSchema),
  designModelTraceability: z.array(designModelTraceabilityEntrySchema),
});
export type DesignDiagramModelsResult = z.infer<typeof designDiagramModelsResultSchema>;

export const testScenarioTypeSchema = z.enum([
  "normal",
  "alternative",
  "exception",
  "boundary",
  "decision-table",
]);
export type TestScenarioType = z.infer<typeof testScenarioTypeSchema>;

export const testPrioritySchema = z.enum(["P0", "P1", "P2", "P3"]);
export type TestPriority = z.infer<typeof testPrioritySchema>;

export const blackBoxTestStepSchema = z.object({
  order: z.number().int().min(1),
  action: z.string().min(1),
  expectedResult: z.string().min(1),
});
export type BlackBoxTestStep = z.infer<typeof blackBoxTestStepSchema>;

export const blackBoxTestCaseSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  sourceRequirementId: z.string().min(1).optional(),
  sourceRequirementText: z.string().min(1).optional(),
  sourceUseCaseId: z.string().min(1).optional(),
  sourceUseCaseName: z.string().min(1).optional(),
  scenarioType: testScenarioTypeSchema,
  priority: testPrioritySchema,
  preconditions: z.array(z.string().min(1)).default([]),
  testData: z.array(z.string().min(1)).default([]),
  steps: z.array(blackBoxTestStepSchema).min(1),
  expectedResults: z.array(z.string().min(1)).default([]),
});
export type BlackBoxTestCase = z.infer<typeof blackBoxTestCaseSchema>;

export const testCoverageStatusSchema = z.enum([
  "covered",
  "partially-covered",
  "pending-review",
]);
export type TestCoverageStatus = z.infer<typeof testCoverageStatusSchema>;

export const testCoverageRelationSchema = z.object({
  testCaseId: z.string().min(1),
  requirementIds: z.array(z.string().min(1)).default([]),
  useCaseIds: z.array(z.string().min(1)).default([]),
  designModelRefs: z.array(modelElementRefSchema).default([]),
  coverageStatus: testCoverageStatusSchema,
  rationale: z.string().min(1),
});
export type TestCoverageRelation = z.infer<typeof testCoverageRelationSchema>;

export const testGenerationResultSchema = z.object({
  testCases: z.array(blackBoxTestCaseSchema),
  coverageRelations: z.array(testCoverageRelationSchema),
});
export type TestGenerationResult = z.infer<typeof testGenerationResultSchema>;

export const modelRenderMappingSchema = z.object({
  mode: z.enum(["native", "explicit-graph"]),
  elements: z.array(z.object({ elementId: z.string(), alias: z.string(), label: z.string().optional(), kind: z.string().optional(), ownerId: z.string().optional(), statement: z.string().optional() })),
  relationships: z.array(z.object({ relationshipId: z.string(), sourceId: z.string(), targetId: z.string(), type: z.string(), label: z.string().optional(), symbol: z.string().optional(), statement: z.string().optional() })),
  auxiliary: z.array(z.object({ kind: z.string(), elementId: z.string().optional(), ownerId: z.string().optional(), label: z.string().optional(), alias: z.string().optional() })).optional(),
});
export type ModelRenderMapping = z.infer<typeof modelRenderMappingSchema>;

export const plantUmlArtifactSchema = z.object({
  renderMapping: modelRenderMappingSchema.optional(),
  modelId: z.string().min(1).optional(),
  diagramKind: diagramKindSchema,
  source: z.string().min(1),
});
export type PlantUmlArtifact = z.infer<typeof plantUmlArtifactSchema>;

export const designPlantUmlArtifactSchema = z.object({
  renderMapping: modelRenderMappingSchema.optional(),
  modelId: z.string().min(1).optional(),
  diagramKind: designDiagramKindSchema,
  source: z.string().min(1),
});
export type DesignPlantUmlArtifact = z.infer<typeof designPlantUmlArtifactSchema>;

export const repairPlantUmlResultSchema = z.object({
  source: z.string().min(1),
});
export type RepairPlantUmlResult = z.infer<typeof repairPlantUmlResultSchema>;

export const svgArtifactSchema = z.object({
  modelId: z.string().min(1).optional(),
  diagramKind: diagramKindSchema,
  svg: z.string().min(1),
  renderMeta: z.object({
    engine: z.string().min(1),
    generatedAt: z.string().min(1),
    sourceLength: z.number().int().nonnegative(),
    durationMs: z.number().nonnegative(),
  }),
});
export type SvgArtifact = z.infer<typeof svgArtifactSchema>;

export const designSvgArtifactSchema = svgArtifactSchema.extend({
  modelId: z.string().min(1).optional(),
  diagramKind: designDiagramKindSchema,
});
export type DesignSvgArtifact = z.infer<typeof designSvgArtifactSchema>;

export function isDesignDiagramKind(value: unknown): value is DesignDiagramKind {
  return (
    typeof value === "string" &&
    designDiagramKindSchema.options.includes(value as DesignDiagramKind)
  );
}

export function designDiagramKindFromRecordKey(
  key: string | null | undefined,
): DesignDiagramKind | null {
  if (!key) return null;
  const scopedKind = key.includes(":") ? key.split(":", 1)[0] : key;
  if (isDesignDiagramKind(scopedKind)) return scopedKind;
  const legacyDesignKind = scopedKind.startsWith("design-")
    ? scopedKind.slice("design-".length)
    : null;
  return isDesignDiagramKind(legacyDesignKind) ? legacyDesignKind : null;
}

function designRecordStringField(record: unknown, field: string) {
  return record &&
    typeof record === "object" &&
    !Array.isArray(record) &&
    typeof (record as Record<string, unknown>)[field] === "string"
    ? ((record as Record<string, unknown>)[field] as string)
    : null;
}

export function designRecordBelongsToDiagramKinds(
  recordKey: string | null | undefined,
  record: unknown,
  diagramKinds: Iterable<DesignDiagramKind>,
) {
  const affected = new Set(diagramKinds);
  if (affected.size === 0) return false;
  const keyKind = designDiagramKindFromRecordKey(recordKey);
  if (keyKind && affected.has(keyKind)) return true;
  const diagramKind = designRecordStringField(record, "diagramKind");
  if (isDesignDiagramKind(diagramKind) && affected.has(diagramKind)) {
    return true;
  }
  const modelId = designRecordStringField(record, "modelId");
  const modelIdKind = designDiagramKindFromRecordKey(modelId);
  return Boolean(modelIdKind && affected.has(modelIdKind));
}

export function designTraceabilityTouchesDiagramKinds(
  entry: DesignModelTraceabilityEntry,
  diagramKinds: Iterable<DesignDiagramKind>,
  deletedModelIds: Iterable<string> = [],
) {
  const affected = new Set(diagramKinds);
  const deletedIds = new Set(deletedModelIds);
  if (affected.size === 0 && deletedIds.size === 0) return false;
  const touchesRef = (ref: ModelElementRef) => {
    const modelId = ref.modelId ?? "";
    const modelKind = designDiagramKindFromRecordKey(modelId);
    if (modelId && deletedIds.has(modelId)) return true;
    if (ref.elementId && deletedIds.has(ref.elementId)) return true;
    if (isDesignDiagramKind(ref.diagramKind) && affected.has(ref.diagramKind)) {
      return true;
    }
    return Boolean(modelKind && affected.has(modelKind));
  };
  return (
    touchesRef(entry.source) ||
    entry.targets.some(touchesRef) ||
    (entry.upstreamDesignRefs ?? []).some(touchesRef)
  );
}
