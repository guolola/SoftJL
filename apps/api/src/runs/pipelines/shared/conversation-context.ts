// Applies project naming without implicitly carrying facts between model tasks.
import type { LlmTransport } from "../../../llm.js";

// Generation helpers own their task-local message history. This wrapper adds
// project naming without sharing conversation turns between sibling tasks.
export function withConversationBranch<T>(_id: string, work: () => Promise<T>): Promise<T> { return work(); }
export function withIsolatedConversationBranch<T>(_id: string, work: () => Promise<T>): Promise<T> { return work(); }

function systemNameConstraint(systemName: string) {
  return `系统名称约束：本项目的系统统一命名为“${systemName}”。所有模型的标题、系统边界、中心系统和说明中提到本系统时都必须使用这个名称，不得改写、扩展或缩写。`;
}
export function systemNameFromProjectName(projectName: string | null | undefined) {
  const name = projectName?.trim();
  return name && /(系统|平台|system|platform)$/iu.test(name) ? name : undefined;
}
export function createContextualLlmTransport(transport: LlmTransport, options: { systemName?: string } = {}) {
  const contextual: LlmTransport = {
    async *streamChatCompletion(input) {
      const messages = input.messages.map(message => ({ ...message }));
      if (options.systemName) {
        const index = messages.findIndex(message => message.role === "system");
        const system = messages[index];
        const constraint = systemNameConstraint(options.systemName);
        if (!system) messages.unshift({ role: "system", content: constraint });
        else if (typeof system.content === "string" && !system.content.includes("系统名称约束：")) {
          messages[index] = { ...system, content: `${system.content}\n\n${constraint}` };
        } else if (Array.isArray(system.content)) {
          messages[index] = { ...system, content: [...system.content, { type: "text", text: constraint }] };
        }
      }
      yield* transport.streamChatCompletion({ ...input, messages });
    },
  };
  return {
    transport: contextual,
    // Lifecycle hooks retained for callers; validated artifacts travel explicitly.
    forkBranches(_ids: string[]) {},
    commitValidatedBranch(_id: string, _summary: string) {},
  };
}
