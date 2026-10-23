<!-- 指导设计类、接口、枚举及关系端点的标准语义。 -->
# UML 类模型

## 语义

- 设计类表示有共同特征的对象分类，属性说明状态，操作说明职责。类型、可见性、参数和返回值应有设计依据，不为完整度机械附加 CRUD。
- inheritance 从子类指向父类；implementation 从实现类指向接口；dependency 表达使用关系，不能冒充对象间稳定关联。
- composition 表达强整体部分关系，aggregation 表达共享聚合；菱形位于 sourceId 所在整体端，targetId 为部分。没有整体部分含义就用 association。
- sourceMultiplicity 表示一个目标实例关联的源实例数量，targetMultiplicity 反之；navigability 单独表达可导航方向。

## 平台映射

- 使用 classes、interfaces、enums、relationships；类可用 isAbstract，属性可用 isStatic，操作可用 isStatic/isAbstract。
- attributes 使用 name、type、visibility、constraints，可选 multiplicity/defaultValue；operations 使用 name、visibility、parameters，可选 returnType。parameters 记录 name、type 和可选 direction。
- 接口 operations 与类操作结构一致；枚举 literals 为字面量列表。所有端点及成员必须保留，不能压成 fields/methods 文本。
- 关系支持 association、inheritance、implementation、dependency、composition、aggregation；多重性、角色名、可导航性按各自字段保存。
- 共用结构校验检查引用及关系合法性；业务生命周期、职责划分仍需依据需求推敲，不将可渲染等同完整 UML 合规认证。

## 依据

语义以 [OMG UML 2.5.1](https://www.omg.org/spec/UML/2.5.1) 为准，记法参考 [PlantUML 类图](https://plantuml.com/class-diagram)。
