// Maps quick-modeling runs to the shared completion sound, excluding conversational-only turns.
import type { StandardProjectState } from "@uml-platform/contracts";
import { useGenerationCompletionChime, type GenerationCompletionTask } from "../../../shared/lib/generation-completion-chime";

const generationOperations = new Set(["generate", "retry", "tests", "requirementsSpec", "softwareDesignSpec"]);
const generationTools = new Set(["generate_diagrams", "save_diagram", "generate_tests", "generate_document"]);

function hasGenerationWork(state: StandardProjectState) {
  const run = state.run!;
  if (generationOperations.has(run.operation) || generationOperations.has(run.resumeOperation ?? "") || run.work?.ids.length) return true;
  // Only inspect this run's durable user turn; old generated artifacts do not make a new chat a generation task.
  const messages = state.conversation ?? [];
  const start = messages.findIndex(message => message.role === "user" && message.id === `user:${run.requestId ?? run.id}`);
  return start >= 0 && messages.slice(start + 1).some(message => message.tools?.some(tool => generationTools.has(tool.name)));
}

export function useStandardCompletionChime(projectId: string, state: StandardProjectState | null) {
  const run = state?.run;
  const tasks: GenerationCompletionTask[] = run ? [{
    clientTaskId: `standard:${projectId}:${run.id}`,
    // Observe running snapshots before tools arrive; only a generation outcome should chime when the turn settles.
    status: run.status === "stopped" || run.status !== "running" && !hasGenerationWork(state!) ? "cancelled" : run.status,
  }] : [];
  useGenerationCompletionChime(tasks);
}
