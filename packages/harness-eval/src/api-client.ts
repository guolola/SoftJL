// Evaluates runs through the same authenticated project and managed-provider boundary as the application.
import type { RunSnapshot } from "@uml-platform/contracts";

type EvaluationInput = { requirementText: string; selectedDiagrams: RunSnapshot["selectedDiagrams"] };

export function assertEvaluationApiConfig(env: NodeJS.ProcessEnv) {
  const required = ["UML_EVAL_PROJECT_ID", "UML_EVAL_PROVIDER_CONFIG_ID", "UML_EVAL_MODEL"];
  const missing = required.filter((name) => !env[name]?.trim());
  if (!env.UML_EVAL_SESSION_COOKIE?.trim() && !(env.UML_EVAL_EMAIL?.trim() && env.UML_EVAL_PASSWORD)) {
    missing.push("UML_EVAL_SESSION_COOKIE 或 UML_EVAL_EMAIL + UML_EVAL_PASSWORD");
  }
  if (missing.length) throw new Error(`缺少评测配置：${missing.join("、")}`);
}

export async function createEvaluationApiClient(env: NodeJS.ProcessEnv, send: typeof fetch = fetch) {
  assertEvaluationApiConfig(env);
  const origin = (env.UML_EVAL_API_BASE_URL ?? "http://127.0.0.1:4101").replace(/\/$/, "");
  const projectId = env.UML_EVAL_PROJECT_ID!;
  let cookie = env.UML_EVAL_SESSION_COOKIE?.trim();
  const ownsSession = !cookie;
  const timeoutMs = Number(env.UML_EVAL_TIMEOUT_MS ?? 180000);
  const pollMs = Number(env.UML_EVAL_POLL_MS ?? 1000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(pollMs) || pollMs < 0) {
    throw new Error("评测超时和轮询间隔配置无效");
  }
  if (!cookie) {
    const response = await send(`${origin}/api/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: env.UML_EVAL_EMAIL, password: env.UML_EVAL_PASSWORD }),
      signal: AbortSignal.timeout(timeoutMs), redirect: "error",
    });
    if (response.status === 202) throw new Error("评测账号需要多因素认证，请完成登录后配置 UML_EVAL_SESSION_COOKIE");
    if (!response.ok) throw new Error(`评测登录失败：HTTP ${response.status}`);
    cookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    if (!cookie) throw new Error("评测登录未返回会话 Cookie");
  }
  const headers = { "Content-Type": "application/json", Cookie: cookie, "x-uml-project-id": projectId };
  const request = async (path: string, options: RequestInit = {}) => {
    const response = await send(`${origin}${path}`, { ...options, headers, signal: options.signal ?? AbortSignal.timeout(timeoutMs), redirect: "error" });
    // HTTP status is enough for diagnostics; response bodies can contain private provider details.
    if (!response.ok) throw new Error(`评测接口失败：HTTP ${response.status} ${path}`);
    return response;
  };
  return {
    async run(input: EvaluationInput): Promise<RunSnapshot> {
      const signal = AbortSignal.timeout(timeoutMs);
      const response = await request("/api/runs", { method: "POST", signal, body: JSON.stringify({
        // The project header authorizes this full fixture input. A body projectId selects saved workspace inputs instead.
        ...input, providerSettings: { providerConfigId: env.UML_EVAL_PROVIDER_CONFIG_ID, model: env.UML_EVAL_MODEL },
      }) });
      const { runId } = await response.json() as { runId: string };
      if (typeof runId !== "string" || !runId) throw new Error("评测启动响应缺少运行编号");
      while (!signal.aborted) {
        const result = await request(`/api/runs/${encodeURIComponent(runId)}`, { signal });
        const snapshot = await result.json() as RunSnapshot;
        if (["completed", "failed", "cancelled"].includes(snapshot.status)) return snapshot;
        await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, 1000)));
      }
      throw new Error(`评测运行超时：${runId}`);
    },
    async close() {
      // Revoke only sessions created here; caller-supplied browser sessions remain owned by the caller.
      if (ownsSession) await request("/api/auth/logout", { method: "POST", body: "{}" });
    },
  };
}
