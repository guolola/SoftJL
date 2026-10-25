// Identifies deterministic model-to-PlantUML failures so pipelines repair the candidate instead of retrying it unchanged.
export interface ModelCompilationDiagnostic {
  code: string;
  path: string;
  modelId?: string;
  elementId?: string;
  name?: string;
  message: string;
}

export class ModelCompilationError extends Error {
  constructor(message: string, readonly diagnostics: ModelCompilationDiagnostic[], options?: ErrorOptions) {
    super(message, options);
    this.name = "ModelCompilationError";
  }
}
