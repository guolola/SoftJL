// Groups actual execution receipts by artifact; product areas only supply labels and icons.
import type { RunStage } from "@uml-platform/contracts";
import type { TFunction } from "i18next";
import { DESIGN_DIAGRAM_META, DIAGRAM_META, getDesignDiagramLabel, getDiagramLabel, type DesignDiagramType, type DiagramType } from "../../../entities/diagram/model";
import type { TranscriptCall, TranscriptStep } from "./generation-transcript";

type ArtifactType = NonNullable<TranscriptStep["artifactType"]>;
interface StageArtifact {
  type: ArtifactType;
  title: string;
  catalog?: "requirements" | "design";
  aggregate?: boolean;
}

// Stage metadata describes the generated object, never a predetermined sequence of steps.
const artifacts: Partial<Record<RunStage, StageArtifact>> = {
  extract_rules: { type: "requirement-rules", title: "抽取需求规则" },
  generate_models: { type: "model", title: "生成需求模型", catalog: "requirements" },
  generate_design_models: { type: "model", title: "生成设计模型", catalog: "design" },
  generate_design_sequence: { type: "model", title: "生成用例实现设计", catalog: "design" },
  generate_context: { type: "model", title: "生成系统环境图" },
  generate_business_flow: { type: "model", title: "生成业务流程图" },
  generate_implementation: { type: "implementation", title: "生成实现方案" },
  generate_document_text: { type: "document", title: "生成说明书正文", aggregate: true },
  generate_tests: { type: "tests", title: "生成测试用例" },
};
const publication: Partial<Record<RunStage, { title: string; owner?: RunStage }>> = {
  generate_plantuml: { title: "绘制并保存" },
  render_svg: { title: "绘制并保存" },
  verify_diagram_visual: { title: "绘制并保存" },
  render_context: { title: "绘制并保存", owner: "generate_context" },
  render_business_flow: { title: "绘制并保存", owner: "generate_business_flow" },
  render_document_file: { title: "排版并生成文档", owner: "generate_document_text" },
};

interface ArtifactTask {
  key: string;
  stage: RunStage;
  meta: StageArtifact;
  title: string;
  diagramKind?: string;
  identities: Set<string>;
  work: Array<{ call: TranscriptCall; publication: boolean; title?: string }>;
  step: TranscriptStep;
  order: number;
}

function summarize(calls: TranscriptCall[], fallback: TranscriptStep["status"]) {
  const active = calls.some(call => call.status === "running" || call.status === "queued");
  return { status: active ? "running" as const : calls.at(-1)?.status ?? fallback, finished: !active };
}
function generatedTitle(title: string) {
  return /^(生成|抽取)/.test(title) ? title : `生成${title}`;
}
function identities(call: TranscriptCall) {
  return [call.modelId, call.subtaskId].filter((id): id is string => Boolean(id));
}
function coverageRepair(call: TranscriptCall) {
  return Boolean(call.coverageMessage || call.title.includes("补全模型与需求的对应关系"));
}
function isPublicationCall(call: TranscriptCall) {
  return !call.tools?.length && !["model_repair", "render_repair", "model_compile"].includes(call.operation ?? "");
}

export function groupGenerationArtifactTasks(steps: TranscriptStep[], t: TFunction): TranscriptStep[] {
  const tasks = new Map<string, ArtifactTask>();
  const owners = new Map<TranscriptCall, ArtifactTask>();
  const ordered = new Map<TranscriptCall, number>();
  let fallbackOrder = 0;
  for (const step of steps) for (const call of step.calls) ordered.set(call, call.eventOrder ?? fallbackOrder++);
  const category = (task: ArtifactTask) => {
    const kind = task.diagramKind;
    if (kind && task.meta.catalog === "design" && kind in DESIGN_DIAGRAM_META) return getDesignDiagramLabel(kind as DesignDiagramType, t);
    if (kind && task.meta.catalog === "requirements" && kind in DIAGRAM_META) return getDiagramLabel(kind as DiagramType, t);
    return undefined;
  };

  for (const step of steps) {
    const meta = artifacts[step.stage];
    if (!meta) continue;
    for (const call of step.calls) {
      if (coverageRepair(call) || !call.modelId && !call.subtaskId && !call.diagramKind) continue;
      // A model's explicit identity is shared by generation, validation, repairs and publication.
      const identity = meta.aggregate ? step.stage : call.modelId ?? call.subtaskId ?? call.diagramKind!;
      const key = `${step.stage}:${identity}`;
      let task = tasks.get(key);
      if (!task) {
        const kind = call.diagramKind ?? (meta.catalog ? call.subtaskId?.split(":")[0] : undefined);
        task = { key, stage: step.stage, meta, title: meta.aggregate || meta.type === "requirement-rules" ? meta.title : call.title.split(" · ")[0]!, diagramKind: kind,
          identities: new Set(), work: [], step, order: ordered.get(call)! };
        tasks.set(key, task);
      }
      for (const id of identities(call)) task.identities.add(id);
      task.step = step;
      task.diagramKind ??= call.diagramKind;
      task.work.push({ call, publication: false });
      owners.set(call, task);
    }
  }

  const findOwner = (call: TranscriptCall, ownerStage?: RunStage) => {
    const eligible = [...tasks.values()].filter(task => !ownerStage || task.stage === ownerStage);
    const exact = eligible.filter(task => identities(call).some(id => task.identities.has(id)));
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) return undefined;
    const sameKind = call.diagramKind ? eligible.filter(task => task.diagramKind === call.diagramKind) : [];
    if (sameKind.length === 1) return sameKind[0];
    // Stage ownership is explicit metadata for a single exported document or feasibility artifact.
    if (ownerStage && eligible.length === 1) return eligible[0];
    return undefined;
  };
  for (const step of steps) for (const call of step.calls.filter(coverageRepair)) {
    const task = findOwner(call, step.stage);
    if (!task) continue;
    task.work.push({ call, publication: false });
    owners.set(call, task);
    for (const id of identities(call)) task.identities.add(id);
  }
  const remaining: TranscriptStep[] = [];
  for (const step of steps) {
    const publish = publication[step.stage];
    if (!publish) {
      if (!artifacts[step.stage]) { remaining.push(step); continue; }
      const unowned = step.calls.filter(call => !owners.has(call));
      // Unscoped diagnostics retain their own place; they never become a neighboring artifact's work.
      const messages = unowned.length || !step.calls.length ? step.messages : step.messages.filter(message => /修复|重试|复核|补跑/.test(message));
      if (unowned.length || messages.length || !step.calls.length) remaining.push({ ...step, calls: unowned, messages });
      continue;
    }
    const unowned: TranscriptCall[] = [];
    for (const call of step.calls) {
      const task = findOwner(call, publish.owner);
      if (!task) { unowned.push(call); continue; }
      task.work.push({ call, publication: isPublicationCall(call), title: publish.title });
      for (const id of identities(call)) task.identities.add(id);
    }
    // A bare shared stage is lifecycle scaffolding, not proof that every model executed it.
    if (unowned.length) remaining.push({ ...step, title: publish.title,
      artifactType: publish.owner ? artifacts[publish.owner]?.type : "model",
      calls: unowned.map(call => isPublicationCall(call) ? { ...call, title: publish.title, operation: "publish" } : call), messages: [] });
    else if (!step.calls.length && publish.owner) {
      const task = findOwner({ id: "", title: "", status: step.status, output: "", summary: "", thinking: false, technical: false }, publish.owner);
      if (task) task.work.push({ call: { id: step.id ?? step.stage, stage: step.stage, title: publish.title, eventOrder: step.eventOrder,
        status: step.status, output: "", summary: "", thinking: false, technical: false }, publication: true, title: publish.title });
      else remaining.push({ ...step, title: publish.title });
    }
  }

  const parents: TranscriptStep[] = [...tasks.values()].map(task => {
    const calls: TranscriptCall[] = [];
    let publishCall: TranscriptCall | undefined;
    for (const work of task.work.sort((a, b) => (ordered.get(a.call) ?? a.call.eventOrder ?? Infinity) - (ordered.get(b.call) ?? b.call.eventOrder ?? Infinity))) {
      if (!work.publication) { calls.push(work.call); publishCall = undefined; continue; }
      // Consecutive backend receipts form one real publication operation, not three synthetic AI tasks.
      if (!publishCall) {
        publishCall = { ...work.call, id: `${task.key}:publish:${work.call.id}`, title: work.title!,
          operation: "publish", artifactKind: undefined, tools: undefined, message: undefined };
        calls.push(publishCall);
      } else {
        if ((work.call.statusOrder ?? ordered.get(work.call) ?? Infinity) >= (publishCall.statusOrder ?? publishCall.eventOrder ?? -1)) {
          publishCall.status = work.call.status;
          publishCall.statusOrder = work.call.statusOrder ?? ordered.get(work.call);
          publishCall.finishedAt = work.call.finishedAt;
        }
        publishCall.inputImages = [...(publishCall.inputImages ?? []), ...(work.call.inputImages ?? [])];
      }
    }
    const summary = summarize(calls, task.step.status);
    // A completed provider query/validation is not an accepted artifact. Its
    // producer stays open until publication or the pipeline's terminal receipt.
    if (summary.status === "completed" && !task.work.some(work => work.publication) && calls.some(call => call.tools?.length)) {
      summary.status = task.step.status;
      summary.finished = Boolean(task.step.finished);
    }
    if (calls.some(call => call.coverageIncomplete) && summary.finished && summary.status === "completed") summary.status = "pending_review";
    return { id: task.key, stage: task.stage, title: generatedTitle(task.title), messages: [], calls,
      ...summary, artifactTask: true, artifactType: task.meta.type, diagramKind: task.diagramKind, compactCalls: true };
  });
  const result: TranscriptStep[] = [];
  const emitted = new Set<string>();
  for (const parent of parents) {
    const task = tasks.get(parent.id!)!;
    const title = category(task);
    const siblings = title ? parents.filter(item => item.stage === parent.stage && item.diagramKind === parent.diagramKind) : [parent];
    const namedItems = parent.diagramKind === "analysis" || parent.diagramKind === "sequence";
    if (!title || siblings.length === 1 && !namedItems) { result.push({ ...parent, title: title ? generatedTitle(title) : parent.title }); continue; }
    const key = `${parent.stage}:${parent.diagramKind}`;
    if (emitted.has(key)) continue;
    emitted.add(key);
    result.push({ id: `${key}:group`, stage: parent.stage, title: generatedTitle(title), messages: [], calls: [], children: siblings,
      artifactTask: true, artifactGroup: true, artifactType: parent.artifactType, diagramKind: parent.diagramKind,
      status: siblings.some(item => !item.finished) ? "running" : siblings.some(item => item.status === "failed") ? "failed"
        : siblings.some(item => item.status === "pending_review") ? "pending_review" : siblings.some(item => item.status === "cancelled") ? "cancelled" : "completed",
      finished: siblings.every(item => item.finished) });
  }
  // First observed work fixes task order; streaming and history replay use the same projection.
  const firstOrder = (step: TranscriptStep): number => {
    if (step.children?.length) return Math.min(...step.children.map(firstOrder));
    return tasks.get(step.id ?? "")?.order ?? step.eventOrder ?? Math.min(...step.calls.map(call => ordered.get(call) ?? call.eventOrder ?? Infinity), steps.indexOf(step) < 0 ? Infinity : steps.indexOf(step));
  };
  return [...result, ...remaining].sort((a, b) => firstOrder(a) - firstOrder(b));
}
