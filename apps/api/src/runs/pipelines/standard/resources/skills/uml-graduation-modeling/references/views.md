<!-- 规范功能职责分解和总体架构，区分辅助视图与完整 UML 图种。 -->
# 功能结构与架构视图

## 功能结构

- function 是功能职责分解视图，不是 UML 图种。nodes 使用 id、name；relationships 使用 decomposition、sourceId、targetId，从整体功能指向子功能。
- 分解粒度一致、层次清楚，不把角色、流程时间顺序或物理部署混入功能树，不产生循环或孤立子树。

## 总体架构

- architecture 使用 packages、components、relationships。包可用 parentId 嵌套，组件可用 packageId 表达归属，关系支持 contains、dependency、communication。
- 表达模块职责、系统边界及协作；优先使用已确认技术，未知框架和中间件仅可作为明确假设。
- 复用原生包与组件记法，但当前没有独立端口与接口连接元模型，不冒充完整构件关系图或部署图，也不增加新图种。
- 只生成本轮授权的架构内容，不添加工程版来源规则编号或依赖审核任务。

## 依据

UML 组件语义与记法参考 [OMG UML 2.5.1](https://www.omg.org/spec/UML/2.5.1) 和 [PlantUML 构件文档](https://plantuml.com/component-diagram)。
