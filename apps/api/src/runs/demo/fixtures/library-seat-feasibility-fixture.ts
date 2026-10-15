// Supplies deterministic feasibility artifacts for the library seat demo without provider requests.
import { completeFeasibilityImplementationPlanSchema, contextDiagramSpecSchema, feasibilityBusinessFlowSchema, feasibilityInputsSchema } from "@uml-platform/contracts";
import { FEASIBILITY_IMPLEMENTATION_EXAMPLE } from "@uml-platform/prompts";
import { generatePlantUmlArtifacts } from "../../../plantuml.js";

export const librarySeatFeasibilityInputs = feasibilityInputsSchema.parse({
  projectName: "图书馆座位预约系统", expectedUsers: "学生、图书馆管理员", targetEnvironment: "支持手机和桌面浏览器的校园 Web 应用",
  teamSize: 4, teamSkills: "React、TypeScript、关系型数据库", deadline: "示例目标：8–12 周", analysisYears: 3,
  references: "固定 Mock 示例。人员、周期、成本和收益用于演示，需要在真实项目中重新确认。",
});

export const librarySeatFeasibilityContext = contextDiagramSpecSchema.parse({
  diagramKind: "context", modelId: "context", title: "图书馆座位预约系统环境图", summary: "学生与管理员通过目标系统完成预约和座位管理。",
  notes: ["需求仅约定站内通知，不假设支付、短信或外部身份平台。"],
  system: { id: "system", name: "图书馆座位预约系统", sourceRequirementIds: [] },
  people: [
    { id: "student", name: "学生", sourceRequirementIds: ["r1", "r5", "r11"] },
    { id: "admin", name: "图书馆管理员", sourceRequirementIds: ["r6", "r7", "r8", "r9"] },
  ],
  externalSystems: [],
  relationships: [
    { id: "student-booking", sourceId: "student", targetId: "system", direction: "directed", label: "登录、查询座位、提交预约", sourceRequirementIds: ["r1", "r2"] },
    { id: "student-notice", sourceId: "system", targetId: "student", direction: "directed", label: "预约结果与站内通知", sourceRequirementIds: ["r5"] },
    { id: "admin-management", sourceId: "admin", targetId: "system", direction: "directed", label: "维护座位、查看记录、取消预约", sourceRequirementIds: ["r6", "r7", "r8", "r9"] },
  ],
});

export const librarySeatFeasibilityFlow = feasibilityBusinessFlowSchema.parse({
  model: {
    diagramKind: "activity", modelId: "feasibility-business-flow", title: "座位预约业务与系统流程图", summary: "学生提交预约，系统校验并创建预约、发送站内通知；校验失败则返回原因。",
    notes: ["本图展示预约核心流程；管理员维护和取消预约是独立流程，由环境图与需求规则补充。"],
    swimlanes: [{ id: "student", name: "学生" }, { id: "system", name: "座位预约系统" }],
    nodes: [
      { id: "start", type: "start" },
      { id: "submit", type: "activity", name: "查询并提交预约", actorOrLane: "student", input: ["日期、时间段"], output: ["预约请求"] },
      { id: "validate", type: "activity", name: "校验登录、座位和重复预约", actorOrLane: "system", input: ["预约请求"], output: ["校验结果"] },
      { id: "valid", type: "decision", name: "校验通过？" },
      { id: "create", type: "activity", name: "保存预约状态与操作时间", actorOrLane: "system", input: ["有效预约请求"], output: ["预约记录"] },
      { id: "notify", type: "activity", name: "发送站内通知", actorOrLane: "system", input: ["预约记录"], output: ["预约成功通知"] },
      { id: "reject", type: "activity", name: "拒绝预约并返回校验原因", actorOrLane: "system", input: ["未通过的校验"], output: ["失败原因"] },
      { id: "end", type: "end" },
    ],
    relationships: [
      { id: "f1", type: "control_flow", sourceId: "start", targetId: "submit" },
      { id: "f2", type: "control_flow", sourceId: "submit", targetId: "validate" },
      { id: "f3", type: "control_flow", sourceId: "validate", targetId: "valid" },
      { id: "f4", type: "control_flow", sourceId: "valid", targetId: "create", guard: "通过" },
      { id: "f5", type: "control_flow", sourceId: "valid", targetId: "reject", guard: "未通过" },
      { id: "f6", type: "control_flow", sourceId: "create", targetId: "notify" },
      { id: "f7", type: "control_flow", sourceId: "notify", targetId: "end" },
      { id: "f8", type: "control_flow", sourceId: "reject", targetId: "end" },
    ],
  },
  traceability: [
    { requirementId: "r1", targetKind: "swimlane", targetId: "student" },
    { requirementId: "r1", targetKind: "node", targetId: "submit" },
    ...["r2", "r3", "r4"].flatMap((requirementId) => ["validate", "valid", "reject"].map((targetId) => ({ requirementId, targetKind: "node", targetId }))),
    { requirementId: "r10", targetKind: "node", targetId: "create" },
    { requirementId: "r5", targetKind: "node", targetId: "notify" },
  ],
});

export const librarySeatFeasibilityPlan = completeFeasibilityImplementationPlanSchema.parse({
  ...FEASIBILITY_IMPLEMENTATION_EXAMPLE,
  overview: "基于学生、管理员的系统边界和预约校验流程，对比模块化单体与前后端独立部署两套实施方案。金额与工期均为固定演示估算。",
  recommendationRationale: "课程团队规模较小，优先模块化单体以降低部署和事务一致性成本；保留前后端独立部署作为后续扩展选择。",
  candidates: FEASIBILITY_IMPLEMENTATION_EXAMPLE.candidates.map((candidate, index) => ({
    ...candidate,
    name: index === 0 ? "模块化单体方案" : "前后端独立部署方案",
    summary: index === 0 ? "统一部署预约、管理和站内通知模块，数据库事务保证预约互斥。" : "移动适配的 React 前端和独立 API 服务，分别发布和扩容。",
    advantages: index === 0 ? ["部署简单", "预约事务边界清晰"] : ["前后端可独立迭代", "便于扩展移动端体验"],
    disadvantages: index === 0 ? ["发布需要协调模块"] : ["需要管理接口版本与跨服务监控"],
    estimatedSchedule: index === 0 ? "示例估算 8–10 周" : "示例估算 10–12 周",
    sourceRequirementIds: ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9", "r10", "r11"],
    implementation: {
      ...candidate.implementation,
      architecture: { summary: index === 0 ? "统一应用内划分四个模块，以关系数据库事务保护预约一致性。" : "浏览器前端与 API 独立部署，后端保留统一预约事务边界。", modules: [
        { id: "access", name: "登录与访问", responsibility: "验证登录状态并提供手机端访问。", sourceRequirementIds: ["r1", "r2", "r11"] },
        { id: "booking", name: "预约处理", responsibility: "按流程校验座位和重复预约，通过后保存状态与操作时间。", sourceRequirementIds: ["r1", "r3", "r4", "r10"] },
        { id: "management", name: "座位与预约管理", responsibility: "维护座位、查询记录并按未到场或设备故障原因取消预约。", sourceRequirementIds: ["r6", "r7", "r8", "r9", "r10"] },
        { id: "notice", name: "站内通知", responsibility: "预约成功或取消后保存并展示站内通知。", sourceRequirementIds: ["r5"] },
      ] },
      dataStrategy: { summary: "保存学生、座位、预约和通知；用事务与唯一约束控制同一学生同一时段的重复预约，保留取消原因和操作时间。", sourceRequirementIds: ["r3", "r4", "r5", "r10"] },
      integrationRationale: "系统环境图没有已确认的外部系统；通知通过系统内部实现。",
      milestones: candidate.implementation.milestones.map((milestone) => ({ ...milestone, name: "预约闭环与管理验收", timeframe: index === 0 ? "第 1–10 周" : "第 1–12 周",
        deliverables: ["预约核心流程", "管理工作台", "移动端页面", "站内通知"],
        acceptanceCriteria: ["未登录、座位不可用和重复预约均进入失败分支", "有效请求保存预约记录并产生站内通知", "管理员取消预约后记录原因与时间", "手机端可查看预约"], sourceRequirementIds: ["r1", "r2", "r3", "r4", "r5", "r8", "r9", "r10", "r11"] })),
      risks: candidate.implementation.risks.map((risk, riskIndex) => ({ ...risk,
        risk: ["并发请求导致重复占座", "通知与预约状态不同步", "移动端预约操作不便"][riskIndex] ?? risk.risk,
        mitigation: ["增加事务、唯一约束和并发预约测试", "事务提交后补偿发送通知并记录发送状态", "在手机尺寸验证查询和预约交互"][riskIndex] ?? risk.mitigation,
        sourceRequirementIds: [["r3", "r4"], ["r5", "r10"], ["r11"]][riskIndex] ?? [],
      })),
    },
  })),
});

export const librarySeatContextPlantUml = generatePlantUmlArtifacts([librarySeatFeasibilityContext])[0]!;
export const librarySeatFlowPlantUml = generatePlantUmlArtifacts([librarySeatFeasibilityFlow.model])[0]!;

const svgHead = '<svg xmlns="http://www.w3.org/2000/svg" role="img" font-family="sans-serif" font-size="16" text-anchor="middle"';
const arrow = '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="#475569"/></marker></defs>';
export const librarySeatContextSvg = `${svgHead} viewBox="0 0 960 420"><title>图书馆座位预约系统环境图</title>${arrow}<rect width="960" height="420" fill="white"/>
<g fill="#eff6ff" stroke="#2563eb"><rect x="20" y="160" width="150" height="80" rx="14"/><rect x="350" y="130" width="270" height="140" rx="14"/><rect x="790" y="160" width="150" height="80" rx="14"/></g>
<g fill="#0f172a"><text x="95" y="205">学生</text><text x="485" y="195">图书馆座位预约系统</text><text x="485" y="225">预约 · 管理 · 站内通知</text><text x="865" y="205">图书馆管理员</text>
<text x="260" y="140">登录、查询、预约</text><text x="260" y="285">结果与站内通知</text><text x="710" y="120">座位维护、记录查询</text><text x="710" y="145">取消预约</text></g>
<g stroke="#475569" stroke-width="2" fill="none" marker-end="url(#arrow)"><path d="M170 180H350"/><path d="M350 230H170"/><path d="M790 180H620"/></g></svg>`;
export const librarySeatFlowSvg = `${svgHead} viewBox="0 0 1040 780"><title>座位预约业务与系统流程图</title>${arrow}<rect width="1040" height="780" fill="white"/>
<rect x="20" y="20" width="1000" height="740" rx="12" fill="#f8fafc" stroke="#94a3b8"/><path d="M320 20V760M20 80H1020" stroke="#94a3b8"/><text x="170" y="57">学生</text><text x="670" y="57">座位预约系统</text>
<g fill="#dbeafe" stroke="#2563eb"><rect x="50" y="180" width="240" height="65" rx="12"/><rect x="390" y="180" width="350" height="65" rx="12"/><path d="M565 295L665 360L565 425L465 360Z"/><rect x="390" y="475" width="350" height="65" rx="12"/><rect x="390" y="600" width="350" height="65" rx="12"/><rect x="765" y="325" width="235" height="70" rx="12"/></g>
<g fill="#0f172a"><circle cx="170" cy="125" r="10"/><text x="170" y="217">查询并提交预约</text><text x="565" y="217">校验登录、座位和重复预约</text><text x="565" y="366">校验通过？</text><text x="565" y="512">保存预约状态与操作时间</text><text x="565" y="637">发送站内通知</text><text x="883" y="354">拒绝预约</text><text x="883" y="380">返回校验原因</text><text x="603" y="454">通过</text><text x="715" y="345">未通过</text><circle cx="565" cy="720" r="10"/><circle cx="565" cy="720" r="15" fill="none" stroke="#0f172a" stroke-width="2"/></g>
<g stroke="#475569" stroke-width="2" fill="none" marker-end="url(#arrow)"><path d="M170 135V180"/><path d="M290 212H390"/><path d="M565 245V295"/><path d="M565 425V475"/><path d="M665 360H765"/><path d="M565 540V600"/><path d="M565 665V705"/><path d="M883 395V720H580"/></g></svg>`;
