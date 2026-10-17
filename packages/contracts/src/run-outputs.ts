// Defines stable run operations and accepted output references; omitted manifests identify legacy snapshots.
import { z } from "zod";
import { modelCapacitySchema } from "./model-catalog.js";

export const runOperationTypeSchema = z.enum([
  "requirement_extraction",
  "requirement_modeling",
  "feasibility_analysis",
  "design_modeling",
  "document_generation",
  "unknown",
]);
export type RunOperationType = z.infer<typeof runOperationTypeSchema>;
export const runOutputReferenceSchema = z.object({
  kind: z.enum([
    "rule",
    "model",
    "coverageMatrix",
    "traceabilityMatrix",
    "context",
    "businessFlow",
    "implementationPlan",
    "sections",
    "document",
  ]),
  id: z.string().min(1),
  diagramKind: z.string().optional(),
  sourceUseCaseId: z.string().optional(),
});
export type RunOutputReference = z.infer<typeof runOutputReferenceSchema>;
export const runOutputFields = {
  modelCapacity: modelCapacitySchema.optional(),
  // Fingerprints of relevant saved inputs and write targets at original start.
  workspaceGuard: z.object({ version: z.literal(1), inputs: z.record(z.string()), targets: z.record(z.string()) }).optional(),
  publicationSkipped: z.string().optional(),
  operationType: runOperationTypeSchema.optional(),
  outputManifest: z.array(runOutputReferenceSchema).optional(),
};
