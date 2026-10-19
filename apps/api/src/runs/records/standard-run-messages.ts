// Keeps user-visible tool states and result summaries consistent with durable run outcomes.
import type { StandardProjectState } from "@uml-platform/contracts";

function results(state: StandardProjectState) {
  const diagrams = (state.run?.work?.ids ?? []).map(id => state.diagrams[id]).filter(item => !!item);
  const completed = diagrams.filter(item => item.status === "completed");
  const failed = diagrams.filter(item => item.status !== "completed");
  return { diagrams, completed, failed };
}

export function appendStandardGenerationResult(state: StandardProjectState) {
  if (!state.run?.work?.ids.length) return;
  const id = `result:${state.run.id}`;
  if (state.conversation?.some(message => message.id === id)) return;
  const { diagrams, completed, failed } = results(state);
  const failures = failed.map(item => `- ${item.title}：${item.error || "尚未完成"}`).join("\n");
  state.conversation ??= [];
  state.conversation.push({ id, role: "assistant", status: "completed", createdAt: new Date().toISOString(),
    text: `本次共处理 ${diagrams.length} 张图：成功 ${completed.length} 张，失败 ${failed.length} 张。${failures ? `\n\n${failures}\n\n已保留成功产物，可指定失败的图继续处理。` : "可从左侧 UML 模型菜单查看。"}` });
}

export function interruptStandardRunMessages(state: StandardProjectState, reason: string) {
  for (const message of state.conversation ?? []) {
    let interrupted = message.status === "streaming";
    for (const tool of message.tools ?? []) if (tool.status === "running") { tool.status = "failed"; interrupted = true; }
    if (interrupted) message.status = "failed";
  }
  if (!state.run) return;
  const id = `interruption:${state.run.id}`;
  if (state.conversation?.some(message => message.id === id)) return;
  const { diagrams, completed, failed } = results(state);
  state.conversation ??= [];
  state.conversation.push({ id, role: "assistant", status: "completed", createdAt: new Date().toISOString(),
    text: `${reason}${diagrams.length ? `\n\n本次计划 ${diagrams.length} 张图，已完成 ${completed.length} 张，未完成 ${failed.length} 张。` : ""}\n\n已保留现有成果。可在此输入要继续处理的图表范围；继续前会读取已保存状态。` });
}
