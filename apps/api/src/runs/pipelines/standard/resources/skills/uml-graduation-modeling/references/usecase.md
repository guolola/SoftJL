<!-- 约束用例图的参与者、系统边界与关系语义，并说明本平台的字段方向。 -->
# UML 用例模型

## 语义

- 参与者是目标系统边界之外的角色，可为人员或外部系统；被建模系统本身不是自己的参与者。
- 用例表达角色希望获得的业务结果，采用业务动宾名称。页面、按钮、数据库操作不自动成为独立用例。
- actor 与 usecase 的 association 表示参与关系，不表示时间顺序；主流程步骤和异常细节属于用例说明或活动模型。
- include 从包含者指向被包含用例，表示纳入该行为；extend 从扩展用例指向被扩展的基础用例，表示满足条件时增加行为。不要把“下一步”画成 include，或将异常流程全部机械画为 extend。
- generalization 从特殊角色或用例指向一般角色或用例，应存在可替代的特化含义。登录、注册等仅在该系统范围和目标确有需要时出现，不为每个用例强加登录关系。

## 平台映射

- 使用 actors、systemBoundaries、useCases、relationships；actor ID 沿用 outline.roles。用例的 systemBoundaryId 引用系统边界，不把目标系统放进 actors。
- association 连接角色与用例；include/extend 两端均为用例；generalization 两端类型相同。所有关系使用 sourceId、targetId。
- 扩展点通过基础用例 extensionPoints 的 id、name 保存；extend 的 extensionPointIds 引用目标基础用例的扩展点，condition 说明扩展条件。
- 用例保留 goal、preconditions、postconditions、primaryActorId、supportingActorIds 和 eventFlows；不要把结构化事件流压进连线文字。

## 依据

语义以 [OMG UML 2.5.1](https://www.omg.org/spec/UML/2.5.1) 为准；绘图记法参考 [PlantUML 用例文档](https://plantuml.com/use-case-diagram)。
