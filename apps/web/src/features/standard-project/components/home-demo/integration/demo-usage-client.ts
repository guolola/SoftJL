// The source's daily conversation quota is not equivalent to the platform's per-generation quota.
// Leave that optional gate unresolved; the platform API remains the authoritative quota guard.
type DemoUsageState = { status: "loading" } | { status: "ready"; usage: { remaining: number; resetAt: number; limit: number } };
export function useDemoUsage(): DemoUsageState { return { status: "loading" }; }
export function refreshDemoUsage(): void {}
