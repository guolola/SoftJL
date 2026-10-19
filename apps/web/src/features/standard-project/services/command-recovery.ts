// Retains an unacknowledged command identifier across reloads; reconnect itself only performs reads.
import type { StandardCommand } from "./standard-api";
const key = (projectId: string) => `uml-standard-pending:${projectId}`;
export function pendingCommand(projectId: string): StandardCommand | null {
  try { const value = JSON.parse(sessionStorage.getItem(key(projectId)) ?? "null"); return typeof value?.requestId === "string" && typeof value.operation === "string" ? value : null; } catch { return null; }
}
export function retainCommand(projectId: string, command: StandardCommand | null) {
  try { if (command) sessionStorage.setItem(key(projectId), JSON.stringify(command)); else sessionStorage.removeItem(key(projectId)); } catch { /* Storage is optional; the server still guards concurrent starts. */ }
}
export function identifyCommand(projectId: string, command: StandardCommand): StandardCommand {
  const pending = pendingCommand(projectId);
  const { requestId: _previousId, ...previous } = pending ?? {};
  return { ...command, requestId: command.requestId ?? (pending && JSON.stringify(previous) === JSON.stringify(command) ? pending.requestId : crypto.randomUUID()) };
}
