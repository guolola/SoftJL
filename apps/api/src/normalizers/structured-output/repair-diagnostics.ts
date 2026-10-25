// Preserves structured validation locations and field contracts across focused repair requests.
export interface RepairDiagnostic {
  path: string;
  modelId?: string;
  elementId?: string;
  name?: string;
  reason?: string;
  code?: string;
  message: string;
  expectedSchema?: Record<string, unknown>;
  relatedPaths?: string[];
  actual?: unknown;
  expected?: unknown;
  sourceUnitId?: string;
  repairHint?: string;
}

export function repairDiagnostics(error: unknown): RepairDiagnostic[] {
  const value = error as { diagnostics?: Array<Record<string, any>>; issues?: Array<Record<string, any>>; cause?: unknown } | undefined;
  if (Array.isArray(value?.diagnostics)) return value.diagnostics.map(issue => {
    const prefix = issue.responsePath && issue.path && issue.responsePath.endsWith(issue.path) ? issue.responsePath.slice(0, -issue.path.length) : "";
    return { path: issue.responsePath ?? issue.path ?? "", modelId: issue.modelId, elementId: issue.elementId, name: issue.name, reason: issue.reason, code: issue.code,
      message: issue.message, expectedSchema: issue.expectedSchema, actual: issue.actual, expected: issue.expected,
      sourceUnitId: issue.sourceUnitId, repairHint: issue.repairHint,
      relatedPaths: issue.relatedPaths?.map((path: string) => `${prefix}${path}`) };
  });
  if (Array.isArray(value?.issues)) {
    const flatten = (issues: Array<Record<string, any>>): RepairDiagnostic[] => issues.flatMap(issue => issue.unionErrors?.length
      ? issue.unionErrors.flatMap((branch: { issues: Array<Record<string, any>> }) => flatten(branch.issues))
      : [{ path: (issue.path ?? []).join("."), code: issue.code, message: issue.message,
        expectedSchema: issue.expected && issue.expected !== "undefined" ? { type: issue.expected } : undefined }]);
    return flatten(value.issues);
  }
  if (value?.cause) return repairDiagnostics(value.cause);
  const message = error instanceof Error ? error.message : String(error);
  return [...message.matchAll(/(?:\]\s*|^|\n)([A-Za-z][\w]*(?:\.\d+|\.[A-Za-z][\w]*)*)\s*:\s*([^\n]*)/g)]
    .map(match => ({ path: match[1]!, message: match[2]! }));
}
