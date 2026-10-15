import type { DiagramType } from "../entities/diagram/model";
import type { RequirementRule } from "../entities/requirement-rule/model";

export function buildMockRulesFromText(text: string): RequirementRule[] {
  if (!text.trim()) return [];

  return [
    {
      id: "r1",
      category: "业务规则",
      text: "用户必须登录后才能访问主要功能。",
      relatedDiagrams: ["usecase", "activity"],
    },
    {
      id: "r2",
      category: "业务规则",
      text: "订单提交前需校验库存与价格。",
      relatedDiagrams: ["activity"],
    },
    {
      id: "r3",
      category: "业务规则",
      text: "同一用户同一商品 5 秒内不得重复下单。",
      relatedDiagrams: ["activity"],
    },
    {
      id: "r4",
      category: "功能需求",
      text: "支持创建、查看、修改、删除业务对象。",
      relatedDiagrams: ["usecase", "class"],
    },
    {
      id: "r5",
      category: "功能需求",
      text: "管理员可管理用户、商品与订单。",
      relatedDiagrams: ["usecase"],
    },
    {
      id: "r6",
      category: "外部接口",
      text: "对接支付网关完成在线支付。",
      relatedDiagrams: ["activity"],
    },
    {
      id: "r7",
      category: "外部接口",
      text: "对接短信服务发送验证码与通知。",
      relatedDiagrams: ["activity"],
    },
    {
      id: "r8",
      category: "界面需求",
      text: "页面在加载、成功、失败之间需有明确状态切换。",
      relatedDiagrams: ["activity"],
    },
    {
      id: "r9",
      category: "界面需求",
      text: "表单错误需即时反馈并保留输入。",
      relatedDiagrams: ["activity"],
    },
    {
      id: "r10",
      category: "数据需求",
      text: "核心实体需具备主键、时间戳与软删除字段。",
      relatedDiagrams: ["class"],
    },
    {
      id: "r11",
      category: "数据需求",
      text: "用户、订单、商品三者间存在多对多与一对多关系。",
      relatedDiagrams: ["class"],
    },
    {
      id: "r12",
      category: "非功能需求",
      text: "关键接口响应时间 < 500ms，可用性 99.9%。",
      relatedDiagrams: ["deployment"],
    },
    {
      id: "r13",
      category: "部署需求",
      text: "应用以容器形式部署在 K8s 集群中。",
      relatedDiagrams: ["deployment"],
    },
    {
      id: "r14",
      category: "异常处理",
      text: "对外部依赖失败提供重试与降级。",
      relatedDiagrams: ["activity"],
    },
    {
      id: "r15",
      category: "异常处理",
      text: "支付超时需触发对账与回滚流程。",
      relatedDiagrams: ["activity"],
    },
  ];
}

const MOCK_PLANT_UML_TEMPLATES: Record<DiagramType, string> = {
  context: `@startuml
actor "用户" as user
rectangle "目标系统" as system
user <--> system : 高层交互
@enduml`,
  function: `@startmindmap
* 预约平台
** 账户与登录
*** 微信登录
*** 用户档案
** 座位预约
*** 查询空闲座位
*** 提交预约
*** 取消预约
** 签到与通知
*** 到场签到
*** 预约提醒
@endmindmap`,
  activity: `@startuml
start
:用户提交请求;
if (已登录?) then (是)
  :校验输入;
  if (校验通过?) then (是)
    :执行业务;
    :返回成功;
  else (否)
    :返回错误;
  endif
else (否)
  :跳转登录页;
endif
stop
@enduml`,
  usecase: `@startuml
left to right direction
actor 用户
actor 管理员
rectangle 系统 {
  用户 --> (登录)
  用户 --> (提交订单)
  用户 --> (查看订单)
  管理员 --> (管理用户)
  管理员 --> (管理商品)
  管理员 --> (管理订单)
}
@enduml`,
  class: `@startuml
class 用户 { +id +姓名 +邮箱 }
class 订单 { +id +金额 +状态 }
class 商品 { +id +名称 +单价 }
用户 "1" -- "*" 订单
订单 "*" -- "*" 商品
@enduml`,
  deployment: `@startuml
node "用户终端" { [浏览器] }
node "K8s 集群" {
  node "前端 Pod" { [Nginx] }
  node "后端 Pod" { [App] }
  database "PostgreSQL" as DB
}
[浏览器] --> [Nginx] : HTTPS
[Nginx] --> [App] : HTTP
[App] --> DB
@enduml`,
  prototype: `@startuml
left to right direction
interface "首页入口" as home_entry
package "用户模块" as user_module
component "登录页" as login_screen
component "订单页" as order_screen
home_entry --> login_screen : 打开
login_screen --> order_screen : 登录成功
user_module *--> login_screen
user_module *--> order_screen
@enduml`,
  analysis: `@startuml
autonumber
actor "用户" as user
boundary "界面" as ui
control "系统" as system
user -> ui: 提交请求()
ui -> system: 校验并处理()
system --> ui: 返回结果
ui --> user: 展示反馈
@enduml`,
};

export function getMockPlantUmlTemplate(type: DiagramType) {
  return MOCK_PLANT_UML_TEMPLATES[type];
}
