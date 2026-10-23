<!-- 指导以原生消息、组合片段与激活区间表达业务交互。 -->
# UML 时序模型

## 交互语义

- 每张图对应一个已确认业务场景。participants 区分角色、边界、服务、实体等真实职责，不虚构设计层次。
- messages 按因果顺序排列，name 表达调用职责；type 使用 sync、async、return、create、destroy。返回方向与调用相反，失败不能画为成功返回。
- alt 表达互斥路径，opt 表达可选执行，loop 表达重复，par 表达并发；不要将成功与失败串成同一条无条件轨迹。

## 平台映射

- 使用 participants、messages、fragments，可选 activations；消息端点为 sourceId、targetId，parameters 为参数列表。
- 每个片段有 id、type、label、messageIds。alt/par 使用 branches，每个分支有 id、label、messageIds，可用 condition 写守卫。opt/loop 在片段 condition 表达执行条件。
- messageIds 沿消息数组顺序引用连续区间；父片段覆盖子片段，嵌套时填写 parentFragmentId 和所属 parentBranchId。不要交叉重叠片段或重复消费消息；允许合法的空 else 分支。
- activations 用 participantId、startMessageId、endMessageId 表达生命周期内激活区间；创建前和销毁后不能继续普通交互。结构错误由共用语义校验拒绝，不能靠文本模拟。
- 保留已有消息、片段及分支 ID；局部修改必须同步修正涉及的区间和引用。只修改本图，不要求来源用例编号或依赖审核。

## 依据

语义参考 [OMG UML 2.5.1](https://www.omg.org/spec/UML/2.5.1)，记法对照 [PlantUML 时序文档](https://plantuml.com/sequence-diagram)。
