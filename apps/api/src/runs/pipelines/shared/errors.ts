// Owns run-scoped error objects so routes, pipelines, snapshots, and SSE stay aligned.
import {
  ModelSemanticError,
  runErrorSchema,
  type RunError,
  type RunErrorCategory,
  type RunErrorCode,
} from "@uml-platform/contracts";

export function getErrorMessage(error: unknown) {
  const runError = getRunError(error);
  if (runError) return runError.message;
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export class RunPipelineError extends Error {
  readonly runError: RunError;

  constructor(runError: RunError) {
    super(runError.message);
    this.name = "RunPipelineError";
    this.runError = runError;
  }
}

const RUN_ERROR_DEFAULTS: Record<
  RunErrorCode,
  { category: RunErrorCategory; retryable: boolean; message: string }
> = {
  USER_ENTITLEMENT_REQUIRED: {
    category: "user_entitlement",
    retryable: false,
    message: "当前账户没有可用于 AI 生成的权益，请先购买次数包。",
  },
  USER_ENTITLEMENT_NEGATIVE_BALANCE: {
    category: "user_entitlement",
    retryable: false,
    message: "账户权益余额异常，请先购买次数包或联系管理员处理。",
  },
  PLATFORM_PROVIDER_BALANCE_INSUFFICIENT: {
    category: "platform_provider",
    retryable: true,
    message: "当前模型服务额度不足，请稍后重试或联系管理员。",
  },
  PLATFORM_PROVIDER_AUTH_FAILED: {
    category: "platform_provider",
    retryable: false,
    message: "当前模型服务配置不可用，请联系管理员处理。",
  },
  PLATFORM_PROVIDER_RATE_LIMITED: {
    category: "platform_provider",
    retryable: true,
    message: "当前模型服务请求较多，请稍后重试。",
  },
  PLATFORM_PROVIDER_UNAVAILABLE: {
    category: "platform_provider",
    retryable: true,
    message: "当前模型服务暂不可用，请稍后重试。",
  },
  PLATFORM_PROVIDER_TIMEOUT: {
    category: "platform_provider",
    retryable: true,
    message: "当前模型服务响应超时，请稍后重试。",
  },
  RUN_MODEL_OUTPUT_EMPTY: {
    category: "generation",
    retryable: true,
    message: "模型未生成有效结果，请重试或检查模型输出。",
  },
  RUN_REQUIREMENT_INPUT_UNSAFE: {
    category: "generation",
    retryable: false,
    message: "需求文本包含疑似指挥模型改变任务的内容，请修改后重试。",
  },
  RUN_REQUIREMENT_INPUT_IRRELEVANT: {
    category: "generation",
    retryable: false,
    message: "未发现可用于抽取的软件需求，请补充功能、规则或约束后重试。",
  },
  RUN_REQUIREMENT_SCREENING_FAILED: {
    category: "generation",
    retryable: true,
    message: "需求输入检查未完成，请稍后重试。",
  },
  RUN_REQUIREMENT_RULES_EMPTY: {
    category: "generation",
    retryable: true,
    message: "未提取到有来源依据的需求规则，请检查需求描述或重试。",
  },
  RUN_STRUCTURED_OUTPUT_INVALID: {
    category: "generation",
    retryable: true,
    message: "模型返回的结构化结果不合法，请重试。",
  },
  RUN_DEPENDENCY_MISSING: {
    category: "generation",
    retryable: false,
    message: "生成依赖缺失，请先补齐前置结果。",
  },
  RUN_RENDER_FAILED: {
    category: "render",
    retryable: true,
    message: "图形渲染失败，请检查模型结果后重试。",
  },
  RUN_CANCELLED: {
    category: "generation",
    retryable: false,
    message: "任务已取消。",
  },
  RUN_INTERNAL_ERROR: {
    category: "internal",
    retryable: true,
    message: "生成任务失败，请稍后重试。",
  },
  RUN_LEGACY_FAILURE: {
    category: "internal",
    retryable: false,
    message: "历史运行失败。",
  },
};

export function createRunError(
  code: RunErrorCode,
  message = RUN_ERROR_DEFAULTS[code].message,
  options: {
    category?: RunErrorCategory;
    retryable?: boolean;
    params?: Record<string, string | number | boolean | null>;
    details?: Record<string, unknown>;
  } = {},
): RunError {
  const defaults = RUN_ERROR_DEFAULTS[code];
  return runErrorSchema.parse({
    code,
    message,
    category: options.category ?? defaults.category,
    retryable: options.retryable ?? defaults.retryable,
    params: options.params,
    details: options.details,
  });
}

export function throwRunError(error: RunError): never {
  throw new RunPipelineError(error);
}

export function getRunError(error: unknown): RunError | null {
  if (error instanceof RunPipelineError) return error.runError;
  const parsed = runErrorSchema.safeParse(error);
  if (parsed.success) return parsed.data;
  if (error && typeof error === "object" && "runError" in error) {
    const nested = runErrorSchema.safeParse((error as { runError?: unknown }).runError);
    if (nested.success) return nested.data;
  }
  return null;
}

export function normalizeRunError(error: unknown): RunError {
  const existing = getRunError(error);
  if (existing) return existing;

  const message = error instanceof Error ? error.message : String(error);
  const semanticError = error instanceof ModelSemanticError ? error : error instanceof Error && error.cause instanceof ModelSemanticError ? error.cause : null;
  if (semanticError) return createRunError("RUN_STRUCTURED_OUTPUT_INVALID", message, { details: { diagnostics: semanticError.diagnostics } });
  const lower = message.toLowerCase();

  if (
    /http\s+402/.test(lower) ||
    lower.includes("insufficient balance") ||
    lower.includes("balance is insufficient") ||
    lower.includes("insufficient quota") ||
    lower.includes("quota exhausted") ||
    lower.includes("余额不足") ||
    lower.includes("额度不足") ||
    lower.includes("账户余额") ||
    lower.includes("欠费")
  ) {
    return createRunError("PLATFORM_PROVIDER_BALANCE_INSUFFICIENT", undefined, {
      details: { providerMessage: message },
    });
  }

  if (/http\s+401/.test(lower) || /http\s+403/.test(lower)) {
    return createRunError("PLATFORM_PROVIDER_AUTH_FAILED", undefined, {
      details: { providerMessage: message },
    });
  }

  if (/http\s+429/.test(lower) || lower.includes("rate limit")) {
    return createRunError("PLATFORM_PROVIDER_RATE_LIMITED", undefined, {
      details: { providerMessage: message },
    });
  }

  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("超时") ||
    lower.includes("长时间无有效输出") ||
    lower.includes("长时间仅收到空白输出")
  ) {
    return createRunError("PLATFORM_PROVIDER_TIMEOUT", undefined, {
      details: { providerMessage: message },
    });
  }

  if (/http\s+5\d\d/.test(lower) || lower.includes("fetch failed")) {
    return createRunError("PLATFORM_PROVIDER_UNAVAILABLE", undefined, {
      details: { providerMessage: message },
    });
  }

  if (
    lower.includes("must return at least one model") ||
    lower.includes("缺少 sequence 模型") ||
    lower.includes("生成结果为空")
  ) {
    return createRunError("RUN_MODEL_OUTPUT_EMPTY", message);
  }

  if (
    lower.includes("structured output failed") ||
    lower.includes("json") ||
    lower.includes("schema") ||
    lower.includes("invalid_type")
  ) {
    return createRunError("RUN_STRUCTURED_OUTPUT_INVALID", message);
  }

  if (lower.includes("缺少") || lower.includes("dependency")) {
    return createRunError("RUN_DEPENDENCY_MISSING", message);
  }

  if (lower.includes("render") || lower.includes("plantuml")) {
    return createRunError("RUN_RENDER_FAILED", message);
  }

  return createRunError("RUN_INTERNAL_ERROR", message);
}

export function isPlatformProviderRunError(error: RunError) {
  return error.category === "platform_provider";
}
