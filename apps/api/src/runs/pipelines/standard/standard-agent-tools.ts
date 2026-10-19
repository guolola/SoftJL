// Exposes project-scoped modeling tools to Pi; every mutation keeps unrelated ordinary artifacts intact.
import { Type } from "typebox";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { standardOutlineSchema, standardQuestionSchema, standardModelSchema, standardDiagramTasks, type StandardProjectState } from "@uml-platform/contracts";
import { projectFacts, renderStandardDiagram, runStandardProject, type StandardPipelineDependencies } from "./standard-project-pipeline.js";
import { selectedStandardTasks } from "./standard-generation-scope.js";

export function createStandardAgentTools(deps: StandardPipelineDependencies, current: () => StandardProjectState, useRecommendations: boolean) {
  let awaitingAnswer = false;
  const result = (value: unknown, terminate = false) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }], details: {}, terminate });
  const tools: ToolDefinition[] = [
    defineTool({ name: "read_project", label: "读取项目上下文", description: "读取当前需求、长期记忆、共享方案和图表目录；需要具体图内容时再调用 read_diagram。", parameters: Type.Object({}),
      async execute() { const state = current(); return result({ description: state.description, ...projectFacts(state), outline: state.outline,
        diagrams: Object.values(state.diagrams).map(({ id, kind, title, businessId, status, error }) => ({ id, kind, title, businessId, status, error })),
        generationScope: state.generationScope,
        availableTasks: state.outline ? standardDiagramTasks(state.outline).filter(task => !selectedStandardTasks(state) || selectedStandardTasks(state)!.includes(task.kind)).map(({ id, title }) => ({ id, title })) : [],
        tests: Boolean(state.tests), documents: Object.keys(state.documents ?? {}) }); } }),
    defineTool({ name: "read_diagram", label: "读取图表", description: "按 ID 读取相关图的结构数据，不返回 SVG。", parameters: Type.Object({ ids: Type.Array(Type.String(), { minItems: 1, maxItems: 8 }) }),
      async execute(_, { ids }) { return result(ids.map(id => { const diagram = current().diagrams[id]; if (!diagram) throw new Error(`图不存在：${id}`); return { id, kind: diagram.kind, title: diagram.title, model: diagram.model, status: diagram.status }; })); } }),
    defineTool({ name: "ask_questions", label: "询问用户", description: "调用此工具展示交互式询问组件，提供问题、选项、是否多选与推荐。模型产物选择使用 purpose=generation_scope，业务澄清使用 business；最多3题，每题最多8项，调用后结束当前轮等待结构化答案。不能仅在正文提问。", parameters: Type.Unsafe<{ questions: z.infer<typeof standardQuestionSchema>[]; purpose?: "generation_scope" | "business" }>(zodToJsonSchema(z.object({ purpose: z.enum(["generation_scope", "business"]).optional(), questions: z.array(standardQuestionSchema).min(1).max(3) }), { $refStrategy: "none" })),
      async execute(_, input) {
        if (useRecommendations) throw new Error("用户已选择推荐方案，不再追问，请采用推荐并记录假设");
        const questions = z.array(standardQuestionSchema).min(1).max(3).parse(input.questions);
        await deps.save(state => { state.rounds.push({ questions, answers: [], purpose: input.purpose ?? "business" }); }); awaitingAnswer = true;
        return result({ status: "waiting_for_user", questions }, true);
      } }),
    defineTool({ name: "save_outline", label: "保存共享方案", description: "首次生成前保存从描述识别出的全部业务、角色、实体和约束。后续仅在需求改变时更新；保存不会触发其他产物重生成。", parameters: Type.Object({ description: Type.String({ minLength: 1, maxLength: 60000 }), outline: Type.Unsafe<z.infer<typeof standardOutlineSchema>>(zodToJsonSchema(standardOutlineSchema, { $refStrategy: "none" })) }),
      async execute(_, input) {
        const outline = standardOutlineSchema.parse(input.outline);
        for (const group of [outline.roles, outline.businesses, outline.entities]) if (new Set(group.map(item => item.id)).size !== group.length) throw new Error("方案标识重复");
        if (outline.businesses.some(business => business.roleIds.some(id => !outline.roles.some(role => role.id === id)))) throw new Error("业务引用了不存在的角色");
        await deps.save(state => { state.description = input.description; state.outline = outline; });
        const kinds = selectedStandardTasks(current());
        return result({ saved: true, availableTasks: standardDiagramTasks(outline).filter(task => !kinds || kinds.includes(task.kind)).map(({ id, title }) => ({ id, title })) });
      } }),
    defineTool({ name: "generate_diagrams", label: "生成或修改图表", description: "用户确认生成范围后才能调用。首次省略ids仅生成已确认的模型类型及其全部业务图。后续传具体ids和修改说明，仅更新所选图。内部并发最多3路，仅校验结构。", parameters: Type.Object({ ids: Type.Optional(Type.Array(Type.String(), { minItems: 1 })), instruction: Type.Optional(Type.String({ maxLength: 8000 })) }),
      async execute(_, input, signal) {
        signal?.throwIfAborted(); const state = current();
        if (!state.outline) throw new Error("请先保存共享方案");
        if (state.generationScope?.status === "awaiting_selection") throw new Error("请先让用户选择需要生成的模型，不能自动生成全部模型");
        if (Object.keys(state.diagrams).length && !input.ids?.length) throw new Error("项目已有模型，修改时必须指定具体图表 ID，不能重新生成全部图");
        const available = new Set(standardDiagramTasks(state.outline).map(task => task.id));
        if (input.ids?.some(id => !available.has(id))) throw new Error("目标图不在共享方案任务中，请读取目录后选择正确ID");
        await runStandardProject({ operation: "generate", targetIds: input.ids, instruction: input.instruction }, state, deps);
        return result(Object.values(current().diagrams).filter(diagram => !input.ids || input.ids.includes(diagram.id)).map(({ id, title, status, error }) => ({ id, title, status, error })));
      } }),
    defineTool({ name: "save_diagram", label: "修改单张图", description: "先读取图后修改其结构数据并保存。只校验和渲染这一张图，不联动其他图。", parameters: Type.Object({ id: Type.String(), model: Type.Unsafe<z.infer<typeof standardModelSchema>>(zodToJsonSchema(standardModelSchema, { $refStrategy: "none" })) }),
      async execute(_, input, signal) {
        signal?.throwIfAborted(); const original = current().diagrams[input.id]; if (!original) throw new Error("图不存在");
        const kinds = selectedStandardTasks(current());
        if (kinds && !kinds.includes(original.kind)) throw new Error("目标图超出用户本轮确认的修改范围");
        const diagram = await renderStandardDiagram({ ...original, model: standardModelSchema.parse(input.model) }, deps.render);
        await deps.save(state => {
          state.diagrams[input.id] = diagram;
          if (state.run) state.run.work = { ids: [...new Set([...(state.run.work?.ids ?? []), input.id])] };
        }); return result({ id: diagram.id, status: diagram.status });
      } }),
    defineTool({ name: "generate_tests", label: "生成测试用例", description: "仅用户明确要求测试用例时调用，结果仅为测试步骤与预期，未经实际执行。", parameters: Type.Object({}),
      async execute() { await runStandardProject({ operation: "tests" }, current(), deps); return result({ saved: true, count: current().tests?.length }); } }),
    defineTool({ name: "generate_document", label: "生成说明书", description: "仅用户明确要求说明书时调用。", parameters: Type.Object({ kind: Type.Union([Type.Literal("requirementsSpec"), Type.Literal("softwareDesignSpec")]) }),
      async execute(_, { kind }) { await runStandardProject({ operation: kind }, current(), deps); return result({ saved: true, kind }); } }),
    defineTool({ name: "remember_decisions", label: "保存项目约定", description: "保存本项目长期需要遵守的用户确认事实和约束；不得记忆密钥、凭证或臆测。替换全部记忆列表时保留仍有效的旧约定。", parameters: Type.Object({ facts: Type.Array(Type.String({ minLength: 1, maxLength: 2000 }), { maxItems: 40 }) }),
      async execute(_, { facts }) {
        if (facts.join("\n").length > 12000) throw new Error("项目约定过长，请概括为不超过12000字的稳定事实");
        await deps.save(state => { state.memory = facts; }); return result({ saved: true, ...projectFacts(current()) });
      } }),
  ];
  return { tools, waiting: () => awaitingAnswer };
}
