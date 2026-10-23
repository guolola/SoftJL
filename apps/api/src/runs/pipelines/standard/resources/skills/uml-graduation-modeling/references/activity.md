<!-- 指导具有责任泳道、控制流和对象流的业务活动模型。 -->
# UML 活动模型

## 业务表达

- 每张图聚焦指定业务，从触发到明确完成或失败，覆盖主路径和关键异常。动作用动宾名称，判断写清业务条件。
- 判断出边 guard 尽量互斥并覆盖业务情况；失败路径有明确结束或有依据的重试回路。
- 泳道表达执行责任。人员动作归对应角色，系统校验、保存和通知归系统；不要为了填满泳道编造操作。

## 平台映射

- 使用 swimlanes、nodes、relationships；动作类型为 activity，actorOrLane 引用泳道。生成任务提供 system 和 role_<角色ID> 时沿用这些标识。
- 节点支持 start、end、activity、decision、merge、fork、join、object、flow_final。decision 是选择，merge 是互斥路径汇合，fork/join 是并发分叉与同步，不能互相冒充。
- control_flow 连接控制节点，object_flow 表达数据传递，可引用动作的 inputPins/outputPins。object 记录 dataType 与 state；引脚有独立 id、name、dataType。
- 起点无入控制流，活动终点无出控制流；从起点覆盖业务动作并到达活动终点或合法 flow_final。并发分支需要正确汇合；对象节点及引脚不当作普通控制流步骤。
- 普通控制流程优先使用共用原生活动泳道渲染；需要对象流、引脚或复杂控制图时由共用渲染器选择适合记法，不自行输出绘图代码。

## 依据

语义参考 [OMG UML 2.5.1](https://www.omg.org/spec/UML/2.5.1)，记法参考 [PlantUML 活动文档](https://plantuml.com/activity-diagram-beta)。
