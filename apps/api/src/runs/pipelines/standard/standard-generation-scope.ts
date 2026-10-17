// Separates describing a project from authorizing its model outputs, with a durable first-turn choice.
import { standardDiagramKinds, standardDiagramLabels, type StandardDiagramKind, type StandardProjectState } from "@uml-platform/contracts";

const recommended: StandardDiagramKind[] = ["function", "usecase", "activity"];
const aliases: Record<StandardDiagramKind, RegExp> = {
  function: /功能结构图|功能图|function diagram/i,
  usecase: /用例图|use\s*case diagram/i,
  activity: /业务流程图|流程图|活动图|activity diagram|flowchart/i,
  architecture: /总体架构图|总体结构图|架构图|architecture diagram/i,
  er: /概念\s*E[-－— ]?R\s*图|E[-－— ]?R\s*图|实体关系图|er diagram/i,
  class: /设计类图|类图|class diagram/i,
  sequence: /时序图|顺序图|sequence diagram/i,
  table: /数据库表关系图|表关系图|数据库关系图|table diagram/i,
};

export function resolveStandardGenerationSelection(text: string, awaitingSelection: boolean): StandardDiagramKind[] | undefined {
  const value = text.trim();
  // Model names in explanations, pasted specifications or questions are not consent to generate.
  if (/什么|区别|用途|作用|解释|介绍|为什么|哪些|what|explain|difference/i.test(value)) return;
  const requested = /生成|绘制|画|制作|只要|选择|先做|我要|修改|调整|更新|重试|补充|需要.*图|generate|draw|create|update|change/i.test(value);
  if (!awaitingSelection && !requested) return;
  if (/^(?:按|采用|就用|选择)?(?:你的)?推荐(?:方案|组合)?(?:生成|即可|吧)?[。！!]?$/u.test(value) || /^(?:use|generate) (?:the )?recommended(?: set)?[.!]?$/i.test(value)) return [...recommended];
  if (/^(?:生成|绘制|选择|我要|需要|就做)?(?:全部|所有)(?:八类|8类|模型|图表|图|都生成)*[。！!]?$/u.test(value) || /^(?:generate |draw )?all(?: models| diagrams)?[.!]?$/i.test(value)) return [...standardDiagramKinds];
  const selected = standardDiagramKinds.filter(kind => value.split(/[，,；;。\n]/u).some(part => {
    const match = aliases[kind].exec(part);
    if (!match) return false;
    const before = part.slice(0, match.index).split(/只要|只生成|但要|但是要|改为/u).at(-1)!;
    const after = part.slice(match.index + match[0].length);
    // Excluded existing diagrams are context, not permission to include them in an edit.
    return !/不要|不用|无需|暂不|不生成|不画|不修改|不调整|不更新|不改|排除|except|do not|don't/i.test(before)
      && !/^\s*(?:(?:不要|不用|无需|暂不)(?:生成|绘制|画|修改|调整|更新|改)|不生成|不画|不修改|不调整|不更新|不改)/u.test(after);
  }));
  if (selected.length && (awaitingSelection || requested)) return selected;
  if (awaitingSelection && /^(?:选择|生成)?\s*[1-8](?:\s*[、,，和及\s]\s*[1-8])*\s*[。！!]?$/u.test(value)) {
    return [...new Set(value.match(/[1-8]/g)!.map(number => standardDiagramKinds[Number(number) - 1]!))];
  }
}

export function standardGenerationIntroduction(language?: "zh-CN" | "en") {
  if (language === "en") return `I've saved your requirements. Before generating anything, choose the models you need:\n\n1. **Function diagram** — system modules and functions.\n2. **Use case diagram** — who uses which functions.\n3. **Activity diagram** — steps and exception branches for each business process.\n4. **Architecture diagram** — system components and their relationships.\n5. **E-R diagram** — business entities and cardinalities.\n6. **Class diagram** — software classes, fields and methods.\n7. **Sequence diagram** — interactions for each business process.\n8. **Database table diagram** — tables, keys and relationships.\n\nI recommend starting with **function, use case and activity diagrams** for requirements analysis, then adding design models as needed. Activity and sequence diagrams each produce one diagram per business process.\n\n**Which models would you like?** Reply with names, numbers, “use the recommended set”, or “generate all”. I'll clarify any essential business questions before generating your chosen models.`;
  return `已收到并保存你的需求。开始生成前，先选择你需要的模型：\n\n1. **功能结构图**：展示系统模块及功能划分。\n2. **用例图**：展示哪些角色使用哪些功能。\n3. **业务流程图**：展示各项业务的操作步骤和异常分支。\n4. **总体架构图**：展示系统组成及模块之间的关系。\n5. **概念 E-R 图**：展示业务实体、联系和数量关系。\n6. **设计类图**：展示软件类、属性、方法及关系。\n7. **时序图**：展示各项业务中对象交互的先后顺序。\n8. **数据库表关系图**：展示表、主外键及表间关系。\n\n如果是先整理需求，推荐从 **功能结构图、用例图、业务流程图** 开始；进入详细设计时再补其他模型。业务流程图和时序图会按每项业务分别生成。\n\n**你希望生成哪些模型？** 可以回复名称、序号、“按推荐方案”或“生成全部”。确认范围后，如有关键业务问题，我会先询问，再生成所选模型。`;
}

export function selectedStandardTasks(state: StandardProjectState) {
  return state.generationScope?.status === "confirmed" ? state.generationScope.kinds : undefined;
}

export function standardGenerationScopeDescription(state: StandardProjectState) {
  return state.generationScope?.status === "confirmed"
    ? `用户已确认的生成范围：${state.generationScope.kinds.map(kind => standardDiagramLabels[kind]).join("、")}。generate_diagrams 省略 ids 只会生成这些类型；不得自行扩大范围。`
    : state.generationScope?.status === "awaiting_selection" ? "尚未确认生成范围。可以解释模型用途、补充关键业务问题，但不得生成图表；请用户通过名称、序号、按推荐方案或生成全部选择。" : "已有项目按用户本轮明确请求修改，保留其他产物。";
}
