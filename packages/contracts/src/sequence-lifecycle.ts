// Checks lifeline existence along alternative execution paths, without serializing alt operands.
import type { AnalysisSequenceDiagramSpec, SequenceDiagramSpec } from "./models.js";

type Life = "unborn" | "live" | "dead";
type State = Map<string, Set<Life>>;

export function validateSequenceLifecycle(
  model: SequenceDiagramSpec | AnalysisSequenceDiagramSpec,
  report: (code: string, path: string, message: string, id?: string) => void,
) {
  const positions = new Map(model.messages.map((message, index) => [message.id, index]));
  const clone = (state: State): State => new Map([...state].map(([id, values]) => [id, new Set(values)]));
  const merge = (states: State[]): State => new Map(model.participants.map((participant) => [participant.id, new Set(states.flatMap((state) => [...state.get(participant.id) ?? []]))]));
  const initial: State = new Map(model.participants.map((participant) => [participant.id, new Set<Life>([model.messages.some((message) => message.type === "create" && message.targetId === participant.id) ? "unborn" : "live"])]));
  const run = (ids: string[], state: State, parentId?: string, branchId?: string): State => {
    const children = model.fragments.filter((fragment) => fragment.parentFragmentId === parentId && fragment.parentBranchId === branchId);
    for (let index = 0; index < ids.length; index++) {
      const id = ids[index]!;
      const fragment = children.find((item) => item.messageIds.includes(id));
      if (fragment) {
        const operands = fragment.branches?.length ? fragment.branches : [{ id: undefined, messageIds: fragment.messageIds }];
        const outputs = operands.map((operand) => run([...operand.messageIds].sort((a, b) => positions.get(a)! - positions.get(b)!), clone(state), fragment.id, operand.id));
        if (fragment.type === "opt" || fragment.type === "loop") outputs.push(clone(state));
        if (fragment.type === "par") {
          // Parallel operands share entry state. Independent changes combine; conflicting lifetime writes are ambiguous.
          for (const participant of model.participants) {
            const changed = outputs.filter((output) => [...output.get(participant.id) ?? []].join() !== [...state.get(participant.id) ?? []].join());
            if (changed.length > 1) report("parallel-lifetime", "fragments", "并行分支不能同时改变同一生命线的创建或销毁状态", fragment.id);
            if (changed.length) state.set(participant.id, new Set(changed.flatMap((output) => [...output.get(participant.id) ?? []])));
          }
        } else state = merge(outputs);
        index += fragment.messageIds.length - 1;
        continue;
      }
      const messageIndex = positions.get(id)!;
      const message = model.messages[messageIndex]!;
      for (const participantId of new Set([message.sourceId, message.targetId])) {
        if (message.type === "create" && participantId === message.targetId) continue;
        const life = state.get(participantId);
        if (life?.has("unborn")) report("message-before-create", `messages.${messageIndex}`, "消息在至少一条执行路径中引用尚未创建的生命线", id);
        if (life?.has("dead")) report("message-after-destroy", `messages.${messageIndex}`, "消息在至少一条执行路径中引用已销毁的生命线", id);
      }
      if (message.type === "create") {
        if ([...state.get(message.targetId) ?? []].some((life) => life !== "unborn")) report("duplicate-create", `messages.${messageIndex}`, "同一执行路径中的生命线不能重复创建", id);
        state.set(message.targetId, new Set(["live"]));
      }
      if (message.type === "destroy") state.set(message.targetId, new Set(["dead"]));
    }
    return state;
  };
  run(model.messages.map((message) => message.id), initial);
}
