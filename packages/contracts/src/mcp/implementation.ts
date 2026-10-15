// Defines source-backed implementation tasks and agent reports without trusting claimed verification results.
import { z } from "zod";
import { modelElementRefSchema } from "../models.js";
import { mcpScopeSchema, mcpSourceVersionSchema } from "./index.js";

const id = z.string().trim().min(1).max(512);
const text = z.string().trim().min(1).max(12000);
const hash = z.string().regex(/^sha256:[0-9a-fA-F]{64}$/);
const sourceVersion = mcpSourceVersionSchema.strict().refine(
  (version) => !version.artifactId.startsWith("implementation:"),
  "Implementation task artifacts cannot be used as original sources",
);

function unique<T>(values: T[], key: (value: T) => string, context: z.RefinementCtx, path: Array<string | number>) {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    const identity = key(value);
    if (seen.has(identity)) context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...path, index],
      message: `Duplicate reference: ${identity}`,
    });
    seen.add(identity);
  });
}

const ids = z.array(id).max(10000).superRefine((values, context) => {
  unique(values, (value) => value, context, []);
});

// Paths are repository-relative and portable; filesystem containment and symlinks are checked locally.
export const mcpImplementationPathSchema = z.string().min(1).max(1024).refine((value) => {
  if (value !== value.trim() || /[\\:<>"|?*\u0000-\u001f\u007f]/.test(value)) return false;
  return value.split("/").every((segment) =>
    Boolean(segment) && segment !== "." && segment !== ".." &&
    !/[. ]$/.test(segment) &&
    !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9]|conin\$|conout\$)(?:\.|$)/i.test(segment),
  );
}, "Expected a portable repository-relative path without traversal or device names");

export type McpImplementationPath = z.infer<typeof mcpImplementationPathSchema>;

export const mcpImplementationDesignRefSchema = modelElementRefSchema.extend({
  artifactId: id,
  modelId: id.optional(),
  elementId: id,
  elementKind: id,
  label: text,
}).strict();
export type McpImplementationDesignRef = z.infer<typeof mcpImplementationDesignRefSchema>;

const designRefKey = (ref: McpImplementationDesignRef) =>
  JSON.stringify([ref.artifactId, ref.modelId ?? null, ref.diagramKind, ref.elementKind, ref.elementId]);
const designRefs = z.array(mcpImplementationDesignRefSchema).max(10000).superRefine((values, context) => {
  unique(values, designRefKey, context, []);
});
const sourceVersions = z.array(sourceVersion).max(10000).superRefine((values, context) => {
  unique(values, (value) => value.artifactId, context, []);
});

export const mcpImplementationTaskSchema = z.object({
  id,
  title: text,
  requirementIds: ids,
  sourceArtifactIds: ids,
  designRefs,
  acceptanceCriteria: z.array(z.object({ id, text, sourceArtifactId: id }).strict()).max(10000),
  dependsOnTaskIds: ids,
  issues: z.array(z.object({
    code: id,
    severity: z.enum(["warning", "blocking"]),
    message: text,
  }).strict()).max(1000),
  guidance: z.array(text).max(1000),
}).strict().superRefine((task, context) => {
  unique(task.acceptanceCriteria, (criterion) => criterion.id, context, ["acceptanceCriteria"]);
  const sources = new Set(task.sourceArtifactIds);
  task.designRefs.forEach((ref, index) => {
    if (!sources.has(ref.artifactId)) context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["designRefs", index, "artifactId"],
      message: "Design references must belong to the task sources",
    });
  });
  task.acceptanceCriteria.forEach((criterion, index) => {
    if (!sources.has(criterion.sourceArtifactId)) context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["acceptanceCriteria", index, "sourceArtifactId"],
      message: "Acceptance criteria must belong to the task sources",
    });
  });
});
export type McpImplementationTask = z.infer<typeof mcpImplementationTaskSchema>;

export const mcpExpandedImplementationSnapshotSchema = z.object({
  version: z.literal(2),
  projectId: id,
  scope: mcpScopeSchema,
  contextVersion: id,
  manifest: sourceVersions,
  tasks: z.array(mcpImplementationTaskSchema).max(10000),
}).strict().superRefine((snapshot, context) => {
  unique(snapshot.tasks, (task) => task.id, context, ["tasks"]);
  const taskIds = new Set(snapshot.tasks.map((task) => task.id));
  const sourceIds = new Set(snapshot.manifest.map((source) => source.artifactId));
  const criterionIds = new Set<string>();
  snapshot.tasks.forEach((task, taskIndex) => {
    task.sourceArtifactIds.forEach((sourceId, index) => {
      if (!sourceIds.has(sourceId)) context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tasks", taskIndex, "sourceArtifactIds", index],
        message: "Task source is absent from the snapshot manifest",
      });
    });
    task.dependsOnTaskIds.forEach((taskId, index) => {
      if (!taskIds.has(taskId)) context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tasks", taskIndex, "dependsOnTaskIds", index],
        message: "Task dependency is absent from the snapshot",
      });
    });
    task.acceptanceCriteria.forEach((criterion, index) => {
      if (criterionIds.has(criterion.id)) context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tasks", taskIndex, "acceptanceCriteria", index, "id"],
        message: "Acceptance criterion IDs must be unique across the snapshot",
      });
      criterionIds.add(criterion.id);
    });
  });
});
export type McpImplementationSnapshot = z.infer<typeof mcpExpandedImplementationSnapshotSchema>;

const actualRef = z.object({
  path: mcpImplementationPathSchema,
  symbol: id.optional(),
  contentHash: hash,
}).strict();
const testRef = z.object({
  path: mcpImplementationPathSchema,
  testName: text.optional(),
  criterionIds: ids,
  contentHash: hash,
}).strict();

const reportEntry = z.object({
  taskId: id,
  requirementIds: ids,
  designRefs,
  sourceVersions,
  status: z.enum(["planned", "implemented"]),
  plannedTargets: z.array(z.object({
    path: mcpImplementationPathSchema,
    responsibility: text,
  }).strict()).max(10000),
  actualRefs: z.array(actualRef).max(10000),
  inputRefs: z.array(z.object({ path: mcpImplementationPathSchema, contentHash: hash }).strict()).max(10000).default([]),
  testRefs: z.array(testRef).max(10000),
  checks: z.array(z.object({
    id,
    kind: z.enum(["engineering", "behavior"]),
    command: z.string().trim().min(1).max(1024),
    args: z.array(z.string().max(12000)).max(1000),
    // Runners apply defaults; optional limits keep existing reports compatible.
    timeoutMs: z.number().int().min(1000).max(600000).optional(),
    maxOutputBytes: z.number().int().min(1024).max(4194304).optional(),
    criterionIds: ids,
  }).strict()).max(1000),
}).strict().superRefine((entry, context) => {
  unique(entry.plannedTargets, (ref) => ref.path, context, ["plannedTargets"]);
  unique(entry.actualRefs, (ref) => JSON.stringify([ref.path, ref.symbol ?? null]), context, ["actualRefs"]);
  unique(entry.inputRefs, (ref) => ref.path, context, ["inputRefs"]);
  unique(entry.testRefs, (ref) => JSON.stringify([ref.path, ref.testName ?? null]), context, ["testRefs"]);
  unique(entry.checks, (check) => check.id, context, ["checks"]);
  // Agent reports describe implementation only. A local verifier independently evaluates files and checks.
  if (entry.status === "planned") {
    for (const key of ["actualRefs", "inputRefs", "testRefs", "checks"] as const) {
      if (entry[key].length) context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: "Planned entries cannot claim implementation evidence",
      });
    }
  } else if (!entry.actualRefs.length) context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["actualRefs"],
    message: "Implemented entries require an actual code reference",
  });
});

export const mcpExpandedImplementationReportSchema = z.object({
  version: z.literal(2),
  projectId: id,
  scope: mcpScopeSchema,
  contextVersion: id,
  entries: z.array(reportEntry).max(10000),
}).strict().superRefine((report, context) => {
  unique(report.entries, (entry) => entry.taskId, context, ["entries"]);
});
export type McpImplementationReport = z.infer<typeof mcpExpandedImplementationReportSchema>;

// Wire v2 interns shared values; expansion is internal and never repeats data in MCP output.
const refs = z.array(z.number().int().min(0).max(99999)).max(10000).superRefine((values, context) => {
  unique(values, String, context, []);
});
const taskObject = mcpImplementationTaskSchema.innerType();
const compactSnapshot = z.object({
  version: z.literal(2), projectId: id, scope: mcpScopeSchema, contextVersion: id,
  manifest: sourceVersions,
  shared: z.object({
    sourceArtifactIds: ids,
    designRefs: z.array(mcpImplementationDesignRefSchema).max(100000).superRefine((values, context) => {
      unique(values, designRefKey, context, []);
    }),
    issues: z.array(taskObject.shape.issues.element).max(100000),
    guidance: z.array(text).max(100000),
  }).strict(),
  tasks: z.array(taskObject.omit({ sourceArtifactIds: true, designRefs: true, issues: true, guidance: true }).extend({
    sourceRefs: refs, designRefs: refs, issueRefs: refs, guidanceRefs: refs,
  }).strict()).max(10000),
}).strict().superRefine((snapshot, context) => {
  snapshot.tasks.forEach((task, index) => {
    for (const [field, pool] of [
      ["sourceRefs", snapshot.shared.sourceArtifactIds], ["designRefs", snapshot.shared.designRefs],
      ["issueRefs", snapshot.shared.issues], ["guidanceRefs", snapshot.shared.guidance],
    ] as const) task[field].forEach((ref, position) => {
      if (ref >= pool.length) context.addIssue({ code: z.ZodIssueCode.custom,
        path: ["tasks", index, field, position], message: "Shared reference is out of range" });
    });
  });
});

const compactReport = z.object({
  version: z.literal(2), projectId: id, scope: mcpScopeSchema, contextVersion: id,
  // Versions belong to the report itself, never to the refreshed snapshot. Keep distinct historical versions.
  sourceVersions: z.array(sourceVersion).max(100000),
  entries: z.array(reportEntry.innerType().omit({ sourceVersions: true }).extend({ sourceVersionRefs: refs }).strict()).max(10000),
}).strict().superRefine((report, context) => {
  report.entries.forEach((entry, index) => entry.sourceVersionRefs.forEach((ref, position) => {
    if (ref >= report.sourceVersions.length) context.addIssue({ code: z.ZodIssueCode.custom,
      path: ["entries", index, "sourceVersionRefs", position], message: "Source version reference is out of range" });
  }));
});

export const mcpImplementationSnapshotSchema = compactSnapshot.transform(({ shared, tasks, ...snapshot }) => ({
  ...snapshot,
  tasks: tasks.map(({ sourceRefs, designRefs, issueRefs, guidanceRefs, ...task }) => ({
    ...task, sourceArtifactIds: sourceRefs.map((ref) => shared.sourceArtifactIds[ref]),
    designRefs: designRefs.map((ref) => shared.designRefs[ref]),
    issues: issueRefs.map((ref) => shared.issues[ref]), guidance: guidanceRefs.map((ref) => shared.guidance[ref]),
  })),
})).pipe(mcpExpandedImplementationSnapshotSchema);

export const mcpImplementationReportSchema = compactReport.transform(({ sourceVersions, entries, ...report }) => ({
  ...report, entries: entries.map(({ sourceVersionRefs, ...entry }) => ({
    ...entry, sourceVersions: sourceVersionRefs.map((ref) => sourceVersions[ref]),
  })),
})).pipe(mcpExpandedImplementationReportSchema);

export type McpCompactImplementationSnapshot = z.input<typeof mcpImplementationSnapshotSchema>;
export type McpCompactImplementationReport = z.input<typeof mcpImplementationReportSchema>;
// JSON Schema describes the wire data rather than the internal expanded representation.
export const mcpImplementationReportWireSchema = compactReport;

function pool<T>() {
  const values: T[] = [], indices = new Map<string, number>();
  return { values, ref(value: T) {
    const key = JSON.stringify(value);
    let index = indices.get(key);
    if (index === undefined) { index = values.length; values.push(value); indices.set(key, index); }
    return index;
  } };
}

export function compactImplementationSnapshot(snapshot: McpImplementationSnapshot): McpCompactImplementationSnapshot {
  const sources = pool<string>(), designs = pool<McpImplementationDesignRef>();
  const issues = pool<McpImplementationTask["issues"][number]>(), guidance = pool<string>();
  const tasks = snapshot.tasks.map(({ sourceArtifactIds, designRefs, issues: taskIssues, guidance: taskGuidance, ...task }) => ({
    ...task, sourceRefs: sourceArtifactIds.map((value) => sources.ref(value)),
    designRefs: designRefs.map((value) => designs.ref(value)),
    issueRefs: taskIssues.map((value) => issues.ref(value)), guidanceRefs: taskGuidance.map((value) => guidance.ref(value)),
  }));
  return { ...snapshot, tasks, shared: {
    sourceArtifactIds: sources.values, designRefs: designs.values, issues: issues.values, guidance: guidance.values,
  } };
}

export function compactImplementationReport(report: McpImplementationReport): McpCompactImplementationReport {
  const versions = pool<McpImplementationReport["entries"][number]["sourceVersions"][number]>();
  const entries = report.entries.map(({ sourceVersions, ...entry }) => ({
    ...entry, sourceVersionRefs: sourceVersions.map((value) => versions.ref(value)),
  }));
  return { ...report, entries, sourceVersions: versions.values };
}
