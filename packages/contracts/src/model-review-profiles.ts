// Defines the supported rules and review focus for each modeling stage and diagram family.
import { getStageModelSchema, type ModelingStage } from "./model-semantics.js";

const common = ["阶段契约、字段和枚举合法；标识唯一；所有引用和关系端点存在；关系类型符合端点类型矩阵。"];
const profiles = {
  context: { label: "系统上下文", source: "platform", structure: ["系统、人员和外部系统职责分开；通信至少一端为目标系统，不把外部对象间关系画成系统接口。"], image: ["核对系统边界、外部人员／系统、通信端点与单向／双向箭头。"], content: ["核对外部角色、系统边界和通信需求是否有来源；不把内部功能推断为外部系统。"] },
  function: { label: "功能分解", source: "platform", structure: ["decomposition 构成单根、单父、无环且完整连通的分解树；不得使用 UML 依赖替代功能分解。"], image: ["核对根功能、父子层级和所有分解节点，不按用例关联或活动流规则检查 MindMap。"], content: ["核对功能覆盖与粒度；性能、界面和部署约束不应直接变成功能节点。"] },
  usecase: { label: "用例", source: "uml-and-platform", structure: ["association 连接参与者与用例；include 从包含者指向被包含者；extend 从扩展用例指向基础用例并引用其扩展点；泛化只能连接同类元素且无环。", "所属系统边界必须存在；模型明确声明的参与者应有有效参与关系。包含、扩展与泛化可提供合法的辅助／继承上下文，不要求每个辅助用例重复直连参与者。"], image: ["核对角色关联实线、include／extend 虚线方向与标签、泛化空心三角形和系统边界；特别检查声明的参与关系是否漏画。"], content: ["核对参与者、用户目标、用例粒度与事件流是否来自需求；系统执行某动作不意味着系统应当成为外部参与者。"] },
  class: { label: "类", source: "uml", structure: ["继承与实现端点符合契约，继承无环；聚合／组合的整体端为 source。类级自关联和递归组合类型不能直接当作实例所有权环判错。", "多重性是合法非负区间，下界不能大于上界；角色、可导航性与关系方向分别检查。"], image: ["核对类／接口／枚举、属性、方法、可见性、多重性和角色标签；菱形在整体端，继承／实现三角形指向一般类型／接口。"], content: ["核对领域概念或设计职责、属性和关系的需求依据；多重性具体数值是否合理属于业务内容。"] },
  activity: { label: "活动", source: "uml-and-platform", structure: ["控制流与对象流端点类型分开；泳道归属和输入／输出引脚引用有效，对象类型沿路由节点一致。", "起点无入边，终止无出边；决策／分叉和合并／汇合满足平台支持的度数规则；非对象节点可从起点到达，保留合法循环、并发与多起点。", "activity-final 终止整个活动，flow_final 只终止所在分支；不能为通过校验删除业务分支。"], image: ["核对起点、两类终止符号、决策／合并菱形、分叉／汇合横条、泳道、引脚和对象流；条件与守卫完整显示。"], content: ["核对动作、分支条件、循环结束条件、并发与异常路径是否符合业务，不把 UI 导航当成活动流。"] },
  analysis: { label: "需求分析顺序", source: "uml-and-platform", structure: ["参与对象只使用需求阶段 actor／boundary／control／entity 契约；消息、片段和激活引用合法。", "alt／par 有至少两个显式操作数；opt／loop 只有一个操作数；片段消息连续、分支覆盖且不重叠，嵌套归属完整。", "生命线创建前和销毁后不能接收不合法消息；激活区间、分支生命周期和消息顺序一致。"], image: ["核对业务参与对象、同步／异步／返回／创建／销毁消息符号、片段边框与操作数、生命线和激活，不要求技术服务或数据库对象。"], content: ["以对应单个用例事件流核对业务消息、备选和异常流程；不自行补充实现分层。"] },
  sequence: { label: "用例实现顺序", source: "uml", structure: ["消息端点、消息顺序、创建／销毁生命周期和激活合法；组合片段连续、正确嵌套，分支覆盖且不重叠。", "alt／par 至少两个操作数；opt／loop 单操作数；不能把 alt 改成 opt 来消除结构错误。"], image: ["核对设计对象生命线、消息箭头、返回消息、创建／销毁、激活和嵌套组合片段；保留参数、返回值、条件和消息次序。"], content: ["依据用例及需求分析模型核对界面、控制器、服务、实体和仓储协作；设计职责与技术选择疑问单独列出。"] },
  prototype: { label: "原型界面关系", source: "platform", structure: ["节点为 module／screen／entry-point；contains 只能由 module 指向 module／screen／entry-point；depends-on 只能连接 module → module；navigation／opens／submits／returns 只能由 screen／entry-point 指向 screen，禁止入口或页面导航到模块。包含无环且一个节点最多一个所属模块。"], image: ["核对模块／页面／入口、包含归属和 navigation／opens／submits／returns，不套用部署节点或 UML 活动控制节点规则。"], content: ["核对页面、入口与用例需求的映射和操作路径，不推断 UI 风格偏好为错误。"] },
  navigation: { label: "设计页面导航", source: "platform", structure: ["模块包含无环、页面归属唯一；页面导航、打开、提交和返回的端点符合契约；设计路由字段保留。"], image: ["核对页面路由、入口、模块归属和导航方向，returns 按 source 到 target 呈现，不交换其端点。"], content: ["以原型界面关系核对页面操作、导航、返回路径和可访问入口的业务依据，不要求提供用例实现设计。"] },
  architecture: { label: "总体架构", source: "uml-and-platform", structure: ["包 parentId 和组件 packageId 引用有效且层级无环；contains 必须与明确归属一致；依赖／通信端点合法。"], image: ["核对包嵌套、组件归属、包含及依赖／通信箭头，不能因无效包归属使组件消失。"], content: ["核对功能分解到子系统／组件的职责映射与架构选择；技术方案不确定性列为内容疑问。"] },
  component: { label: "组件关系", source: "uml", structure: ["provided-interface／required-interface 从组件指向接口；组件依赖、通信与组合端点合法；组合无环且部件归属唯一。"], image: ["核对组件、接口名称与操作、提供接口／需求接口符号及其所属组件，组合菱形位于整体端。"], content: ["核对组件职责、设计类归并、接口操作和依赖是否有设计依据；业务功能是否遗漏属于内容检查。"] },
  deployment: { label: "部署", source: "uml", structure: ["部署节点与执行环境层级引用有效且无环；制品 deployment 指向节点，manifestation 指向组件；通信连接合法节点。"], image: ["核对设备、执行环境及数据库的嵌套、外部系统、制品部署、manifestation 与通信路径；协议和端口完整显示。"], content: ["核对运行环境、外部系统、部署约束与来源；不把未确认技术方案当需求事实。"] },
  table: { label: "物理数据库表", source: "platform", structure: ["每表一个主键约束，可为联合键；主键字段非空；主键／唯一／外键字段存在且不重复。", "复合外键两端字段数量和顺序对应、类型一致，目标为主键或唯一键；PK／FK 标志、references 和表关系仅由有效约束派生。"], image: ["核对表、字段、类型、主外键标志、复合外键和派生基数，区分关联表与直接多对多连接。"], content: ["核对业务键选择、字段、唯一性和检查条件是否来自设计；不自动修改业务约束。"] },
} as const;

export function getModelReviewProfile(stage: ModelingStage, kind: string) {
  if (!getStageModelSchema(stage, kind) || !(kind in profiles)) throw new Error(`不支持的模型检查组合：${stage}/${kind}`);
  const base = profiles[kind as keyof typeof profiles];
  const stageRules = kind === "class" ? stage === "requirements"
    ? ["需求领域概念类不包含对象方法、技术接口、服务、控制器或仓储职责。"]
    : ["设计类可包含接口、方法与技术协作；实现关系从类指向接口，不按需求概念模型禁用方法。"]
    : kind === "deployment" && stage === "requirements" ? ["部署需求只表达已知环境，components／artifacts 为空；不提前引入实现组件或制品。"]
    : [];
  const feasibilityActivity = kind === "activity" && stage === "feasibility";
  const structure = feasibilityActivity ? [
    "可行性业务流程只使用 start／end／activity／decision／merge／fork／join 和 control_flow；不包含对象流、对象节点、动作引脚或 flow_final。",
    "平台高层流程约定：恰好一个起点、至少一个终止和目标系统动作，所有节点从起点可达且能到达终止；泳道归属有效，决策有不同守卫，分叉和汇合符合控制流度数规则。",
  ] : base.structure;
  const image = feasibilityActivity ? ["核对业务方和目标系统泳道、活动、条件分支、合并、分叉／汇合及唯一开始和显式结束；只检查控制流，不套用对象流或分支终止符号。"] : base.image;
  return { id: `${stage}.${kind}`, stage, kind, ...base, image, structure: [...common, ...structure, ...stageRules] };
}
