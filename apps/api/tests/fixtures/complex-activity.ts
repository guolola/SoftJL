// Recreates branched retries and returns across parallel regions without project-specific generated data.
import type { ActivityDiagramSpec, ActivityNode, ActivityRelationship } from "@uml-platform/contracts";

const action = (id: string, name: string, actorOrLane = "system"): ActivityNode => ({ id, type: "activity", name, actorOrLane, input: [], output: [] });
const decision = (id: string, question: string): ActivityNode => ({ id, type: "decision", question, actorOrLane: "system" });
const edge = (sourceId: string, targetId: string, guard?: string): ActivityRelationship => ({ id: `${sourceId}-${targetId}`, type: "control_flow", sourceId, targetId, ...(guard ? { guard } : {}) });
const start: ActivityNode = { id: "start", type: "start", actorOrLane: "user" };
const end: ActivityNode = { id: "end", type: "end", actorOrLane: "system" };
const base = (nodes: ActivityNode[], relationships: ActivityRelationship[]): ActivityDiagramSpec => ({
  diagramKind: "activity", modelId: "complex-business-flow", title: "指导与考核评价业务流程", summary: "保留审核回退、评价修改与并行控制流", notes: [],
  swimlanes: [{ id: "user", name: "导师与学生" }, { id: "system", name: "管理系统" }], nodes, relationships,
});

export function branchedRetryActivity(): ActivityDiagramSpec {
  return base([
    start, action("log", "填写指导日志", "user"), decision("abnormal", "学业指标是否异常？"), action("warn", "提示学业预警"),
    { id: "commentMerge", type: "merge", actorOrLane: "system" }, action("comment", "填写文字点评", "user"), action("launch", "发起评价任务"),
    decision("open", "是否处于评价开放期？"), action("submit", "匿名提交评价", "user"), decision("modify", "是否修改评价？"),
    action("review", "审核点评数据"), decision("complete", "点评数据是否完整？"), action("compose", "合成考核成绩"), end,
  ], [
    edge("start", "log"), edge("log", "abnormal"), edge("abnormal", "warn", "异常"), edge("abnormal", "commentMerge", "正常"),
    edge("warn", "commentMerge"), edge("commentMerge", "comment"), edge("comment", "launch"), edge("launch", "open"),
    edge("open", "launch", "尚未开放"), edge("open", "submit", "已开放"), edge("submit", "modify"), edge("modify", "submit", "需要修改"),
    edge("modify", "review", "无需修改"), edge("review", "complete"),
    { ...edge("complete", "log", "审核退回"), condition: "点评次数不足", trigger: "管理员确认" },
    edge("complete", "compose", "审核通过"), edge("compose", "end"),
  ]);
}

export function parallelRetryActivity(): ActivityDiagramSpec {
  const input = branchedRetryActivity();
  input.nodes = [start, action("configure", "配置评价方案"), { id: "fork", type: "fork", actorOrLane: "system" },
    ...input.nodes.filter(node => !["start", "end", "launch", "open", "compose"].includes(node.id)),
    { id: "join", type: "join", actorOrLane: "system" }, action("launch", "发起评价任务"), action("score", "录入学院评价"),
    action("collect", "归集评价数据"), action("compose", "合成考核成绩"), { id: "outputFork", type: "fork", actorOrLane: "system" },
    action("export", "导出考核结果", "user"), action("stats", "生成管理统计"), { id: "outputJoin", type: "join", actorOrLane: "system" },
    decision("cycle", "是否进入下一周期？"), end];
  input.relationships = input.relationships.filter(item => !["start", "launch", "open", "comment", "modify", "review", "compose"].includes(item.sourceId));
  input.relationships.push(edge("start", "configure"), edge("configure", "fork"), edge("fork", "log", "过程管理"), edge("fork", "launch", "终结评价"),
    edge("comment", "submit"), edge("modify", "submit", "需要修改"), edge("modify", "join", "无需修改"), edge("launch", "score"), edge("score", "join"),
    edge("join", "collect"), edge("collect", "review"), edge("review", "complete"), edge("compose", "outputFork"),
    edge("outputFork", "export", "导出"), edge("outputFork", "stats", "统计"), edge("export", "outputJoin"), edge("stats", "outputJoin"),
    edge("outputJoin", "cycle"), edge("cycle", "configure", "调整方案并进入下一周期"), edge("cycle", "end", "本周期结束"));
  return input;
}
