// Defines the supported rules and review focus for each modeling stage and diagram family.
import { getStageModelSchema, type ModelingStage } from "./model-semantics.js";

const common = [
  "阶段契约、字段和枚举合法；标识唯一；所有引用和关系端点存在；关系类型符合端点类型矩阵。",
  "图元素、关系及边界／泳道／片段／激活共用模型内的 ID 命名空间，不能重复；扩展点、分支和表字段等嵌套元素在各自所属对象内唯一。引用必须匹配真实 ID，不能用名称或数组序号代替。",
  "自连接只用于 class／activity／analysis／sequence／table／prototype／navigation；contains／inheritance／implementation／create／destroy 不允许自连接。不要为满足结构规则虚构业务内容，必须在返回最终模型前依据绑定资料自行检查和修正。",
];
const profiles = {
  context: { label: "系统上下文", source: "platform", structure: ["系统、人员和外部系统职责分开；通信至少一端为目标系统，不把外部对象间关系画成系统接口。"], image: ["核对系统边界、外部人员／系统、通信端点与单向／双向箭头。"], content: ["核对外部角色、系统边界和通信需求是否有来源；不把内部功能推断为外部系统。"] },
  function: { label: "功能分解", source: "platform", structure: ["decomposition 构成单根、单父、无环且完整连通的分解树；不得使用 UML 依赖替代功能分解。"], image: ["核对根功能、父子层级和所有分解节点，不按用例关联或活动流规则检查 MindMap。"], content: ["核对功能覆盖与粒度；性能、界面和部署约束不应直接变成功能节点。"] },
  usecase: { label: "用例", source: "uml-and-platform", structure: ["association 连接参与者与用例；include 从包含者指向被包含者；extend 从扩展用例指向基础用例并引用其扩展点；泛化只能连接同类元素且无环。", "所属系统边界必须存在；模型明确声明的参与者应有有效参与关系。包含、扩展与泛化可提供合法的辅助／继承上下文，不要求每个辅助用例重复直连参与者。"], image: ["核对角色关联实线、include／extend 虚线方向与标签、泛化空心三角形和系统边界；特别检查声明的参与关系是否漏画。"], content: ["核对参与者、用户目标、用例粒度与事件流是否来自需求；系统执行某动作不意味着系统应当成为外部参与者。"] },
  class: { label: "类", source: "uml", structure: ["继承与实现端点符合契约，继承无环；聚合／组合的整体端为 source。类级自关联和递归组合类型不能直接当作实例所有权环判错。", "多重性是合法非负区间，下界不能大于上界；角色、可导航性与关系方向分别检查。"], image: ["核对类／接口／枚举、属性、方法、可见性、多重性和角色标签；菱形在整体端，继承／实现三角形指向一般类型／接口。"], content: ["核对领域概念或设计职责、属性和关系的需求依据；多重性具体数值是否合理属于业务内容。"] },
  activity: { label: "业务流程", source: "uml-and-platform", structure: ["业务流程统一使用竖向泳道，只使用 start／end／activity／decision／merge／fork／join 和 control_flow；不包含对象流、对象节点、动作引脚或 flow_final。", "泳道按责任主体排列，动作归属真实泳道；从上到下推进流程，跨泳道交接保留真实来源和目标。", "分支使用 decision／merge，并行使用 fork／join，循环通过明确判断和回路表达；不能为绘图删减业务节点或连线。"], image: ["核对竖向泳道标题、纵向分隔线、开始／结束、活动、判断／合并菱形、并行分叉／汇合；跨泳道箭头及条件守卫完整显示。"], content: ["核对动作、分支条件、循环结束条件、并发与异常路径是否符合业务，不把 UI 导航当成活动流。"] },
  analysis: { label: "需求分析顺序", source: "uml-and-platform", structure: ["参与对象只使用需求阶段 actor／boundary／control／entity 契约；消息、片段和激活引用合法。", "alt／par 有至少两个显式操作数；opt／loop 只有一个操作数；片段消息连续、分支覆盖且不重叠，嵌套归属完整。", "生命线创建前和销毁后不能接收不合法消息；激活区间、分支生命周期和消息顺序一致。"], image: ["核对业务参与对象、同步／异步／返回／创建／销毁消息符号、片段边框与操作数、生命线和激活，不要求技术服务或数据库对象。"], content: ["依据目标用例的目标、参与者、前后置条件、事件流及相关用例约束核对业务消息、备选和异常流程；不自行补充实现分层。"] },
  sequence: { label: "用例实现顺序", source: "uml", structure: ["消息端点、消息顺序、创建／销毁生命周期和激活合法；组合片段连续、正确嵌套，分支覆盖且不重叠。", "alt／par 至少两个操作数；opt／loop 单操作数；不能把 alt 改成 opt 来消除结构错误。"], image: ["核对设计对象生命线、消息箭头、返回消息、创建／销毁、激活和嵌套组合片段；保留参数、返回值、条件和消息次序。"], content: ["依据本次用例模型及实际提供的需求分析模型核对对象职责、方法调用、参数、返回值和条件路径；仅引入业务需要的协作对象，不为凑分层增加服务、仓储或技术设施。"] },
  prototype: { label: "原型界面关系", source: "platform", structure: ["节点为 module／screen／entry-point；contains 只能由 module 指向 module／screen／entry-point；depends-on 只能连接 module → module；navigation／opens／submits／returns 只能由 screen／entry-point 指向 screen，禁止入口或页面导航到模块。包含无环且一个节点最多一个所属模块。"], image: ["核对模块／页面／入口、包含归属和 navigation／opens／submits／returns，不套用部署节点或 UML 活动控制节点规则。"], content: ["核对页面、入口与用例需求的映射和操作路径，不推断 UI 风格偏好为错误。"] },
  navigation: { label: "设计页面导航", source: "platform", structure: ["模块包含无环、页面归属唯一；页面导航、打开、提交和返回的端点符合契约；设计路由字段保留。"], image: ["核对页面路由、入口、模块归属和导航方向，returns 按 source 到 target 呈现，不交换其端点。"], content: ["以原型界面关系核对页面操作、导航、返回路径和可访问入口的业务依据，不要求提供用例实现设计。"] },
  architecture: { label: "总体架构", source: "uml-and-platform", structure: ["包 parentId 和组件 packageId 引用有效且层级无环；contains 必须与明确归属一致；依赖／通信端点合法。"], image: ["核对包嵌套、组件归属、包含及依赖／通信箭头，不能因无效包归属使组件消失。"], content: ["核对功能分解到子系统／组件的职责映射与架构选择；技术方案不确定性列为内容疑问。"] },
  component: { label: "组件关系", source: "uml", structure: ["provided-interface／required-interface 从组件指向接口；组件依赖、通信与组合端点合法；组合无环且部件归属唯一。"], image: ["核对组件、接口名称与操作、提供接口／需求接口符号及其所属组件，组合菱形位于整体端。"], content: ["核对组件职责、设计类归并、接口操作和依赖是否有设计依据；业务功能是否遗漏属于内容检查。"] },
  deployment: { label: "部署", source: "uml", structure: ["部署节点与执行环境层级引用有效且无环；制品 deployment 指向节点，manifestation 指向组件；通信连接合法节点。"], image: ["核对设备、执行环境及数据库的嵌套、外部系统、制品部署、manifestation 与通信路径；协议和端口完整显示。"], content: ["核对运行环境、外部系统、部署约束与来源；不把未确认技术方案当需求事实。"] },
  table: { label: "物理数据库表", source: "platform", structure: ["每表一个主键约束，可为联合键；主键字段非空；主键／唯一／外键字段存在且不重复。", "复合外键两端字段数量和顺序对应、类型一致，目标为主键或唯一键；PK／FK 标志、references 和表关系仅由有效约束派生。"], image: ["核对表、字段、类型、主外键标志、复合外键和派生基数，区分关联表与直接多对多连接。"], content: ["核对业务键选择、字段、唯一性和检查条件是否来自设计；不自动修改业务约束。"] },
} as const;

// Detailed generation guidance mirrors the graph rules without turning later saves or redraws into another review.
const structuralDetails: Partial<Record<keyof typeof profiles, readonly string[]>> = {
  function: ["必须且只能有一个根功能；每个非根功能恰有一个父功能；所有功能从根可达，decomposition 只能连接功能节点，禁止循环。"],
  usecase: [
    "存在系统边界时，每个用例必须填写有效 systemBoundaryId；primaryActorId 和 supportingActorIds 只能引用 actors。对明确声明的主／辅助参与者，必须提供对应的有效 association 或合法的包含／扩展／泛化参与上下文，不能只填参与者字段而漏掉参与关系。不得留下无参与上下文的孤立角色或用例。",
    "association 两端必须是参与者与用例；include／extend 两端必须是用例；generalization 两端同为参与者或同为用例。extend 必须填写基础用例已有的 extensionPointIds；其他关系不得填写扩展点引用。",
  ],
  class: [
    "类继承无环；inheritance 两端同为类或同为接口，从特化类型指向一般类型；implementation 从实现类指向接口；dependency 可连接类／接口／枚举；association／aggregation／composition 两端只能是类或接口。属性及关系多重性只能使用非负整数、* 或下界不大于上界的区间，例如 0..1、1、0..*；不能返回 5..2。",
    "类级递归关联和递归组合类型可以自关联，不能将类型递归误当作实例所有权循环。",
  ],
  activity: [
    "至少有一个 start 和一个 end；start 不能有入边，end 不能有出边；每个节点都必须从某个 start 可达，actorOrLane 必须引用真实泳道。",
    "decision 和 fork 必须恰有一条入边、至少两条出边；merge 和 join 必须至少两条入边、恰有一条出边。循环或重试返回判断前若形成多条入边，先用 merge 汇合再进入 decision；不能让回路直接破坏判断节点入边约束。",
  ],
  analysis: [
    "片段 messageIds 必须唯一且在消息数组中连续；分支消息不能重叠，必须完整覆盖所属片段，单分支消息也必须连续。父片段和 parentBranchId 必须真实存在且完整包含子片段；相互重叠的片段必须有合法父子关系，禁止交叉或循环嵌套。",
    "激活 startMessageId 不晚于 endMessageId；激活两端须在同一分支，或都在片段外并完整包围片段；同一对象的激活只能独立或完整嵌套。任何执行路径上，生命线创建前／销毁后不能被普通消息引用，不能重复创建；并行分支不能同时改变同一生命线的创建或销毁状态。",
  ],
  sequence: [
    "片段 messageIds 必须唯一且在消息数组中连续；分支消息不重叠并完整覆盖片段，每个分支内消息连续。parentFragmentId／parentBranchId 引用真实父片段和父分支，子片段完全位于父分支；禁止循环嵌套和无父子关系的交叉重叠。",
    "alt／par 至少两个显式分支，opt／loop 最多一个操作数；激活起止消息顺序正确，两端在同一分支或都在片段外完整包围片段，同一对象激活区间不交叉。",
    "沿每条执行路径检查生命线：创建前和销毁后不能发送或接收普通消息，同一路径不能重复创建；opt／loop 必须考虑未执行路径，par 分支不能同时改变同一生命线的创建／销毁状态。",
  ],
  prototype: ["contains 从 module 指向 module／screen／entry-point，归属无环且每个节点最多属于一个模块；depends-on 只能连接模块；navigation／opens／submits／returns 从 screen 或 entry-point 指向 screen。导航、返回和模块依赖不可混用。"],
  navigation: ["contains 从 module 指向 module／screen／entry-point，归属无环且每个节点最多属于一个模块；depends-on 只能连接模块；navigation／opens／submits／returns 从 screen 或 entry-point 指向 screen。returns 从当前页面指向返回目的页面，不能交换端点。"],
  architecture: ["parentId 只能引用存在的包且包层级无环；packageId 只能引用存在的包。每条 contains 从包指向子包或组件，sourceId 必须与目标的 parentId／packageId 一致。"],
  component: ["provided-interface／required-interface 从组件指向接口；dependency／communication／composition 两端均为组件。composition 无环，每个部件最多有一个组合整体。"],
  deployment: ["节点与数据库 parentId 必须引用真实承载节点且无环；deployment 从制品指向部署节点，manifestation 从制品指向组件；communication 两端为 node／device／execution-environment／external，dependency 可连接这些节点、制品和组件。"],
  table: [
    "每表恰有一个 primary-key 约束，主键字段 nullable=false；列 ID 和约束 ID 在表内分别唯一。每项键约束的 columnIds 必须存在且不重复。",
    "外键 referenceTableId 和 referenceColumnIds 必须存在；本表列和引用列数量相同，按数组位置逐一对应，dataType 忽略大小写后相同；被引用列集合必须是目标表的主键或唯一约束。",
  ],
};

export function getModelReviewProfile(stage: ModelingStage, kind: string) {
  if (!getStageModelSchema(stage, kind) || !(kind in profiles)) throw new Error(`不支持的模型检查组合：${stage}/${kind}`);
  const base = profiles[kind as keyof typeof profiles];
  const stageRules = kind === "class" ? stage === "requirements"
    ? ["需求领域概念类不包含对象方法、技术接口、服务、控制器或仓储职责，不得标记 service／controller／repository／technical-interface 等技术 stereotype；关系类型严格使用本阶段 Schema，禁止套用设计阶段字段或枚举。"]
    : ["设计类可包含接口、方法与技术协作；实现关系从类指向接口，不按需求概念模型禁用方法。"]
    : kind === "deployment" && stage === "requirements" ? ["部署需求只表达已知环境，components／artifacts 为空；不提前引入实现组件或制品。"]
    : [];
  const feasibilityActivity = kind === "activity" && stage === "feasibility";
  const details = [...base.structure, ...(structuralDetails[kind as keyof typeof profiles] ?? [])];
  const structure = feasibilityActivity ? [...details,
    "平台高层流程约定：恰好一个起点、至少一个终止和目标系统动作，所有节点从起点可达且能到达终止；泳道归属有效，决策有不同守卫，分叉和汇合符合控制流度数规则。",
  ] : details;
  const image = base.image;
  return { id: `${stage}.${kind}`, stage, kind, ...base, image, structure: [...common, ...structure, ...stageRules] };
}
